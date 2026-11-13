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

export type PlanId = 'week' | 'month';
export const PLANS: Record<PlanId, { name: string; amountPaise: number; days: number }> = {
  week: { name: 'Premium · 7 days', amountPaise: 5100, days: 7 },
  month: { name: 'Premium · 30 days', amountPaise: 10100, days: 30 },
};

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

export type Payment = { id: string; user_id: string; plan: PlanId; amount_paise: number; days: number; status: string; paid_at: number | null };

/** Starts a checkout. returnBase is this site's origin; the gateway sends the customer back there. */
export async function startPayment(env: Env, db: D1Database, userId: string, plan: unknown, returnBase: string, now: number): Promise<{ orderId: string; checkoutUrl: string }> {
  if (!paymentsEnabled(env)) throw new PaymentError('Premium payments open soon.', 503);
  if (plan !== 'week' && plan !== 'month') throw new PaymentError('Choose a plan.', 400);
  const p = PLANS[plan];
  const id = newOrderId();
  await db
    .prepare('INSERT INTO payments (id, user_id, plan, amount_paise, days, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, userId, plan, p.amountPaise, p.days, now)
    .run();

  const res = await fetch(`${env.NOHA_GATEWAY_URL!.replace(/\/+$/, '')}/api/v1/payments`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-merchant-id': env.NOHA_MERCHANT_ID!, 'x-merchant-key': env.NOHA_MERCHANT_KEY!, 'idempotency-key': id },
    body: JSON.stringify({
      orderId: id,
      amount: (p.amountPaise / 100).toFixed(2),
      currency: 'INR',
      method: 'UPI',
      returnUrl: `${returnBase}/premium?order=${id}`,
      metadata: { source: 'kosmik', plan },
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
    if (String(ev.method ?? 'UPI').toUpperCase() !== 'UPI') {
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
    // Mark paid and extend Premium together, and only if this delivery is the one that marked it.
    const [mark] = await db.batch([
      db
        .prepare("UPDATE payments SET status = 'paid', gateway_payment_id = COALESCE(?, gateway_payment_id), utr = ?, paid_at = ?, note = ? WHERE id = ? AND status != 'paid'")
        .bind(ev.paymentId ?? null, utr, now, how, order.id),
      db
        .prepare(
          `INSERT INTO premium (user_id, until) SELECT ?, ? + ? WHERE changes() = 1
           ON CONFLICT (user_id) DO UPDATE SET until = MAX(premium.until, ?) + ?`,
        )
        .bind(order.user_id, now, order.days * DAY_MS, now, order.days * DAY_MS),
    ]);
    return { status: 200, body: mark.meta.changes ? { received: true } : { received: true, duplicate: true } };
  }
  if (event === 'SUCCESS') {
    await note('Ignored SUCCESS: cash and counter payments are not accepted');
    return { status: 200, body: { received: true } };
  }
  if (event === 'MANUAL_REVIEW' && utr && order.status === 'pending') {
    // The payer typed a UTR, or the match was ambiguous: not proof of payment. Keep it pending.
    await db.prepare("UPDATE payments SET utr = ?, note = ? WHERE id = ? AND status = 'pending'").bind(utr, `Payer reports paying with UTR ${utr}. Check the bank statement.`, order.id).run();
    return { status: 200, body: { received: true } };
  }
  const status = event === 'FAILED' ? 'failed' : event === 'EXPIRED' ? 'expired' : event === 'CANCELLED' ? 'cancelled' : null;
  if (status) await db.prepare("UPDATE payments SET status = ? WHERE id = ? AND status = 'pending'").bind(status, order.id).run();
  else await note(`Gateway event: ${event.slice(0, 40)}`);
  return { status: 200, body: { received: true } };
}
