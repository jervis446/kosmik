import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { afterEach, test } from 'node:test';

import { approvePayment, declinePayment, handleWebhook, ORDER_ID, PaymentError, paymentStatus, paymentsForReview, PLANS, startPayment, unblockPayer } from '../src/payments.ts';
import type { Env } from '../src/types.ts';
import { d1 } from './d1.ts';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-11-13T10:00:00Z');
const KEY = 'merchant-key-test';
const env = { NOHA_GATEWAY_URL: 'https://pay.example.test/', NOHA_MERCHANT_ID: 'merchant-1', NOHA_MERCHANT_KEY: KEY } as Env;

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function gateway(reply: { status?: number; json?: unknown } | 'down') {
  const calls: { url: string; headers: Record<string, string>; body: Record<string, unknown> }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(init.body as string) });
    if (reply === 'down') throw new Error('connection refused');
    return new Response(JSON.stringify(reply.json ?? {}), { status: reply.status ?? 200 });
  }) as typeof fetch;
  return calls;
}

/** A delivery as YouPI sends it: V2 signs "<timestamp>.<body>", V1 signs the body. */
function signed(body: object, opts: { secret?: string; at?: number; v1?: boolean } = {}) {
  const raw = JSON.stringify(body);
  const at = String(opts.at ?? NOW);
  const mac = (data: string) => 'sha256=' + createHmac('sha256', opts.secret ?? KEY).update(data).digest('hex');
  const headers = new Headers({ 'x-gateway-timestamp': at });
  if (opts.v1) headers.set('x-gateway-signature', mac(raw));
  else headers.set('x-gateway-signature-v2', mac(`${at}.${raw}`));
  return { raw, headers };
}

/** The Premium a pack buyer already has in these tests (packs are for Premium members). */
const PACK_PREMIUM = NOW + 1000;

async function order(db: D1Database, plan: 'week' | 'month' | 'r1' | 'r3' | 'r10' = 'week', user = 'user-1') {
  // Report packs are for Premium members.
  if (plan.startsWith('r')) await db.prepare('INSERT OR IGNORE INTO premium (user_id, until) VALUES (?, ?)').bind(user, PACK_PREMIUM).run();
  gateway({ json: { checkoutUrl: 'https://pay.example.test/c/1', paymentId: 'gw-1' } });
  const { orderId } = await startPayment(env, db, user, plan, 'https://kosmik.test', NOW);
  globalThis.fetch = realFetch;
  return orderId;
}

type Raw = ReturnType<typeof d1>['raw'];
const premium = (raw: Raw, user = 'user-1') => (raw.prepare('SELECT until FROM premium WHERE user_id = ?').get(user) as { until: number } | undefined)?.until;
const row = (raw: Raw, id: string) => ({ ...(raw.prepare('SELECT status, utr, note FROM payments WHERE id = ?').get(id) as { status: string; utr: string | null; note: string | null }) });
const paid = (orderId: string, paise: number, extra: object = {}) => ({ event: 'OBSERVED_SUCCESS', orderId, amountPaise: paise, method: 'UPI', utr: '4123-4567-8901', ...extra });

test('start: pending order, then a UPI checkout request exactly like People Pitchers sends', async () => {
  const { db, raw } = d1();
  const calls = gateway({ json: { checkoutUrl: 'https://pay.example.test/c/abc', paymentId: 'gw-9' } });
  const r = await startPayment(env, db, 'user-1', 'month', 'https://kosmik.test', NOW);
  assert.match(r.orderId, ORDER_ID);
  assert.equal(r.checkoutUrl, 'https://pay.example.test/c/abc');
  assert.equal(calls[0].url, 'https://pay.example.test/api/v1/payments');
  assert.equal(calls[0].headers['x-merchant-id'], 'merchant-1');
  assert.equal(calls[0].headers['x-merchant-key'], KEY);
  assert.equal(calls[0].headers['idempotency-key'], r.orderId);
  assert.deepEqual(calls[0].body, {
    orderId: r.orderId,
    amount: '101.00',
    currency: 'INR',
    method: 'UPI',
    returnUrl: `https://kosmik.test/premium?order=${r.orderId}`,
    metadata: { source: 'kosmik', plan: 'month' },
  });
  assert.deepEqual({ ...raw.prepare('SELECT status, amount_paise, days, gateway_payment_id FROM payments').get() }, { status: 'pending', amount_paise: 10100, days: 30, gateway_payment_id: 'gw-9' });
});

