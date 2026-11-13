import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { afterEach, test } from 'node:test';

import { handleWebhook, PaymentError, PLANS, startPayment } from '../src/payments.ts';
import type { Env } from '../src/types.ts';
import { d1 } from './d1.ts';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-11-13T10:00:00Z');
const env = { NOHA_GATEWAY_URL: 'https://pay.example.test/', NOHA_MERCHANT_ID: 'merchant-1', NOHA_WEBHOOK_SECRET: 'whsec-test' } as Env;

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

function signed(body: object, opts: { secret?: string; at?: number } = {}) {
  const raw = JSON.stringify(body);
  const sig = 'sha256=' + createHmac('sha256', opts.secret ?? env.NOHA_WEBHOOK_SECRET!).update(raw).digest('hex');
  return { raw, headers: new Headers({ 'x-gateway-signature': sig, 'x-gateway-timestamp': String(opts.at ?? NOW) }) };
}

async function order(db: D1Database, plan: 'week' | 'month' = 'week', user = 'user-1') {
  gateway({ json: { checkoutUrl: 'https://pay.example.test/c/1', paymentId: 'gw-1' } });
  const { orderId } = await startPayment(env, db, user, plan, 'https://kosmik.test', NOW);
  globalThis.fetch = realFetch;
  return orderId;
}

const premium = (raw: ReturnType<typeof d1>['raw'], user = 'user-1') => (raw.prepare('SELECT until FROM premium WHERE user_id = ?').get(user) as { until: number } | undefined)?.until;
const status = (raw: ReturnType<typeof d1>['raw'], id: string) => ({ ...(raw.prepare('SELECT status, utr, note FROM payments WHERE id = ?').get(id) as { status: string; utr: string | null; note: string | null }) });

