/**
 * Coupons. One today: people signed in with an IIM Indore email (@iimidr.ac.in) can enter a code
 * on the Reports page for one free report credit. The code lives only in the COUPON_IIMIDR secret
 * (this repository is public), is checked here on the server, and ignores capitals. Each account can
 * use it once; after 5 wrong tries the box waits until the next day (India time).
 *
 *   GET  /api/coupon   { eligible, used }: whether to show the coupon box
 *   POST /api/coupon   { code } -> { credits }: the credits the account now has
 */
import { istDate } from './lib/limits.ts';
import { D1Usage } from './store.ts';

export const COUPON_DOMAIN = 'iimidr.ac.in';
export const COUPON_TRIES_PER_DAY = 5;
/** The name a redemption is saved under (the code itself is never saved). */
const COUPON = 'iimidr';

export type CouponEnv = { COUPON_IIMIDR?: string };
/** The signed-in person; email is null unless Supabase has confirmed it. */
export type CouponUser = { id: string; email: string | null };

export class CouponError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** True for an address at exactly @iimidr.ac.in. */
export function couponEligible(email: string | null | undefined): boolean {
  return !!email && email.trim().toLowerCase().endsWith(`@${COUPON_DOMAIN}`);
}

const running = (env: CouponEnv) => !!env.COUPON_IIMIDR?.trim();

async function used(db: D1Database, userId: string): Promise<boolean> {
  return !!(await db.prepare('SELECT 1 AS x FROM coupon_redemptions WHERE user_id = ? AND coupon = ?').bind(userId, COUPON).first());
}

export async function couponStatus(db: D1Database, env: CouponEnv, user: CouponUser): Promise<{ eligible: boolean; used: boolean }> {
  if (!running(env) || !couponEligible(user.email)) return { eligible: false, used: false };
  return { eligible: true, used: await used(db, user.id) };
}

/** Same answer time whatever the code, so the code can't be guessed letter by letter. */
function sameCode(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export async function redeemCoupon(db: D1Database, env: CouponEnv, user: CouponUser, code: unknown, now: number): Promise<{ credits: number }> {
  if (!running(env) || !couponEligible(user.email)) throw new CouponError('This coupon isn’t available for your account.', 403);
  if (await used(db, user.id)) throw new CouponError('You’ve already used a coupon on this account.', 409);

  const tries = new D1Usage(db);
  const subject = `coupon-try:${user.id}`;
  const period = `d:${istDate(now)}`;
  if ((await tries.count(subject, period)) >= COUPON_TRIES_PER_DAY) throw new CouponError('Too many tries today. Please try again tomorrow.', 429);

  const given = typeof code === 'string' ? code.trim().toLowerCase() : '';
  if (!given || !sameCode(given, env.COUPON_IIMIDR!.trim().toLowerCase())) {
    await tries.increment(subject, period);
    throw new CouponError('That coupon code isn’t right.', 400);
  }

  // The credit is added only if this account's redemption row was new.
  await db.batch([
    db.prepare('INSERT OR IGNORE INTO coupon_redemptions (user_id, coupon, redeemed_at) VALUES (?, ?, ?)').bind(user.id, COUPON, now),
    db
      .prepare(
        `INSERT INTO report_credits (user_id, credits) SELECT ?, 1 WHERE changes() = 1
         ON CONFLICT (user_id) DO UPDATE SET credits = report_credits.credits + 1`,
      )
      .bind(user.id),
  ]);
  const row = await db.prepare('SELECT credits FROM report_credits WHERE user_id = ?').bind(user.id).first<{ credits: number }>();
  return { credits: row?.credits ?? 0 };
}
