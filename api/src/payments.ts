/**
 * Kosmik Premium through Noha Pay, Asanoha's UPI gateway. The customer pays by UPI straight into
 * the merchant's account; nobody in between holds the money. The gateway confirms a payment
 * (after the merchant matches the UTR) by calling our webhook, signed with a shared secret, and
 * only then is Premium extended.
 *
 *   POST /api/pay              { plan }  signed in → creates an order, returns the checkout URL
 *   GET  /api/pay/:id          signed in → the order's status and Premium end date
 *   POST /api/pay/webhook      gateway → verifies the signature and applies a confirmed payment
 *
 * Premium is a pass for a number of days, not a subscription: UPI payments don't renew on their own.
 */
import { sha256 } from './lib/text.ts';
import type { Env } from './types.ts';

export type PlanId = 'week' | 'month';
export const PLANS: Record<PlanId, { name: string; amountPaise: number; days: number }> = {
  week: { name: 'Premium · 7 days', amountPaise: 5100, days: 7 },
  month: { name: 'Premium · 30 days', amountPaise: 10100, days: 30 },
};

const DAY_MS = 24 * 60 * 60 * 1000;
/** Deliveries older than this are refused, so a captured request can't be replayed later. */
const MAX_AGE_MS = 15 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class PaymentError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export const paymentsEnabled = (env: Env) => !!(env.NOHA_GATEWAY_URL && env.NOHA_MERCHANT_ID && env.NOHA_WEBHOOK_SECRET);

export type Payment = { id: string; user_id: string; plan: PlanId; amount_paise: number; days: number; status: string; paid_at: number | null };