test('start: creates a pending order and asks the gateway for a checkout with the exact amount', async () => {
  const { db, raw } = d1();
  const calls = gateway({ json: { checkoutUrl: 'https://pay.example.test/c/abc', paymentId: 'gw-9' } });
  const r = await startPayment(env, db, 'user-1', 'month', 'https://kosmik.test', NOW);
  assert.equal(r.checkoutUrl, 'https://pay.example.test/c/abc');
  assert.equal(calls[0].url, 'https://pay.example.test/api/v1/payments');
  assert.equal(calls[0].headers['x-merchant-id'], 'merchant-1');
  assert.deepEqual(calls[0].body, {
    orderId: r.orderId,
    amount: '101.00',
    currency: 'INR',
    returnUrl: `https://kosmik.test/premium?order=${r.orderId}`,
    metadata: { purpose: 'kosmik_premium', plan: 'month' },
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

test('webhook: a confirmed payment gives Premium once, however many times it is delivered', async () => {
  const { db, raw } = d1();
  const id = await order(db, 'week');
  const ev = signed({ event: 'SUCCESS', orderId: id, amount: '51.00', utr: '412345678901', paymentId: 'gw-1' });

  assert.deepEqual((await handleWebhook(env, db, ev.headers, ev.raw, NOW)).body, { ok: true });
  assert.equal(premium(raw), NOW + PLANS.week.days * DAY);
  assert.deepEqual(status(raw, id), { status: 'paid', utr: '412345678901', note: null });

  const again = await handleWebhook(env, db, ev.headers, ev.raw, NOW + 1000);
  assert.equal(again.body.duplicate, true);
  assert.equal(premium(raw), NOW + 7 * DAY, 'not extended twice');
});

test('webhook: a second purchase extends from the current end date, not from today', async () => {
  const { db, raw } = d1();
  const first = await order(db, 'week');
  const a = signed({ event: 'SUCCESS', orderId: first, amountPaise: 5100 });
  await handleWebhook(env, db, a.headers, a.raw, NOW);
  const second = await order(db, 'month');
  const b = signed({ event: 'SUCCESS', orderId: second, amountPaise: 10100 }, { at: NOW + DAY });
  await handleWebhook(env, db, b.headers, b.raw, NOW + DAY);
  assert.equal(premium(raw), NOW + 7 * DAY + 30 * DAY);

  // An expired pass restarts from the payment date.
  const third = await order(db, 'week');
  const later = NOW + 90 * DAY;
  const c = signed({ event: 'SUCCESS', orderId: third, amountPaise: 5100 }, { at: later });
  await handleWebhook(env, db, c.headers, c.raw, later);
  assert.equal(premium(raw), later + 7 * DAY);
});

test('webhook: wrong amount, bad signature, wrong secret and stale deliveries are refused', async () => {
  const { db, raw } = d1();
  const id = await order(db, 'month');

  const short = signed({ event: 'SUCCESS', orderId: id, amount: '51.00', utr: '999' });
  assert.equal((await handleWebhook(env, db, short.headers, short.raw, NOW)).body.ignored, 'amount mismatch');
  assert.equal(premium(raw), undefined);
  assert.deepEqual(status(raw, id), { status: 'failed', utr: '999', note: 'amount mismatch: expected 10100, got 5100' });

  const id2 = await order(db, 'week');
  const good = { event: 'SUCCESS', orderId: id2, amount: '51.00' };
  const forged = signed(good, { secret: 'not-the-secret' });
  assert.equal((await handleWebhook(env, db, forged.headers, forged.raw, NOW)).status, 401);
  const tampered = signed(good);
  assert.equal((await handleWebhook(env, db, tampered.headers, tampered.raw.replace('51.00', '0.01'), NOW)).status, 401);
  const old = signed(good, { at: NOW - 20 * 60 * 1000 });
  assert.equal((await handleWebhook(env, db, old.headers, old.raw, NOW)).status, 400);
  assert.equal((await handleWebhook({} as Env, db, old.headers, old.raw, NOW)).status, 503);
  assert.equal(premium(raw), undefined);
  assert.equal(status(raw, id2).status, 'pending');
});

test('webhook: failures update pending orders only; unknown orders are ignored', async () => {
  const { db, raw } = d1();
  const id = await order(db);
  const failed = signed({ event: 'FAILED', orderId: id });
  await handleWebhook(env, db, failed.headers, failed.raw, NOW);
  assert.equal(status(raw, id).status, 'failed');

  const paid = await order(db);
  const ok = signed({ event: 'SUCCESS', orderId: paid, amount: '51.00' });
  await handleWebhook(env, db, ok.headers, ok.raw, NOW);
  const late = signed({ event: 'EXPIRED', orderId: paid });
  await handleWebhook(env, db, late.headers, late.raw, NOW);
  assert.equal(status(raw, paid).status, 'paid', 'a late EXPIRED never undoes a payment');

  const unknown = signed({ event: 'SUCCESS', orderId: crypto.randomUUID(), amount: '51.00' });
  assert.equal((await handleWebhook(env, db, unknown.headers, unknown.raw, NOW)).body.ignored, 'unknown order');
  const notOurs = signed({ event: 'SUCCESS', orderId: 'PP-1042', amount: '51.00' });
  assert.equal((await handleWebhook(env, db, notOurs.headers, notOurs.raw, NOW)).body.ignored, 'not a Kosmik order');
});

test('status: only the owner sees a payment, and an expired Premium reads as none', async () => {
  const { paymentStatus } = await import('../src/payments.ts');
  const { db } = d1();
  const id = await order(db, 'week');
  const ev = signed({ event: 'SUCCESS', orderId: id, amount: '51.00' });
  await handleWebhook(env, db, ev.headers, ev.raw, NOW);
  assert.deepEqual(await paymentStatus(db, 'user-1', id, NOW), { status: 'paid', plan: 'week', premiumUntil: NOW + 7 * DAY });
  assert.equal(await paymentStatus(db, 'someone-else', id, NOW), null);
  assert.equal((await paymentStatus(db, 'user-1', id, NOW + 8 * DAY))?.premiumUntil, null);
});
