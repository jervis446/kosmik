/** Data access on Cloudflare D1, plus vector search (Vectorize, or an in-memory scan of D1). */
import { fromBlob, type Hit, toBlob, topK } from './lib/vectors.ts';
import type { Block, CacheEntry, Meaning, Verse } from './types.ts';

export type Namespace = 'verses' | 'meanings' | `cache:${string}`;

export interface Library {
  verse(chapter: number, verse: number): Promise<Verse | null>;
  verses(refs: string[]): Promise<Verse[]>;
  verseCount(): Promise<number>;
  verseAt(index: number): Promise<Verse | null>;
  meaning(kind: string, key: string): Promise<Meaning | null>;
  meanings(ids: string[]): Promise<Meaning[]>;
}

export interface AnswerCache {
  exact(lang: string, hash: string): Promise<CacheEntry | null>;
  byId(id: number): Promise<CacheEntry | null>;
  put(e: { lang: string; question: string; hash: string; blocks: Block[]; sources: string[]; model: string; embedding: number[] }): Promise<number>;
  hit(id: number): Promise<void>;
}

export interface VectorSearch {
  search(ns: Namespace, vector: number[], k: number, minScore: number): Promise<Hit[]>;
  add(ns: Namespace, id: string, vector: number[]): Promise<void>;
}

export interface Usage {
  count(subject: string, period: string): Promise<number>;
  increment(subject: string, period: string): Promise<void>;
}

export interface History {
  record(e: { userId: string; conversationId?: string | null; question: string; blocks: Block[]; layer: string; cacheId: number | null; now: number }): Promise<{ conversationId: string; messageId: string }>;
}

type VerseRow = { ref: string; chapter: number; verse: number; sanskrit: string; iast: string; translation: string; translator: string };
const VERSE_COLS = 'ref, chapter, verse, sanskrit, iast, translation, translator';
const toMeaning = (r: { kind: string; key: string; title: string; body: string; reviewed: number }): Meaning => ({ ...r, reviewed: !!r.reviewed });

export class D1Library implements Library {
  constructor(private db: D1Database) {}
  async verse(chapter: number, verse: number) {
    return (await this.db.prepare(`SELECT ${VERSE_COLS} FROM verses WHERE chapter = ? AND verse = ?`).bind(chapter, verse).first<VerseRow>()) ?? null;
  }
  async verses(refs: string[]) {
    if (!refs.length) return [];
    const { results } = await this.db.prepare(`SELECT ${VERSE_COLS} FROM verses WHERE ref IN (${refs.map(() => '?').join(',')})`).bind(...refs).all<VerseRow>();
    return refs.map((r) => results.find((v) => v.ref === r)).filter((v): v is VerseRow => !!v);
  }
  async verseCount() {
    return (await this.db.prepare('SELECT COUNT(*) AS n FROM verses').first<{ n: number }>())?.n ?? 0;
  }
  async verseAt(index: number) {
    return (await this.db.prepare(`SELECT ${VERSE_COLS} FROM verses ORDER BY chapter, verse LIMIT 1 OFFSET ?`).bind(index).first<VerseRow>()) ?? null;
  }
  async meaning(kind: string, key: string) {
    const r = await this.db.prepare("SELECT kind, key, title, body, reviewed FROM meanings WHERE kind = ? AND key = ? AND lang = 'en'").bind(kind, key).first<Parameters<typeof toMeaning>[0]>();
    return r ? toMeaning(r) : null;
  }
  async meanings(ids: string[]) {
    if (!ids.length) return [];
    const { results } = await this.db
      .prepare(`SELECT kind, key, title, body, reviewed FROM meanings WHERE lang = 'en' AND (kind || '/' || key) IN (${ids.map(() => '?').join(',')})`)
      .bind(...ids)
      .all<Parameters<typeof toMeaning>[0]>();
    return results.map(toMeaning);
  }
}

export class D1AnswerCache implements AnswerCache {
  constructor(private db: D1Database) {}
  private parse(row: { id: number; blocks: string } | null): CacheEntry | null {
    return row ? { id: row.id, blocks: JSON.parse(row.blocks) as Block[] } : null;
  }
  async exact(lang: string, hash: string) {
    return this.parse(await this.db.prepare('SELECT id, answer AS blocks FROM answer_cache WHERE lang = ? AND question_hash = ? AND disabled = 0').bind(lang, hash).first());
  }
  async byId(id: number) {
    return this.parse(await this.db.prepare('SELECT id, answer AS blocks FROM answer_cache WHERE id = ? AND disabled = 0').bind(id).first());
  }
  async put(e: Parameters<AnswerCache['put']>[0]) {
    // Two people can ask the same new question at once: the second insert keeps the first answer.
    const row = await this.db
      .prepare(
        `INSERT INTO answer_cache (lang, question, question_hash, answer, sources, model, embedding, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (lang, question_hash) DO UPDATE SET lang = excluded.lang
         RETURNING id`,
      )
      .bind(e.lang, e.question, e.hash, JSON.stringify(e.blocks), JSON.stringify(e.sources), e.model, toBlob(e.embedding), Date.now())
      .first<{ id: number }>();
    return row!.id;
  }
  async hit(id: number) {
    await this.db.prepare('UPDATE answer_cache SET hits = hits + 1, last_hit_at = ? WHERE id = ?').bind(Date.now(), id).run();
  }
}