test('start: refuses when payments are off or the plan is unknown, and records a gateway failure', async () => {
  const { db, raw } = d1();
  await assert.rejects(startPayment({} as Env, db, 'u', 'week', 'https://k', NOW), (e: PaymentError) => e.status === 503);
  await assert.rejects(startPayment(env, db, 'u', 'year', 'https://k', NOW), (e: PaymentError) => e.status === 400);
  gateway('down');
  await assert.rejects(startPayment(env, db, 'u', 'week', 'https://k', NOW), (e: PaymentError) => e.status === 502);
  assert.equal((raw.prepare('SELECT status FROM payments').get() as { status: string }).status, 'failed');
});

test('webhook: the bank alert gives Premium once; a later RECONCILED and retries add nothing', async () => {
  const { db, raw } = d1();
  const id = await order(db, 'week');
  const ev = signed(paid(id, 5100));

  assert.deepEqual((await handleWebhook(env, db, ev.headers, ev.raw, NOW)).body, { received: true });
  assert.equal(premium(raw), NOW + PLANS.week.days * DAY);
  assert.deepEqual(row(raw, id), { status: 'paid', utr: '412345678901', note: 'Bank credit alert matched' });

  // YouPI retries with the original timestamp, days later.
  assert.equal((await handleWebhook(env, db, ev.headers, ev.raw, NOW + 3 * DAY)).body.duplicate, true);
  const rec = signed(paid(id, 5100, { event: 'RECONCILED' }), { at: NOW + DAY });
  assert.equal((await handleWebhook(env, db, rec.headers, rec.raw, NOW + DAY)).body.duplicate, true);
  assert.equal(premium(raw), NOW + 7 * DAY, 'not extended twice');
  assert.equal(row(raw, id).note, 'Reconciled with the bank statement');
});

test('webhook: RECONCILED alone is enough, and V1 signatures are still accepted', async () => {
  const { db, raw } = d1();
  const id = await order(db, 'month');
  const ev = signed(paid(id, 10100, { event: 'RECONCILED' }), { v1: true });
  assert.deepEqual((await handleWebhook(env, db, ev.headers, ev.raw, NOW)).body, { received: true });
  assert.equal(premium(raw), NOW + 30 * DAY);
});

test('webhook: a second purchase extends from the current end date; an expired pass restarts', async () => {
  const { db, raw } = d1();
  const a = signed(paid(await order(db, 'week'), 5100));
  await handleWebhook(env, db, a.headers, a.raw, NOW);
  const b = signed(paid(await order(db, 'month'), 10100), { at: NOW + DAY });
  await handleWebhook(env, db, b.headers, b.raw, NOW + DAY);
  assert.equal(premium(raw), NOW + 7 * DAY + 30 * DAY);

  const later = NOW + 90 * DAY;
  const c = signed(paid(await order(db, 'week'), 5100), { at: later });
  await handleWebhook(env, db, c.headers, c.raw, later);
  assert.equal(premium(raw), later + 7 * DAY);
});