/** Starts a checkout. returnBase is this site's origin; the gateway sends the customer back there. */
export async function startPayment(env: Env, db: D1Database, userId: string, plan: unknown, returnBase: string, now: number): Promise<{ orderId: string; checkoutUrl: string }> {
  if (!paymentsEnabled(env)) throw new PaymentError('Premium payments open soon.', 503);
  if (plan !== 'week' && plan !== 'month') throw new PaymentError('Choose a plan.', 400);
  const p = PLANS[plan];
  const id = crypto.randomUUID();
  await db
    .prepare('INSERT INTO payments (id, user_id, plan, amount_paise, days, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, userId, plan, p.amountPaise, p.days, now)
    .run();

  const res = await fetch(`${env.NOHA_GATEWAY_URL!.replace(/\/+$/, '')}/api/v1/payments`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-merchant-id': env.NOHA_MERCHANT_ID! },
    body: JSON.stringify({
      orderId: id,
      amount: (p.amountPaise / 100).toFixed(2),
      currency: 'INR',
      returnUrl: `${returnBase}/premium?order=${id}`,
      metadata: { purpose: 'kosmik_premium', plan },
    }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  const pay = res?.ok ? ((await res.json().catch(() => ({}))) as { checkoutUrl?: string; paymentId?: string }) : null;
  if (!pay?.checkoutUrl) {
    await db.prepare("UPDATE payments SET status = 'failed', note = 'checkout not created' WHERE id = ?").bind(id).run();
    throw new PaymentError('The payment page couldn’t be opened. Please try again.', 502);
  }
  if (pay.paymentId) await db.prepare('UPDATE payments SET gateway_payment_id = ? WHERE id = ?').bind(pay.paymentId, id).run();
  return { orderId: id, checkoutUrl: pay.checkoutUrl };
}

export async function paymentStatus(db: D1Database, userId: string, id: string, now: number): Promise<{ status: string; plan: PlanId; premiumUntil: number | null } | null> {
  const row = await db.prepare('SELECT status, plan FROM payments WHERE id = ? AND user_id = ?').bind(id, userId).first<{ status: string; plan: PlanId }>();
  if (!row) return null;
  return { ...row, premiumUntil: await premiumUntil(db, userId, now) };
}

/** When the user's Premium ends, or null if they don't have it (or it has run out). */
export async function premiumUntil(db: D1Database, userId: string, now: number): Promise<number | null> {
  const until = (await db.prepare('SELECT until FROM premium WHERE user_id = ?').bind(userId).first<{ until: number }>())?.until ?? null;
  return until !== null && until > now ? until : null;
}

async function hmacHex(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(body)))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time comparison (of hashes, so the lengths always match). */
async function sameSecret(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([sha256(a), sha256(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

type GatewayEvent = { event?: string; orderId?: string; amountPaise?: number; amount?: string; utr?: string; paymentId?: string };

/** Applies a gateway notification. Safe to receive the same delivery more than once. */
export async function handleWebhook(env: Env, db: D1Database, headers: Headers, rawBody: string, now: number): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!env.NOHA_WEBHOOK_SECRET) return { status: 503, body: { error: 'not configured' } };
  const expected = 'sha256=' + (await hmacHex(env.NOHA_WEBHOOK_SECRET, rawBody));
  if (!(await sameSecret(headers.get('x-gateway-signature') ?? '', expected))) return { status: 401, body: { error: 'invalid signature' } };
  const ts = Number(headers.get('x-gateway-timestamp'));
  if (ts && Math.abs(now - ts) > MAX_AGE_MS) return { status: 400, body: { error: 'stale delivery' } };

  let ev: GatewayEvent;
  try {
    ev = JSON.parse(rawBody) as GatewayEvent;
  } catch {
    return { status: 400, body: { error: 'invalid JSON' } };
  }
  if (!ev.orderId || !UUID.test(ev.orderId)) return { status: 200, body: { ignored: 'not a Kosmik order' } };
  const order = await db.prepare('SELECT * FROM payments WHERE id = ?').bind(ev.orderId).first<Payment>();
  if (!order) return { status: 200, body: { ignored: 'unknown order' } };

  if (ev.event === 'SUCCESS') {
    if (order.status === 'paid') return { status: 200, body: { ok: true, duplicate: true } };
    const paid = typeof ev.amountPaise === 'number' ? ev.amountPaise : Math.round(Number(ev.amount) * 100);
    if (paid !== order.amount_paise) {
      // Never apply a different amount automatically: check it against the bank statement.
      await db
        .prepare("UPDATE payments SET status = 'failed', gateway_payment_id = ?, utr = ?, note = ? WHERE id = ? AND status != 'paid'")
        .bind(ev.paymentId ?? null, ev.utr ?? null, `amount mismatch: expected ${order.amount_paise}, got ${paid}`, order.id)
        .run();
      return { status: 200, body: { ignored: 'amount mismatch' } };
    }
    // Mark paid and extend Premium together, and only if this delivery is the one that marked it.
    const [mark] = await db.batch([
      db.prepare("UPDATE payments SET status = 'paid', gateway_payment_id = ?, utr = ?, paid_at = ?, note = NULL WHERE id = ? AND status != 'paid'").bind(ev.paymentId ?? null, ev.utr ?? null, now, order.id),
      db
        .prepare(
          `INSERT INTO premium (user_id, until) SELECT ?, ? + ? WHERE changes() = 1
           ON CONFLICT (user_id) DO UPDATE SET until = MAX(premium.until, ?) + ?`,
        )
        .bind(order.user_id, now, order.days * DAY_MS, now, order.days * DAY_MS),
    ]);
    return { status: 200, body: mark.meta.changes ? { ok: true } : { ok: true, duplicate: true } };
  }
  const status = ev.event === 'FAILED' ? 'failed' : ev.event === 'EXPIRED' ? 'expired' : ev.event === 'CANCELLED' ? 'cancelled' : null;
  if (status) await db.prepare("UPDATE payments SET status = ? WHERE id = ? AND status = 'pending'").bind(status, order.id).run();
  return { status: 200, body: { ok: true } };
}
