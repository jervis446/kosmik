/**
 * Kosmik Premium through Noha Pay, Asanoha's UPI gateway (YouPI PG). The customer pays by UPI
 * straight into the merchant's account; nobody in between holds the money. Matches the live
 * integration in People Pitchers (supabase/functions/create-checkout and youpi-webhook).
 *
 *   POST /api/pay              { plan }  signed in → creates an order, returns the checkout URL
 *   GET  /api/pay/:id          signed in → the order's status and Premium end date
 *   POST /api/pay/webhook      gateway → verifies the signature and applies the event
 *
 * Gateway events: OBSERVED_SUCCESS (the bank's credit alert matched), RECONCILED (a bank-statement
 * line matched), MANUAL_REVIEW (the payer entered a UTR; not proof), SUCCESS (cash/counter; not
 * accepted), FAILED, EXPIRED, CANCELLED. Premium starts on the first OBSERVED_SUCCESS or
 * RECONCILED for the exact amount paid by UPI, and only once per order.
 *
 * Premium is a pass for a number of days, not a subscription: UPI payments don't renew on their own.
 */
import { sha256 } from './lib/text.ts';
import type { Env } from './types.ts';

export type PlanId = 'week' | 'month' | 'r1' | 'r3' | 'r10';
/** Premium passes (days of unlimited questions). */
export const PLANS: Record<'week' | 'month', { name: string; amountPaise: number; days: number }> = {
  week: { name: 'Premium · 7 days', amountPaise: 5100, days: 7 },
  month: { name: 'Premium · 30 days', amountPaise: 10100, days: 30 },
};
/** Report packs: each credit unlocks one report, kept for good. */
export const PACKS: Record<'r1' | 'r3' | 'r10', { name: string; amountPaise: number; credits: number }> = {
  r1: { name: '1 report', amountPaise: 9900, credits: 1 },
  r3: { name: '3 reports', amountPaise: 24900, credits: 3 },
  r10: { name: '10 reports', amountPaise: 69900, credits: 10 },
};
const isPack = (p: string): p is keyof typeof PACKS => p in PACKS;

const DAY_MS = 24 * 60 * 60 * 1000;
/** The gateway retries a delivery for days with its original timestamp; older ones are refused. */
const MAX_AGE_MS = 7 * DAY_MS;
const MAX_FUTURE_MS = 5 * 60 * 1000;
/** Kosmik order ids: "KM-" and 12 letters/digits (People Pitchers uses "PP-"). */
export const ORDER_ID = /^KM-[A-Z0-9]{12}$/;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function newOrderId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return 'KM-' + [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
}

/** The merchant key authenticates checkout requests and signs webhooks, unless a separate webhook secret is set. */
const webhookSecret = (env: Env) => env.NOHA_WEBHOOK_SECRET || env.NOHA_MERCHANT_KEY || '';

export class PaymentError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export const paymentsEnabled = (env: Env) => !!(env.NOHA_GATEWAY_URL && env.NOHA_MERCHANT_ID && env.NOHA_MERCHANT_KEY);

export type Payment = { id: string; user_id: string; plan: PlanId; amount_paise: number; days: number; credits: number; status: string; paid_at: number | null; provisional_at?: number | null; reviewed?: string | null; utr?: string | null; created_at?: number };

/** Declined payments that block an account from buying. */
export const BLOCK_AFTER = 5;

export async function isBlocked(db: D1Database, userId: string): Promise<boolean> {
  return !!(await db.prepare('SELECT 1 FROM payment_blocks WHERE user_id = ? AND unblocked_at IS NULL').bind(userId).first());
}

/** What a paid (or provisionally accepted) order gives: report credits or Premium days. Runs only if the statement before it changed a row. */
function grant(db: D1Database, order: Payment, now: number): D1PreparedStatement {
  return isPack(order.plan)
    ? db
        .prepare(
          `INSERT INTO report_credits (user_id, credits) SELECT ?, ? WHERE changes() = 1
           ON CONFLICT (user_id) DO UPDATE SET credits = report_credits.credits + excluded.credits`,
        )
        .bind(order.user_id, order.credits)
    : db
        .prepare(
          `INSERT INTO premium (user_id, until) SELECT ?, ? + ? WHERE changes() = 1
           ON CONFLICT (user_id) DO UPDATE SET until = MAX(premium.until, ?) + ?`,
        )
        .bind(order.user_id, now, order.days * DAY_MS, now, order.days * DAY_MS);
}

