/**
 * Daily clean-up (a Cron Trigger, see wrangler.jsonc). Keeps only what Kosmik needs:
 *   - question counts (users and guests): 30 days; limits only ever look at today or this week
 *   - chats: deleted 12 months after they were last used
 *   - shared cached answers: removed after 6 months unused, unless a person has reviewed them
 * The privacy page states these periods; change both together.
 */
import { istDate } from './lib/limits.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
export const RETENTION_DAYS = { usage: 30, chats: 365, cache: 180 } as const;

export type Purged = { usage: number; chats: number; messages: number; cachedAnswers: number };

export async function purgeExpired(db: D1Database, now: number): Promise<Purged> {
  // usage.period is 'd:YYYY-MM-DD' or 'w:YYYY-MM-DD' (India time), so the date compares as text.
  const usageBefore = istDate(now - RETENTION_DAYS.usage * DAY_MS);
  const chatsBefore = now - RETENTION_DAYS.chats * DAY_MS;
  const cacheBefore = now - RETENTION_DAYS.cache * DAY_MS;
  const oldChats = 'SELECT id FROM conversations WHERE updated_at < ?';

  const [usage, , messages, chats, cache] = await db.batch([
    db.prepare('DELETE FROM usage WHERE substr(period, 3) < ?').bind(usageBefore),
    db.prepare(`DELETE FROM feedback WHERE message_id IN (SELECT id FROM messages WHERE conversation_id IN (${oldChats}))`).bind(chatsBefore),
    db.prepare(`DELETE FROM messages WHERE conversation_id IN (${oldChats})`).bind(chatsBefore),
    db.prepare('DELETE FROM conversations WHERE updated_at < ?').bind(chatsBefore),
    db.prepare('DELETE FROM answer_cache WHERE reviewed = 0 AND COALESCE(last_hit_at, created_at) < ?').bind(cacheBefore),
  ]);
  return { usage: usage.meta.changes, chats: chats.meta.changes, messages: messages.meta.changes, cachedAnswers: cache.meta.changes };
}