test('webhook: never paid for a wrong amount, cash or a non-UPI method; a payer-typed UTR stays pending', async () => {
  const { db, raw } = d1();
  const short = await order(db, 'month');
  const s = signed(paid(short, 5100));
  assert.equal((await handleWebhook(env, db, s.headers, s.raw, NOW)).body.mismatch, true);
  assert.deepEqual(row(raw, short), { status: 'failed', utr: '412345678901', note: 'Amount mismatch on OBSERVED_SUCCESS: expected 10100 paise, got 5100' });

  const cash = await order(db);
  const c = signed({ event: 'SUCCESS', orderId: cash, amountPaise: 5100 });
  await handleWebhook(env, db, c.headers, c.raw, NOW);
  assert.equal(row(raw, cash).status, 'pending');

  const card = await order(db);
  const k = signed(paid(card, 5100, { method: 'CARD' }));
  await handleWebhook(env, db, k.headers, k.raw, NOW);
  assert.equal(row(raw, card).status, 'pending');

  assert.equal(premium(raw), undefined);

  // A payer-typed UTR is not proof: the order stays pending until the owner or the bank confirms it
  // (access is given meanwhile; see the manual UPI tests below).
  const claimed = await order(db);
  const m = signed({ event: 'MANUAL_REVIEW', orderId: claimed, utr: '999888777666' });
  await handleWebhook(env, db, m.headers, m.raw, NOW);
  assert.equal(row(raw, claimed).status, 'pending');
});

test('webhook: forged, tampered, stale, future and unconfigured deliveries are refused', async () => {
  const { db, raw } = d1();
  const id = await order(db, 'week');
  const body = paid(id, 5100);
  const call = (e: ReturnType<typeof signed>, now = NOW, en = env, rawBody = e.raw) => handleWebhook(en, db, e.headers, rawBody, now);

  assert.equal((await call(signed(body, { secret: 'not-the-key' }))).status, 401);
  const t = signed(body);
  assert.equal((await call(t, NOW, env, t.raw.replace('5100', '1'))).status, 401);
  // Re-signing V2 with a new timestamp needs the secret: changing only the header fails.
  const moved = signed(body);
  moved.headers.set('x-gateway-timestamp', String(NOW + 1));
  assert.equal((await call(moved)).status, 401);
  assert.equal((await call(signed(body, { at: NOW - 8 * DAY }))).status, 401);
  assert.equal((await call(signed(body, { at: NOW + 10 * 60 * 1000 }))).status, 401);
  assert.equal((await call(signed(body), NOW, {} as Env)).status, 503);
  assert.equal(premium(raw), undefined);
  assert.equal(row(raw, id).status, 'pending');

  // A separate webhook secret, when set, is the one that counts.
  const split = { ...env, NOHA_WEBHOOK_SECRET: 'whsec-other' } as Env;
  assert.equal((await call(signed(body), NOW, split)).status, 401);
  assert.equal((await call(signed(body, { secret: 'whsec-other' }), NOW, split)).status, 200);
});

test('webhook: failures update pending orders only; other merchants’ and unknown orders are ignored', async () => {
  const { db, raw } = d1();
  const id = await order(db);
  const f = signed({ event: 'FAILED', orderId: id });
  await handleWebhook(env, db, f.headers, f.raw, NOW);
  assert.equal(row(raw, id).status, 'failed');

  const done = await order(db);
  const ok = signed(paid(done, 5100));
  await handleWebhook(env, db, ok.headers, ok.raw, NOW);
  const late = signed({ event: 'EXPIRED', orderId: done });
  await handleWebhook(env, db, late.headers, late.raw, NOW);
  assert.equal(row(raw, done).status, 'paid', 'a late EXPIRED never undoes a payment');

  const unknown = signed(paid('KM-ABCDEFGHJKLM', 5100));
  assert.equal((await handleWebhook(env, db, unknown.headers, unknown.raw, NOW)).body.ignored, 'unknown order');
  const pp = signed(paid('PP-ABCDEFGHJKLM', 5100));
  assert.equal((await handleWebhook(env, db, pp.headers, pp.raw, NOW)).body.ignored, 'not a Kosmik order');
});

test('status: only the owner sees a payment, and an expired Premium reads as none', async () => {
  const { db } = d1();
  const id = await order(db, 'week');
  const ev = signed(paid(id, 5100));
  await handleWebhook(env, db, ev.headers, ev.raw, NOW);
  assert.deepEqual(await paymentStatus(db, 'user-1', id, NOW), { status: 'paid', plan: 'week', premiumUntil: NOW + 7 * DAY });
  assert.equal(await paymentStatus(db, 'someone-else', id, NOW), null);
  assert.equal((await paymentStatus(db, 'user-1', id, NOW + 8 * DAY))?.premiumUntil, null);
});

