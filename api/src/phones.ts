/**
 * WhatsApp number check: one verified number per account, so a person can't collect free
 * questions with several email addresses. The code is sent by a WhatsApp relay (the one Noha Pay
 * uses), reached over HTTPS with a bearer token.
 *
 * The check is on only when PHONE_REQUIRED is "1" and the relay is configured, so sign-in never
 * gets stuck waiting for a code that can't be sent.
 */
import { sha256 } from './lib/text.ts';
import type { Env } from './types.ts';

export class PhoneError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const CODE_TTL = 10 * 60_000;
const RESEND_AFTER = 60_000;
const MAX_SENDS_A_DAY = 5;
const MAX_ATTEMPTS = 5;

export const phoneCheckOn = (env: Env) => env.PHONE_REQUIRED === '1' && !!env.WA_RELAY_URL && !!env.WA_RELAY_TOKEN;

/** An Indian mobile number in E.164 (+91 and ten digits starting 6–9), or null. */
export function normalizePhone(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  let d = input.replace(/[\s\-().]/g, '');
  if (d.startsWith('+91')) d = d.slice(3);
  else if (d.startsWith('0091')) d = d.slice(4);
  else if (d.startsWith('91') && d.length === 12) d = d.slice(2);
  else if (d.startsWith('0') && d.length === 11) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? `+91${d}` : null;
}

/** "+91 98••••3114" */
export const maskPhone = (p: string) => `${p.slice(0, 3)} ${p.slice(3, 5)}••••${p.slice(-4)}`;

const indiaDay = (now: number) => new Date(now + 330 * 60_000).toISOString().slice(0, 10);
const hashCode = (phone: string, code: string, salt: string) => sha256(`${salt}:${phone}:${code}`);

export async function verifiedPhone(db: D1Database, userId: string): Promise<string | null> {
  return (await db.prepare('SELECT phone FROM phones WHERE user_id = ?').bind(userId).first<{ phone: string }>())?.phone ?? null;
}

type Sender = (to: string, text: string) => Promise<void>;

/** Sends through the relay: POST {to, text} with the relay token. */
export const relaySender =
  (env: Env): Sender =>
  async (to, text) => {
    const res = await fetch(env.WA_RELAY_URL!, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${env.WA_RELAY_TOKEN}` },
      body: JSON.stringify({ to: to.replace('+', ''), text }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`WhatsApp relay failed (${res.status})`);
  };

export async function startPhone(db: D1Database, userId: string, input: unknown, salt: string, send: Sender, now: number): Promise<{ phone: string }> {
  const phone = normalizePhone(input);
  if (!phone) throw new PhoneError('Enter a 10-digit Indian mobile number that has WhatsApp.');
  const owner = await db.prepare('SELECT user_id FROM phones WHERE phone = ?').bind(phone).first<{ user_id: string }>();
  if (owner && owner.user_id !== userId) throw new PhoneError('This number is already linked to another Kosmik account. Sign in with that account, or use a different number.', 409);
  if (owner) return { phone: maskPhone(phone) };

  const day = indiaDay(now);
  const prev = await db.prepare('SELECT sent_at, sends_today, day FROM phone_codes WHERE user_id = ?').bind(userId).first<{ sent_at: number; sends_today: number; day: string }>();
  if (prev && now - prev.sent_at < RESEND_AFTER) throw new PhoneError('A code was just sent. Please wait a minute before asking for another.', 429);
  const sendsToday = prev && prev.day === day ? prev.sends_today + 1 : 1;
  if (sendsToday > MAX_SENDS_A_DAY) throw new PhoneError('Too many codes today. Please try again tomorrow.', 429);
  // Stops one number being sent codes from many accounts.
  const others = await db.prepare('SELECT COUNT(*) AS n FROM phone_codes WHERE phone = ? AND user_id != ? AND sent_at > ?').bind(phone, userId, now - 3_600_000).first<{ n: number }>();
  if ((others?.n ?? 0) >= 2) throw new PhoneError('Too many codes for this number. Please try again in an hour.', 429);

  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  const code = String(buf[0] % 1_000_000).padStart(6, '0');
  await send(phone, `${code} is your Kosmik code. It expires in 10 minutes. Don't share it with anyone.`);
  await db
    .prepare(
      `INSERT INTO phone_codes (user_id, phone, code_hash, expires_at, attempts, sent_at, sends_today, day) VALUES (?, ?, ?, ?, 0, ?, ?, ?)
       ON CONFLICT (user_id) DO UPDATE SET phone = excluded.phone, code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0,
         sent_at = excluded.sent_at, sends_today = excluded.sends_today, day = excluded.day`,
    )
    .bind(userId, phone, await hashCode(phone, code, salt), now + CODE_TTL, now, sendsToday, day)
    .run();
  return { phone: maskPhone(phone) };
}

export async function verifyPhone(db: D1Database, userId: string, code: unknown, salt: string, now: number): Promise<{ phone: string }> {
  const row = await db.prepare('SELECT phone, code_hash, expires_at, attempts FROM phone_codes WHERE user_id = ?').bind(userId).first<{ phone: string; code_hash: string; expires_at: number; attempts: number }>();
  if (!row || row.expires_at < now) throw new PhoneError('That code has expired. Ask for a new one.');
  if (row.attempts >= MAX_ATTEMPTS) throw new PhoneError('Too many wrong codes. Ask for a new one.', 429);
  const typed = typeof code === 'string' ? code.replace(/\D/g, '') : '';
  if (typed.length !== 6 || (await hashCode(row.phone, typed, salt)) !== row.code_hash) {
    await db.prepare('UPDATE phone_codes SET attempts = attempts + 1 WHERE user_id = ?').bind(userId).run();
    throw new PhoneError('That code isn’t right. Check the WhatsApp message and try again.');
  }
  // The UNIQUE constraint settles a race between two accounts verifying the same number.
  try {
    await db.batch([
      db.prepare('INSERT INTO phones (user_id, phone, verified_at) VALUES (?, ?, ?) ON CONFLICT (user_id) DO UPDATE SET phone = excluded.phone, verified_at = excluded.verified_at').bind(userId, row.phone, now),
      db.prepare('DELETE FROM phone_codes WHERE user_id = ?').bind(userId),
    ]);
  } catch {
    throw new PhoneError('This number is already linked to another Kosmik account.', 409);
  }
  return { phone: maskPhone(row.phone) };
}