/** Starts a checkout. returnBase is this site's origin; the gateway sends the customer back there. */
/** opts.test (admins only): a ₹1 order for one report credit, to try the whole payment path for real. */
export async function startPayment(env: Env, db: D1Database, userId: string, plan: unknown, returnBase: string, now: number, opts: { test?: boolean } = {}): Promise<{ orderId: string; checkoutUrl: string }> {
  if (!paymentsEnabled(env)) throw new PaymentError('Premium payments open soon.', 503);
  if (await isBlocked(db, userId)) throw new PaymentError('Payments are not available for this account. Please contact us from Help.', 403);
  if (plan !== 'week' && plan !== 'month' && !(typeof plan === 'string' && isPack(plan))) throw new PaymentError('Choose a plan.', 400);
  const p = isPack(plan) ? { ...PACKS[plan], days: 0 } : { ...PLANS[plan], credits: 0 };
  if (opts.test && plan === 'r1') p.amountPaise = 100;
  const id = newOrderId();
  await db
    .prepare('INSERT INTO payments (id, user_id, plan, amount_paise, days, credits, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, userId, plan, p.amountPaise, p.days, p.credits, now)
    .run();

  let netError = '';
  const res = await fetch(`${env.NOHA_GATEWAY_URL!.replace(/\/+$/, '')}/api/v1/payments`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-merchant-id': env.NOHA_MERCHANT_ID!, 'x-merchant-key': env.NOHA_MERCHANT_KEY!, 'idempotency-key': id },
    body: JSON.stringify({
      orderId: id,
      amount: (p.amountPaise / 100).toFixed(2),
      currency: 'INR',
      method: env.NOHA_METHOD === 'MANUAL_UPI' ? 'MANUAL_UPI' : 'UPI',
      returnUrl: `${returnBase}${isPack(plan) ? '/reports' : '/premium'}?order=${id}`,
      metadata: { source: 'kosmik', plan },
    }),
    signal: AbortSignal.timeout(15_000),
  }).catch((e: unknown) => {
    netError = e instanceof Error ? e.message : String(e);
    return null;
  });
  const body = res ? ((await res.json().catch(() => ({}))) as { checkoutUrl?: string; paymentId?: string; error?: unknown; message?: unknown; code?: unknown }) : null;
  const pay = res?.ok ? body : null;
  if (!pay?.checkoutUrl) {
    // Keep the gateway's own reason with the order, so a failure can be traced from Payments.
    const why = !res
      ? `gateway not reachable (${netError.slice(0, 200)})`
      : `HTTP ${res.status}: ${String(body?.error ?? body?.message ?? body?.code ?? 'no checkout link').slice(0, 300)}`;
    console.error('noha checkout failed', id, why);
    await db.prepare("UPDATE payments SET status = 'failed', note = ? WHERE id = ?").bind(`checkout not created: ${why}`, id).run();
    throw new PaymentError('The payment page couldn’t be opened. Please try again.', 502);
  }
  if (pay.paymentId) await db.prepare('UPDATE payments SET gateway_payment_id = ? WHERE id = ?').bind(pay.paymentId, id).run();
  return { orderId: id, checkoutUrl: pay.checkoutUrl };
}

export async function paymentStatus(db: D1Database, userId: string, id: string, now: number): Promise<{ status: string; plan: PlanId; premiumUntil: number | null } | null> {
  const row = await db.prepare('SELECT status, plan, provisional_at FROM payments WHERE id = ? AND user_id = ?').bind(id, userId).first<{ status: string; plan: PlanId; provisional_at: number | null }>();
  if (!row) return null;
  // Access given on the payer's UTR while the owner checks the bank statement.
  const status = row.status === 'pending' && row.provisional_at ? 'provisional' : row.status;
  return { status, plan: row.plan, premiumUntil: await premiumUntil(db, userId, now) };
}

/** When the user's Premium ends, or null if they don't have it (or it has run out). */
export async function premiumUntil(db: D1Database, userId: string, now: number): Promise<number | null> {
  const until = (await db.prepare('SELECT until FROM premium WHERE user_id = ?').bind(userId).first<{ until: number }>())?.until ?? null;
  return until !== null && until > now ? until : null;
}

