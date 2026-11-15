/**
 * Kosmik's error log: errors from the app (POST /api/log) and the server are grouped by
 * fingerprint per day in D1 and kept for 30 days. The owner reads them at /admin.
 */
import { sha256 } from './lib/text.ts';

export type ErrorReport = { source: 'client' | 'server'; kind: string; message: string; detail?: string | null; path?: string | null; release?: string | null; userId?: string | null };

const clip = (s: unknown, n: number) => (typeof s === 'string' ? s.slice(0, n) : null);
const KINDS = new Set(['window', 'promise', 'render', 'api', 'network', 'ai', 'relay', 'worker', 'payment', 'other']);

/** Strips things that look like personal data from a message before it is stored. */
export function scrub(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email]')
    .replace(/\+?\d[\d\s-]{8,}\d/g, '[number]')
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[token]')
    .replace(/(bearer|token|key|secret)[=: ]+\S+/gi, '$1 [hidden]');
}

export async function recordError(db: D1Database, r: ErrorReport, now: number): Promise<void> {
  const kind = KINDS.has(r.kind) ? r.kind : 'other';
  const message = scrub(clip(r.message, 500) ?? 'Unknown error');
  const detail = r.detail ? scrub(clip(r.detail, 2000)!) : null;
  // Group by the message without numbers and ids, so one bug is one row.
  const fingerprint = (await sha256(`${r.source}|${kind}|${message.replace(/\d+/g, '#').replace(/[0-9a-f-]{16,}/gi, '#')}`)).slice(0, 24);
  const day = new Date(now + 330 * 60_000).toISOString().slice(0, 10);
  await db
    .prepare(
      `INSERT INTO errors (fingerprint, day, source, kind, message, detail, path, release, user_id, count, first_at, last_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
       ON CONFLICT (fingerprint, day) DO UPDATE SET count = count + 1, last_at = excluded.last_at, detail = COALESCE(excluded.detail, detail),
         path = COALESCE(excluded.path, path), user_id = COALESCE(excluded.user_id, user_id), release = COALESCE(excluded.release, release)`,
    )
    .bind(fingerprint, day, r.source, kind, message, detail, clip(r.path, 200), clip(r.release, 40), r.userId ?? null, now, now)
    .run();
}

/** Saves an error without ever letting the logging itself fail a request. */
export function logError(db: D1Database, r: ErrorReport, now: number, ctx?: { waitUntil(p: Promise<unknown>): void }): void {
  const p = recordError(db, r, now).catch((e) => console.error('error log failed', (e as Error).message));
  ctx?.waitUntil(p);
}

export async function errorSummary(db: D1Database, now: number) {
  const since = now - 7 * 86_400_000;
  const { results: groups } = await db
    .prepare(
      `SELECT fingerprint, source, kind, message, MAX(detail) AS detail, MAX(path) AS path, SUM(count) AS count, MIN(first_at) AS first_at, MAX(last_at) AS last_at
       FROM errors WHERE last_at > ? GROUP BY fingerprint ORDER BY last_at DESC LIMIT 100`,
    )
    .bind(since)
    .all();
  const { results: days } = await db.prepare('SELECT day, source, SUM(count) AS count FROM errors WHERE last_at > ? GROUP BY day, source ORDER BY day').bind(since).all();
  return { groups, days };
}
