/**
 * Question allowances. Starter accounts get 11 questions a week, refilled on Monday in India
 * time (as the website promises). Guests get 3 a day before signing in. Premium is unlimited.
 */

export const FREE_PER_WEEK = 11;
export const GUEST_PER_DAY = 3;
const IST_OFFSET_MS = 330 * 60 * 1000;

/** The India-time calendar date for a moment, as YYYY-MM-DD. */
export function istDate(now: number): string {
  return new Date(now + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** The Monday (India time) that starts the week containing `now`. */
export function weekStart(now: number): string {
  const d = new Date(now + IST_OFFSET_MS);
  const daysSinceMonday = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - daysSinceMonday);
  return d.toISOString().slice(0, 10);
}

export type Plan = { kind: 'guest' | 'starter' | 'premium'; limit: number | null; period: string };

export function planFor(kind: 'guest' | 'starter' | 'premium', now: number): Plan {
  if (kind === 'premium') return { kind, limit: null, period: `w:${weekStart(now)}` };
  if (kind === 'guest') return { kind, limit: GUEST_PER_DAY, period: `d:${istDate(now)}` };
  return { kind, limit: FREE_PER_WEEK, period: `w:${weekStart(now)}` };
}