async function hmacHex(secret: string, data: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', key, data))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time comparison (of hashes, so the lengths always match). */
async function sameSecret(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([sha256(a), sha256(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

/** X-Gateway-Signature-V2 = HMAC(secret, "<timestamp>.<raw body>"); falls back to X-Gateway-Signature = HMAC(secret, raw body). */
async function validSignature(secret: string, headers: Headers, raw: Uint8Array): Promise<boolean> {
  const ts = headers.get('x-gateway-timestamp') ?? '';
  const v2 = headers.get('x-gateway-signature-v2') ?? '';
  const v1 = headers.get('x-gateway-signature') ?? '';
  if (v2 && /^\d{10,16}$/.test(ts)) {
    const signed = new Uint8Array([...new TextEncoder().encode(ts + '.'), ...raw]);
    return sameSecret(v2, 'sha256=' + (await hmacHex(secret, signed)));
  }
  return !!v1 && sameSecret(v1, 'sha256=' + (await hmacHex(secret, raw)));
}

type GatewayEvent = { event?: string; orderId?: string; amountPaise?: number; utr?: string; method?: string; paymentId?: string };

const cleanUtr = (u: unknown) => String(u ?? '').replace(/[^A-Za-z0-9]/g, '').slice(0, 40) || null;

/** Applies a gateway notification. Safe to receive the same delivery more than once. */
export async function handleWebhook(env: Env, db: D1Database, headers: Headers, rawBody: string, now: number): Promise<{ status: number; body: Record<string, unknown> }> {
  const secret = webhookSecret(env);
  if (!secret) return { status: 503, body: { error: 'not configured' } };
  if (!(await validSignature(secret, headers, new TextEncoder().encode(rawBody)))) return { status: 401, body: { error: 'invalid signature' } };
  const ts = Number(headers.get('x-gateway-timestamp'));
  if (!Number.isFinite(ts) || now - ts > MAX_AGE_MS || ts - now > MAX_FUTURE_MS) return { status: 401, body: { error: 'stale delivery' } };

  let ev: GatewayEvent;
  try {
    ev = JSON.parse(rawBody) as GatewayEvent;
  } catch {
    return { status: 400, body: { error: 'invalid JSON' } };
  }
  const event = String(ev.event ?? headers.get('x-gateway-event') ?? '').toUpperCase();
  const orderId = String(ev.orderId ?? '');
  if (!ORDER_ID.test(orderId)) return { status: 200, body: { ignored: 'not a Kosmik order' } };
  const order = await db.prepare('SELECT * FROM payments WHERE id = ?').bind(orderId).first<Payment>();
  if (!order) return { status: 200, body: { ignored: 'unknown order' } };
  const utr = cleanUtr(ev.utr);
  const note = (text: string) => db.prepare('UPDATE payments SET note = ? WHERE id = ?').bind(text.slice(0, 500), order.id).run();

  if (event === 'OBSERVED_SUCCESS' || event === 'RECONCILED') {
    if (!['UPI', 'MANUAL_UPI'].includes(String(ev.method ?? 'UPI').toUpperCase())) {
      await note(`Ignored ${event}: method ${String(ev.method).slice(0, 20)}`);
      return { status: 200, body: { received: true } };
    }
    if (order.status === 'paid') {
      if (event === 'RECONCILED') await note('Reconciled with the bank statement');
      return { status: 200, body: { received: true, duplicate: true } };
    }
    if (ev.amountPaise !== order.amount_paise) {
      // Never apply a different amount automatically: check it against the bank statement.
      await db
        .prepare("UPDATE payments SET status = 'failed', utr = ?, note = ? WHERE id = ? AND status != 'paid'")
        .bind(utr, `Amount mismatch on ${event}: expected ${order.amount_paise} paise, got ${String(ev.amountPaise).slice(0, 20)}`, order.id)
        .run();
      return { status: 200, body: { received: true, mismatch: true } };
    }
    const how = event === 'RECONCILED' ? 'Reconciled with the bank statement' : 'Bank credit alert matched';
    // Access already given on the payer's UTR: just confirm it, nothing more to add.
    if (order.provisional_at && order.status === 'pending') {
      await db
        .prepare("UPDATE payments SET status = 'paid', reviewed = 'approved', reviewed_at = ?, gateway_payment_id = COALESCE(?, gateway_payment_id), utr = COALESCE(?, utr), paid_at = ?, note = ? WHERE id = ? AND status = 'pending'")
        .bind(now, ev.paymentId ?? null, utr, now, how, order.id)
        .run();
      return { status: 200, body: { received: true } };
    }
    // Mark paid and give access together, and only if this delivery is the one that marked it.
    const [mark] = await db.batch([
      db
        .prepare("UPDATE payments SET status = 'paid', gateway_payment_id = COALESCE(?, gateway_payment_id), utr = ?, paid_at = ?, note = ? WHERE id = ? AND status != 'paid'")
        .bind(ev.paymentId ?? null, utr, now, how, order.id),
      grant(db, order, now),
    ]);
    return { status: 200, body: mark.meta.changes ? { received: true } : { received: true, duplicate: true } };
  }
  if (event === 'SUCCESS') {
    await note('Ignored SUCCESS: cash and counter payments are not accepted');
    return { status: 200, body: { received: true } };
  }
  if (event === 'MANUAL_REVIEW' && utr && order.status === 'pending') {
    // The payer typed a UTR. Not proof of payment, so the owner checks it against the bank statement
    // and approves or declines; meanwhile the payer gets access straight away, unless the UTR looks
    // wrong, was already used, or the account is blocked.
    const keep = (why: string) => db.prepare("UPDATE payments SET utr = ?, note = ? WHERE id = ? AND status = 'pending'").bind(utr, why, order.id).run();
    if (order.provisional_at) return { status: 200, body: { received: true, duplicate: true } };
    if (!/^\d{12}$/.test(utr)) {
      await keep(`Payer entered UTR ${utr}, which is not a 12-digit UPI reference. Check the bank statement.`);
      return { status: 200, body: { received: true } };
    }
    const reused = await db.prepare("SELECT id FROM payments WHERE utr = ? AND id != ? AND (status = 'paid' OR provisional_at IS NOT NULL)").bind(utr, order.id).first<{ id: string }>();
    if (reused) {
      await keep(`UTR ${utr} was already used on order ${reused.id}. No access given.`);
      return { status: 200, body: { received: true } };
    }
    if (await isBlocked(db, order.user_id)) {
      await keep(`Account is blocked after declined payments. UTR ${utr}: check before giving access.`);
      return { status: 200, body: { received: true } };
    }
    await db.batch([
      db
        .prepare("UPDATE payments SET utr = ?, provisional_at = ?, note = ? WHERE id = ? AND status = 'pending' AND provisional_at IS NULL")
        .bind(utr, now, `Access given on the payer's UTR ${utr}. Approve or decline after checking the bank statement.`, order.id),
      grant(db, order, now),
    ]);
    return { status: 200, body: { received: true, provisional: true } };
  }
  const status = event === 'FAILED' ? 'failed' : event === 'EXPIRED' ? 'expired' : event === 'CANCELLED' ? 'cancelled' : null;
  if (status) await db.prepare("UPDATE payments SET status = ? WHERE id = ? AND status = 'pending'").bind(status, order.id).run();
  else await note(`Gateway event: ${event.slice(0, 40)}`);
  return { status: 200, body: { received: true } };
}

// ---------------------------------------------------------------- the owner's review

export type ReviewRow = {
  id: string; userId: string; name: string | null; phone: string | null; plan: string; amountPaise: number; days: number; credits: number;
  status: string; utr: string | null; note: string | null; createdAt: number; provisionalAt: number | null; reviewed: string | null; declines: number;
};

/** Payments for the owner: the ones to check, the latest of all, and blocked accounts. */
export async function paymentsForReview(db: D1Database) {
  const cols = `p.id, p.user_id AS userId, pr.name AS name, ph.phone AS phone, p.plan, p.amount_paise AS amountPaise, p.days, p.credits, p.status, p.utr, p.note,
    p.created_at AS createdAt, p.provisional_at AS provisionalAt, p.reviewed,
    (SELECT COUNT(*) FROM payments d WHERE d.user_id = p.user_id AND d.reviewed = 'declined') AS declines`;
  const from = 'FROM payments p LEFT JOIN profiles pr ON pr.user_id = p.user_id LEFT JOIN phones ph ON ph.user_id = p.user_id';
  const toCheck = (await db.prepare(`SELECT ${cols} ${from} WHERE p.status = 'pending' AND p.provisional_at IS NOT NULL ORDER BY p.provisional_at`).all<ReviewRow>()).results;
  const recent = (await db.prepare(`SELECT ${cols} ${from} ORDER BY p.created_at DESC LIMIT 60`).all<ReviewRow>()).results;
  const blocked = (
    await db
      .prepare(
        `SELECT b.user_id AS userId, pr.name AS name, ph.phone AS phone, b.blocked_at AS blockedAt, b.reason,
           (SELECT COUNT(*) FROM payments d WHERE d.user_id = b.user_id AND d.reviewed = 'declined') AS declines
         FROM payment_blocks b LEFT JOIN profiles pr ON pr.user_id = b.user_id LEFT JOIN phones ph ON ph.user_id = b.user_id
         WHERE b.unblocked_at IS NULL ORDER BY b.blocked_at DESC`,
      )
      .all()
  ).results;
  return { toCheck, recent, blocked, blockAfter: BLOCK_AFTER };
}

/** Approve: the money is in the bank statement. */
export async function approvePayment(db: D1Database, id: string, now: number): Promise<boolean> {
  const r = await db
    .prepare("UPDATE payments SET status = 'paid', reviewed = 'approved', reviewed_at = ?, paid_at = COALESCE(paid_at, ?), note = 'Approved by the owner after checking the bank statement' WHERE id = ? AND status = 'pending' AND provisional_at IS NOT NULL")
    .bind(now, now, id)
    .run();
  return r.meta.changes > 0;
}

/**
 * Decline: no such payment reached the bank. The access is taken back (unused credits first, then
 * the reports opened with them, newest first; Premium days are taken off), and five declines block
 * the account from buying.
 */
export async function declinePayment(db: D1Database, id: string, now: number): Promise<{ declined: boolean; blocked: boolean }> {
  const order = await db.prepare("SELECT * FROM payments WHERE id = ? AND status = 'pending' AND provisional_at IS NOT NULL").bind(id).first<Payment>();
  if (!order) return { declined: false, blocked: false };
  const stmts: D1PreparedStatement[] = [
    db
      .prepare("UPDATE payments SET status = 'failed', reviewed = 'declined', reviewed_at = ?, note = 'Declined by the owner: not found in the bank statement. Access taken back.' WHERE id = ? AND status = 'pending'")
      .bind(now, id),
  ];
  if (isPack(order.plan)) {
    const left = (await db.prepare('SELECT credits FROM report_credits WHERE user_id = ?').bind(order.user_id).first<{ credits: number }>())?.credits ?? 0;
    const take = Math.min(left, order.credits);
    const shortfall = order.credits - take;
    stmts.push(db.prepare('UPDATE report_credits SET credits = credits - ? WHERE user_id = ?').bind(take, order.user_id));
    if (shortfall > 0) {
      stmts.push(
        db
          .prepare('DELETE FROM reports WHERE rowid IN (SELECT rowid FROM reports WHERE user_id = ? AND created_at >= ? ORDER BY created_at DESC LIMIT ?)')
          .bind(order.user_id, order.provisional_at ?? order.created_at ?? 0, shortfall),
      );
    }
  } else {
    stmts.push(db.prepare('UPDATE premium SET until = MAX(?, until - ?) WHERE user_id = ?').bind(now, order.days * DAY_MS, order.user_id));
  }
  await db.batch(stmts);
  const since = (await db.prepare('SELECT unblocked_at FROM payment_blocks WHERE user_id = ?').bind(order.user_id).first<{ unblocked_at: number | null }>())?.unblocked_at ?? 0;
  const declines = (await db.prepare("SELECT COUNT(*) AS n FROM payments WHERE user_id = ? AND reviewed = 'declined' AND reviewed_at > ?").bind(order.user_id, since).first<{ n: number }>())?.n ?? 0;
  if (declines >= BLOCK_AFTER) {
    await db
      .prepare('INSERT INTO payment_blocks (user_id, blocked_at, reason) VALUES (?, ?, ?) ON CONFLICT (user_id) DO UPDATE SET blocked_at = excluded.blocked_at, unblocked_at = NULL, reason = excluded.reason')
      .bind(order.user_id, now, `${declines} declined payments`)
      .run();
    return { declined: true, blocked: true };
  }
  return { declined: true, blocked: false };
}

/** Lift a block; declines are counted again from now. */
export async function unblockPayer(db: D1Database, userId: string, now: number): Promise<boolean> {
  const r = await db.prepare('UPDATE payment_blocks SET unblocked_at = ? WHERE user_id = ? AND unblocked_at IS NULL').bind(now, userId).run();
  return r.meta.changes > 0;
}