test('report packs: a paid pack adds its credits once and leaves Premium alone', async () => {
  const { db, raw } = d1();
  const id = await order(db, 'r3');
  const first = signed(paid(id, 24900));
  assert.equal((await handleWebhook(env, db, first.headers, first.raw, NOW)).status, 200);
  const again = signed(paid(id, 24900, { event: 'RECONCILED' }));
  await handleWebhook(env, db, again.headers, again.raw, NOW + 1000);
  assert.deepEqual({ ...raw.prepare('SELECT credits FROM report_credits WHERE user_id = ?').get('user-1') }, { credits: 3 });
  assert.equal((raw.prepare('SELECT until FROM premium WHERE user_id = ?').get('user-1') as { until: number }).until, PACK_PREMIUM, 'Premium days are unchanged');
});

test('test order: ₹1 for one report credit, applied like any pack', async () => {
  const { db, raw } = d1();
  gateway({ json: { checkoutUrl: 'https://pay.example.test/c/t', paymentId: 'gw-t' } });
  const { orderId } = await startPayment(env, db, 'admin-1', 'r1', 'https://kosmik.test', NOW, { test: true });
  globalThis.fetch = realFetch;
  assert.deepEqual({ ...raw.prepare('SELECT amount_paise, credits FROM payments WHERE id = ?').get(orderId) }, { amount_paise: 100, credits: 1 });
  const ev = signed(paid(orderId, 100));
  await handleWebhook(env, db, ev.headers, ev.raw, NOW);
  assert.deepEqual({ ...raw.prepare('SELECT credits FROM report_credits WHERE user_id = ?').get('admin-1') }, { credits: 1 });
});

const review = (orderId: string, utr: string, extra: object = {}) => ({ event: 'MANUAL_REVIEW', orderId, amountPaise: 24900, method: 'MANUAL_UPI', utr, ...extra });
const creditsOf = (raw: ReturnType<typeof d1>['raw'], user = 'user-1') => (raw.prepare('SELECT credits FROM report_credits WHERE user_id = ?').get(user) as { credits: number } | undefined)?.credits ?? 0;

test('manual UPI: a valid UTR gives access at once; a reused or malformed one gives nothing; the bank match adds nothing more', async () => {
  const { db, raw } = d1();
  const a = await order(db, 'r3');
  let ev = signed(review(a, '412345678901'));
  assert.deepEqual((await handleWebhook(env, db, ev.headers, ev.raw, NOW)).body, { received: true, provisional: true });
  assert.equal(creditsOf(raw), 3);
  assert.equal((await paymentStatus(db, 'user-1', a, NOW))?.status, 'provisional');
  assert.equal((await paymentsForReview(db)).toCheck.length, 1);

  // The same UTR on another order: no access.
  const b = await order(db, 'r3');
  ev = signed(review(b, '4123-4567-8901'));
  await handleWebhook(env, db, ev.headers, ev.raw, NOW);
  assert.equal(creditsOf(raw), 3);
  assert.match(String((raw.prepare('SELECT note FROM payments WHERE id = ?').get(b) as { note: string }).note), /already used/);

  // Not a 12-digit UTR: no access.
  const c = await order(db, 'r1');
  ev = signed(review(c, 'ABC123'));
  await handleWebhook(env, db, ev.headers, ev.raw, NOW);
  assert.equal(creditsOf(raw), 3);

  // The bank statement matches the first one later: confirmed, nothing added twice.
  ev = signed(paid(a, 24900, { event: 'RECONCILED', utr: '412345678901' }));
  await handleWebhook(env, db, ev.headers, ev.raw, NOW + 1000);
  assert.equal(creditsOf(raw), 3);
  assert.deepEqual({ ...raw.prepare('SELECT status, reviewed FROM payments WHERE id = ?').get(a) }, { status: 'paid', reviewed: 'approved' });
  assert.equal((await paymentsForReview(db)).toCheck.length, 0);
});

