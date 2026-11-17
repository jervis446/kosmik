/**
 * Runs the real SQL (migrations, answer cache, daily clean-up) against SQLite, which D1 is built
 * on, through a small D1-shaped adapter.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { purgeExpired } from '../src/retention.ts';
import { D1Ayurveda } from '../src/ayurveda.ts';
import { D1AnswerCache, D1History, D1Library, HINDI_TRANSLATOR } from '../src/store.ts';
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
  assert.deepEqual(purged, { usage: 2, chats: 1, messages: 1, cachedAnswers: 2, errors: 0 });
  assert.deepEqual(raw.prepare('SELECT period FROM usage ORDER BY period').all().map((r) => r.period), ['d:2027-06-15', 'w:2027-06-14']);
  assert.deepEqual(raw.prepare('SELECT id FROM conversations').all().map((r) => r.id), ['recent']);
  assert.deepEqual(raw.prepare('SELECT id FROM messages').all().map((r) => r.id), ['m-recent']);
  assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM feedback').get()?.n, 0);
  assert.deepEqual(raw.prepare('SELECT question FROM answer_cache ORDER BY id').all().map((r) => r.question), ['reviewed', 'popular']);

  assert.deepEqual(await purgeExpired(db, now), { usage: 0, chats: 0, messages: 0, cachedAnswers: 0, errors: 0 }, 'running twice is harmless');
});

test('history: recent messages come oldest first, and only from your own chat', async () => {
  const { db } = d1();
  const history = new D1History(db);
  const first = await history.record({ userId: 'u1', question: 'Q1', blocks: [{ type: 'text', text: 'A1' }], layer: 'ai', cacheId: null, now: 1000 });
  await history.record({ userId: 'u1', conversationId: first.conversationId, question: 'Q2', blocks: [{ type: 'text', text: 'A2' }], layer: 'ai', cacheId: null, now: 2000 });
  const recent = await history.recent('u1', first.conversationId, 3);
  assert.deepEqual(recent.map((m) => (m.role === 'user' ? m.content : (m.blocks?.[0] as { text: string }).text)), ['A1', 'Q2', 'A2']);
  assert.deepEqual(await history.recent('someone-else', first.conversationId, 6), []);
});

test('Hindi library: Hindi meanings, verses and herb names where translated, English otherwise', async () => {
  const { db, raw } = d1();
  const blob = new Uint8Array(8);
  raw.prepare("INSERT INTO verses (ref, work, chapter, verse, sanskrit, iast, translation, translator, source, embedding, translation_hi) VALUES ('BG 2.47', 'Bhagavad Gita', 2, 47, 'कर्मण्येवाधिकारस्ते', 'karmaṇy', 'Thy right is to work only.', 'Swami Sivananda', 's', ?, 'तुम्हारा अधिकार केवल कर्म में है।')").run(blob);
  raw.prepare("INSERT INTO verses (ref, work, chapter, verse, sanskrit, iast, translation, translator, source, embedding) VALUES ('BG 2.48', 'Bhagavad Gita', 2, 48, 'योगस्थः', 'yogasthaḥ', 'Perform action, steadfast in yoga.', 'Swami Sivananda', 's', ?)").run(blob);
  for (const [kind, key, lang, title] of [['graha', 'sun', 'en', 'Surya (Sun)'], ['graha', 'sun', 'hi', 'सूर्य'], ['graha', 'moon', 'en', 'Chandra (Moon)']]) {
    raw.prepare('INSERT INTO meanings (kind, key, lang, title, body) VALUES (?, ?, ?, ?, ?)').run(kind, key, lang, title, `${title} body`);
  }
  raw.prepare(`INSERT INTO herbs (key, name, english, botanical, family, synonyms, parts, rasa, guna, virya, vipaka, pacify, aggravate, description, caution, link, name_hi) VALUES ('tulsi', 'Tulsi', 'Holy Basil', 'Ocimum sanctum', 'L', '[]', '[]', '[]', '[]', 'Ushna', 'Katu', '[]', '[]', 'English card', 0, 'x', 'तुलसी')`).run();
  raw.prepare("INSERT INTO meanings (kind, key, lang, title, body) VALUES ('herb', 'tulsi', 'hi', 'तुलसी', 'हिंदी कार्ड')").run();

  const en = new D1Library(db);
  const hi = en.inLang('hi');
  assert.equal((await en.verse(2, 47))?.translation, 'Thy right is to work only.');
  assert.deepEqual(await hi.verse(2, 47).then((v) => [v?.translation, v?.translator]), ['तुम्हारा अधिकार केवल कर्म में है।', HINDI_TRANSLATOR]);
  assert.equal((await hi.verses(['BG 2.48']))[0].translation, 'Perform action, steadfast in yoga.', 'not yet translated: English');
  const titles = async (lib: D1Library) => (await lib.meanings(['graha/sun', 'graha/moon'])).map((m) => m.title).sort();
  assert.deepEqual(await titles(en), ['Chandra (Moon)', 'Surya (Sun)']);
  assert.deepEqual(await titles(hi), ['Chandra (Moon)', 'सूर्य']);

  const herb = await new D1Ayurveda(db).inLang('hi').herb('tulsi');
  assert.deepEqual([herb?.name, herb?.description], ['तुलसी (Tulsi)', 'हिंदी कार्ड']);
  assert.equal((await new D1Ayurveda(db).herb('tulsi'))?.name, 'Tulsi');
});

test('history: a new chat keeps the kind it started with', async () => {
  const { db } = d1();
  const h = new D1History(db);
  const first = await h.record({ userId: 'u1', question: 'Gut feels heavy', blocks: [], layer: 'ai', cacheId: null, now: 1, kind: 'ayurveda' });
  assert.equal(first.kind, 'ayurveda');
  const next = await h.record({ userId: 'u1', conversationId: first.conversationId, question: 'And sleep?', blocks: [], layer: 'ai', cacheId: null, now: 2, kind: 'kosmik' });
  assert.equal(next.kind, 'ayurveda', 'an existing chat keeps its kind');
  assert.equal(await h.kindOf('u1', first.conversationId), 'ayurveda');
  assert.equal(await h.kindOf('someone-else', first.conversationId), null);
});

test('backfill: old chats whose first answer was Ayurvedic become Ayurveda chats', async () => {
  const { raw } = d1();
  raw.exec("DELETE FROM conversations");
  const add = (id: string, blocks: string) => {
    raw.prepare("INSERT INTO conversations (id, user_id, title, kind, created_at, updated_at) VALUES (?, 'u', 't', 'kosmik', 1, 1)").run(id);
    raw.prepare("INSERT INTO messages (id, conversation_id, role, content, blocks, created_at) VALUES (?, ?, 'assistant', '', ?, 2)").run(`${id}-m`, id, blocks);
  };
  add('a', '[{"type":"text","text":"x"},{"type":"ayur-plan","favour":[]}]');
  add('b', '[{"type":"text","text":"x"},{"type":"chart","rows":[]}]');
  add('c', '[{"type":"herb-list","herbs":[]}]');
  const { readFileSync } = await import('node:fs');
  raw.exec(readFileSync(new URL('../migrations/0012_chat_kind_backfill.sql', import.meta.url), 'utf8'));
  assert.deepEqual(raw.prepare('SELECT id, kind FROM conversations ORDER BY id').all().map((r) => `${r.id}:${r.kind}`), ['a:ayurveda', 'b:kosmik', 'c:ayurveda']);
});

test('migration 0015: existing chats keep their kind and their messages; Shanti chats can be saved', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const { readdirSync, readFileSync } = await import('node:fs');
  const raw = new DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys = ON');
  const dir = new URL('../migrations/', import.meta.url);
  const files = readdirSync(dir).sort();
  for (const f of files.filter((x) => x < '0015')) raw.exec(readFileSync(new URL(f, dir), 'utf8'));
  raw.exec(`INSERT INTO conversations (id, user_id, title, created_at, updated_at, kind) VALUES ('c1', 'u1', 'Gut', 1, 1, 'ayurveda'), ('c2', 'u1', 'Stars', 1, 1, 'kosmik');
    INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES ('m1', 'c1', 'user', 'hi', 1), ('m2', 'c2', 'user', 'hi', 1);`);
  for (const f of files.filter((x) => x >= '0015')) raw.exec(readFileSync(new URL(f, dir), 'utf8'));
  assert.deepEqual(raw.prepare('SELECT id, kind FROM conversations ORDER BY id').all().map((r) => `${r.id}:${r.kind}`), ['c1:ayurveda', 'c2:kosmik']);
  assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM messages').get()?.n, 2, 'no message lost');
  raw.exec(`INSERT INTO conversations (id, user_id, title, created_at, updated_at, kind) VALUES ('c3', 'u1', 'Heart', 1, 1, 'shanti')`);
  assert.throws(() => raw.exec(`INSERT INTO conversations (id, user_id, title, created_at, updated_at, kind) VALUES ('c4', 'u1', 'x', 1, 1, 'other')`));
});

test('answer cache: Shanti answers are stored and searched apart from Kosmik ones', async () => {
  const { db } = d1();
  const { MemoryVectorSearch } = await import('../src/store.ts');
  const cache = new D1AnswerCache(db);
  const k = await cache.put(entry({ hash: 'k1', embedding: [1, 0] }));
  const s = await cache.put(entry({ hash: 'shanti-1', embedding: [1, 0], kind: 'shanti' }));
  const vectors = new MemoryVectorSearch(db);
  assert.deepEqual((await vectors.search('cache:shanti:en', [1, 0], 5, 0.5)).map((h) => h.id), [String(s)]);
  assert.deepEqual((await vectors.search('cache:en', [1, 0], 5, 0.5)).map((h) => h.id), [String(k)]);
});

test('passages: read back by ref and searched by their own vectors', async () => {
  const { db, raw } = d1();
  const { MemoryVectorSearch } = await import('../src/store.ts');
  const vec = new Uint8Array(new Float32Array([1, 0]).buffer);
  raw.prepare(`INSERT INTO passages (ref, work, location, text, translator, source, embedding, reviewed) VALUES (?, 'Mahabharata', 'Stri Parva, section 2', 'Why grieve?', 'Kisari Mohan Ganguli', 'PD', ?, 1)`).run('MBh 11.2.1a', vec);
  const lib = new D1Library(db);
  assert.deepEqual(await lib.passages(['MBh 11.2.1a', 'MBh 1.1.1']), [
    { ref: 'MBh 11.2.1a', work: 'Mahabharata', location: 'Stri Parva, section 2', text: 'Why grieve?', sanskrit: null, translator: 'Kisari Mohan Ganguli', reviewed: true },
  ]);
  assert.deepEqual((await new MemoryVectorSearch(db).search('passages', [1, 0], 3, 0.5)).map((h) => h.id), ['MBh 11.2.1a']);
});