/** Production: Cloudflare Vectorize, one namespace per library and per cache language. */
export class VectorizeSearch implements VectorSearch {
  constructor(private index: VectorizeIndex) {}
  async search(ns: Namespace, vector: number[], k: number, minScore: number) {
    const res = await this.index.query(vector, { topK: k, namespace: ns, returnValues: false, returnMetadata: 'none' });
    return res.matches.filter((m) => m.score >= minScore).map((m) => ({ id: m.id, score: m.score }));
  }
  async add(ns: Namespace, id: string, vector: number[]) {
    await this.index.upsert([{ id, values: vector, namespace: ns }]);
  }
}

/**
 * Without Vectorize (local development, tests, small deployments): loads a namespace's
 * vectors from D1 once per Worker instance and scans them in memory. The verse and meaning
 * libraries are about 1,100 vectors; the cache scan is capped at the newest 3,000 answers.
 */
const memory = new Map<Namespace, { at: number; items: { id: string; vector: Float32Array }[] }>();
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_SCAN_LIMIT = 3000;

export class MemoryVectorSearch implements VectorSearch {
  constructor(private db: D1Database) {}
  private async load(ns: Namespace) {
    const cached = memory.get(ns);
    const isCache = ns.startsWith('cache:');
    if (cached && (!isCache || Date.now() - cached.at < CACHE_TTL_MS)) return cached.items;
    let rows: { id: string | number; embedding: ArrayBuffer }[];
    if (ns === 'verses') rows = (await this.db.prepare('SELECT ref AS id, embedding FROM verses').all<{ id: string; embedding: ArrayBuffer }>()).results;
    else if (ns === 'meanings')
      rows = (await this.db.prepare("SELECT kind || '/' || key AS id, embedding FROM meanings WHERE lang = 'en' AND embedding IS NOT NULL").all<{ id: string; embedding: ArrayBuffer }>()).results;
    else
      rows = (
        await this.db
          .prepare('SELECT id, embedding FROM answer_cache WHERE lang = ? AND disabled = 0 ORDER BY id DESC LIMIT ?')
          .bind(ns.slice('cache:'.length), CACHE_SCAN_LIMIT)
          .all<{ id: number; embedding: ArrayBuffer }>()
      ).results;
    const items = rows.map((r) => ({ id: String(r.id), vector: fromBlob(r.embedding) }));
    memory.set(ns, { at: Date.now(), items });
    return items;
  }
  async search(ns: Namespace, vector: number[], k: number, minScore: number) {
    return topK(vector, await this.load(ns), k, minScore);
  }
  async add(ns: Namespace, id: string, vector: number[]) {
    memory.get(ns)?.items.unshift({ id, vector: new Float32Array(vector) });
  }
}

export class D1Usage implements Usage {
  constructor(private db: D1Database) {}
  async count(subject: string, period: string) {
    return (await this.db.prepare('SELECT count FROM usage WHERE subject = ? AND period = ?').bind(subject, period).first<{ count: number }>())?.count ?? 0;
  }
  async increment(subject: string, period: string) {
    await this.db
      .prepare('INSERT INTO usage (subject, period, count) VALUES (?, ?, 1) ON CONFLICT (subject, period) DO UPDATE SET count = count + 1')
      .bind(subject, period)
      .run();
  }
}

export class D1History implements History {
  constructor(private db: D1Database) {}
  async record(e: Parameters<History['record']>[0]) {
    let conversationId = e.conversationId ?? null;
    if (conversationId) {
      // Only continue a conversation that belongs to this person.
      const own = await this.db.prepare('SELECT 1 FROM conversations WHERE id = ? AND user_id = ?').bind(conversationId, e.userId).first();
      if (!own) conversationId = null;
    }
    const stmts: D1PreparedStatement[] = [];
    if (!conversationId) {
      conversationId = crypto.randomUUID();
      const title = e.question.length > 60 ? `${e.question.slice(0, 59).trimEnd()}…` : e.question;
      stmts.push(this.db.prepare('INSERT INTO conversations (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').bind(conversationId, e.userId, title, e.now, e.now));
    } else {
      stmts.push(this.db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').bind(e.now, conversationId));
    }
    const messageId = crypto.randomUUID();
    stmts.push(
      this.db.prepare("INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, 'user', ?, ?)").bind(crypto.randomUUID(), conversationId, e.question, e.now),
      this.db
        .prepare("INSERT INTO messages (id, conversation_id, role, content, blocks, layer, cache_id, created_at) VALUES (?, ?, 'assistant', '', ?, ?, ?, ?)")
        .bind(messageId, conversationId, JSON.stringify(e.blocks), e.layer, e.cacheId, e.now + 1),
    );
    await this.db.batch(stmts);
    return { conversationId, messageId };
  }
}
