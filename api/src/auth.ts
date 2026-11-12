/**
 * Who is asking. People sign in with their Asanoha account (Supabase Auth); the app sends the
 * access token and we confirm it with Supabase rather than trusting anything the app says.
 * Guests are counted by a salted hash of their IP address and the day, never the raw IP.
 */
import { istDate } from './lib/limits.ts';
import { sha256 } from './lib/text.ts';
import type { Env } from './types.ts';

const verified = new Map<string, { userId: string; until: number }>();
const VERIFY_TTL_MS = 5 * 60 * 1000;

export class Unauthorized extends Error {}

/** The user ID for a bearer token, or null when there is no token. Throws if the token is bad. */
export async function userFromRequest(req: Request, env: Env): Promise<string | null> {
  const header = req.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return null;
  const key = await sha256(token);
  const hit = verified.get(key);
  if (hit && hit.until > Date.now()) return hit.userId;

  const res = await fetch(`${env.SUPABASE_URL.replace(/\/+$/, '')}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${token}` },
  });
  if (res.status === 401 || res.status === 403) throw new Unauthorized('Your session has ended. Please sign in again.');
  if (!res.ok) throw new Error(`Sign-in check failed (${res.status})`);
  const user = (await res.json()) as { id?: string };
  if (!user.id) throw new Unauthorized('Your session has ended. Please sign in again.');
  if (verified.size > 5000) verified.clear();
  verified.set(key, { userId: user.id, until: Date.now() + VERIFY_TTL_MS });
  return user.id;
}

export async function guestSubject(req: Request, env: Env, now: number): Promise<string> {
  const ip = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  return `guest:${(await sha256(`${env.GUEST_SALT ?? 'local-development'}:${istDate(now)}:${ip}`)).slice(0, 32)}`;
}

export async function isPremium(db: D1Database, userId: string, now: number): Promise<boolean> {
  const row = await db.prepare('SELECT until FROM premium WHERE user_id = ?').bind(userId).first<{ until: number }>();
  return !!row && row.until > now;
}