test('manual UPI: declining takes the access back (credits, then reports opened with them; Premium days), and five declines block buying', async () => {
  const { db, raw } = d1();
  // A pack whose credits were partly spent on a report.
  const a = await order(db, 'r3');
  let ev = signed(review(a, '400000000001'));
  await handleWebhook(env, db, ev.headers, ev.raw, NOW);
  raw.prepare('UPDATE report_credits SET credits = 1 WHERE user_id = ?').run('user-1');
  raw.prepare("INSERT INTO reports (user_id, report_key, lang, content, created_at) VALUES ('user-1', 'career', 'en', '{}', ?), ('user-1', 'marriage', 'en', '{}', ?)").run(NOW + 10, NOW + 20);
  assert.deepEqual(await declinePayment(db, a, NOW + 100), { declined: true, blocked: false });
  assert.equal(creditsOf(raw), 0);
  assert.equal((raw.prepare('SELECT COUNT(*) AS n FROM reports').get() as { n: number }).n, 0, 'both reports opened with those credits are locked again');

  // Premium days are taken off again.
  const w = await order(db, 'week');
  ev = signed(review(w, '400000000002', { amountPaise: 5100 }));
  await handleWebhook(env, db, ev.headers, ev.raw, NOW);
  assert.ok(((raw.prepare('SELECT until FROM premium WHERE user_id = ?').get('user-1') as { until: number }).until) > NOW + 6 * DAY);
  await declinePayment(db, w, NOW + 200);
  assert.ok(((raw.prepare('SELECT until FROM premium WHERE user_id = ?').get('user-1') as { until: number }).until) <= PACK_PREMIUM, 'back to the Premium they had before');

  // Three more declines (five in all): blocked from buying.
  let last = { declined: false, blocked: false };
  for (let i = 3; i <= 5; i++) {
    const o = await order(db, 'r1');
    ev = signed(review(o, `40000000000${i}`, { amountPaise: 9900 }));
    await handleWebhook(env, db, ev.headers, ev.raw, NOW);
    last = await declinePayment(db, o, NOW + 300 + i);
  }
  assert.equal(last.blocked, true);
  gateway({ json: { checkoutUrl: 'https://pay.example.test/c/x' } });
  await assert.rejects(startPayment(env, db, 'user-1', 'r1', 'https://kosmik.test', NOW + 400), (e: unknown) => e instanceof PaymentError && e.status === 403);
  globalThis.fetch = realFetch;
  assert.equal((await paymentsForReview(db)).blocked.length, 1);

  // Unblocked: can buy again.
  assert.equal(await unblockPayer(db, 'user-1', NOW + 500), true);
  gateway({ json: { checkoutUrl: 'https://pay.example.test/c/y', paymentId: 'gw-y' } });
  const again = await startPayment(env, db, 'user-1', 'r1', 'https://kosmik.test', NOW + 600);
  globalThis.fetch = realFetch;
  assert.match(again.orderId, ORDER_ID);
  assert.equal(await approvePayment(db, again.orderId, NOW + 700), false, 'only orders with access given can be approved');
});

test('report packs need Premium: a free account cannot buy one', async () => {
  const { db, raw } = d1();
  await assert.rejects(startPayment(env, db, 'free-1', 'r3', 'https://kosmik.test', NOW), (e: unknown) => e instanceof PaymentError && e.status === 403 && /Premium/.test(e.message));
  assert.equal(raw.prepare('SELECT count(*) AS n FROM payments').get().n, 0, 'no order is created');
  // Once Premium has run out, packs are closed again.
  await db.prepare('INSERT INTO premium (user_id, until) VALUES (?, ?)').bind('free-1', NOW - 1).run();
  await assert.rejects(startPayment(env, db, 'free-1', 'r1', 'https://kosmik.test', NOW), (e: unknown) => e instanceof PaymentError && e.status === 403);
});
