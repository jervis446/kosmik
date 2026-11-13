/**
 * Runs the real SQL (migrations, answer cache, daily clean-up) against SQLite, which D1 is built
 * on, through a small D1-shaped adapter.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { purgeExpired } from '../src/retention.ts';
import { D1AnswerCache } from '../src/store.ts';
import { d1 } from './d1.ts';

const entry = (over: Partial<Parameters<D1AnswerCache['put']>[0]> = {}) => ({
  lang: 'en',
  question: 'gita on anger',
  hash: 'h1',
  blocks: [{ type: 'text' as const, text: 'First answer' }],
  sources: ['BG 2.63'],
  sourcesHash: 'fp1',
  model: 'm',
  embedding: [0.1, 0.2],
  ...over,
});

test('answer cache: a live answer is kept on a race; a retired one is replaced with fresh counts', async () => {
  const { db, raw } = d1();
  const cache = new D1AnswerCache(db);

  const id = await cache.put(entry());
  assert.equal(await cache.put(entry({ blocks: [{ type: 'text', text: 'Racing answer' }] })), id);
  assert.deepEqual((await cache.exact('en', 'h1'))?.blocks, [{ type: 'text', text: 'First answer' }]);

  raw.prepare('UPDATE answer_cache SET hits = 9, down = 4 WHERE id = ?').run(id);
  await cache.retire(id);
  assert.equal(await cache.exact('en', 'h1'), null);

  assert.equal(await cache.put(entry({ blocks: [{ type: 'text', text: 'Fresh answer' }], sourcesHash: 'fp2' })), id);
  const fresh = await cache.exact('en', 'h1');
  assert.deepEqual(fresh, { id, blocks: [{ type: 'text', text: 'Fresh answer' }], sources: ['BG 2.63'], sourcesHash: 'fp2' });
  assert.deepEqual({ ...raw.prepare('SELECT hits, down, disabled FROM answer_cache WHERE id = ?').get(id) }, { hits: 0, down: 0, disabled: 0 });
});

test('daily clean-up removes old counts, old chats with their messages and feedback, and unused cache', async () => {
  const { db, raw } = d1();
  const now = Date.parse('2027-06-15T06:00:00Z');
  const day = 24 * 60 * 60 * 1000;

  const usage = raw.prepare('INSERT INTO usage (subject, period, count) VALUES (?, ?, 1)');
  usage.run('guest:a', 'd:2027-05-01'); // 45 days old
  usage.run('user:u', 'w:2027-05-03'); // 43 days old
  usage.run('guest:b', 'd:2027-06-15'); // today
  usage.run('user:u', 'w:2027-06-14'); // this week

  const chat = raw.prepare('INSERT INTO conversations (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)');
  const msg = raw.prepare("INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, 'assistant', '', ?)");
  chat.run('old', 'u', 'old chat', now - 400 * day, now - 366 * day);
  msg.run('m-old', 'old', now - 366 * day);
  raw.prepare("INSERT INTO feedback (message_id, user_id, value, created_at) VALUES ('m-old', 'u', 1, ?)").run(now - 366 * day);
  chat.run('recent', 'u', 'still in use', now - 400 * day, now - 10 * day);
  msg.run('m-recent', 'recent', now - 10 * day);

  const cached = raw.prepare(
    "INSERT INTO answer_cache (lang, question, question_hash, answer, model, embedding, created_at, last_hit_at, reviewed) VALUES ('en', ?, ?, '[]', 'm', x'00', ?, ?, ?)",
  );
  cached.run('unused', 'c1', now - 300 * day, now - 200 * day, 0);
  cached.run('never hit', 'c2', now - 190 * day, null, 0);
  cached.run('reviewed', 'c3', now - 300 * day, now - 200 * day, 1);
  cached.run('popular', 'c4', now - 300 * day, now - 2 * day, 0);

  const purged = await purgeExpired(db, now);
  assert.deepEqual(purged, { usage: 2, chats: 1, messages: 1, cachedAnswers: 2 });
  assert.deepEqual(raw.prepare('SELECT period FROM usage ORDER BY period').all().map((r) => r.period), ['d:2027-06-15', 'w:2027-06-14']);
  assert.deepEqual(raw.prepare('SELECT id FROM conversations').all().map((r) => r.id), ['recent']);
  assert.deepEqual(raw.prepare('SELECT id FROM messages').all().map((r) => r.id), ['m-recent']);
  assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM feedback').get()?.n, 0);
  assert.deepEqual(raw.prepare('SELECT question FROM answer_cache ORDER BY id').all().map((r) => r.question), ['reviewed', 'popular']);

  assert.deepEqual(await purgeExpired(db, now), { usage: 0, chats: 0, messages: 0, cachedAnswers: 0 }, 'running twice is harmless');
});
