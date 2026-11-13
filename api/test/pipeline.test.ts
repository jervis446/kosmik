import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { AiClient, Grounded } from '../src/ai.ts';
import { ask, BadQuestion, type Deps, type Identity } from '../src/pipeline.ts';
import type { AnswerCache, History, Library, Namespace, Usage, VectorSearch } from '../src/store.ts';
import { topK } from '../src/lib/vectors.ts';
import type { Block, Meaning, Verse } from '../src/types.ts';

const verses: Verse[] = [
  { ref: 'BG 2.47', chapter: 2, verse: 47, sanskrit: 'कर्मण्येवाधिकारस्ते…', iast: 'karmaṇy…', translation: 'Your right is only to work, but not to its results.', translator: 'Swami Sivananda' },
  { ref: 'BG 6.25', chapter: 6, verse: 25, sanskrit: 'शनैः शनैरुपरमेद्…', iast: 'śanaiḥ…', translation: 'Little by little, let him attain quietude.', translator: 'Swami Sivananda' },
];
const meanings: Meaning[] = [
  { kind: 'graha-house', key: 'saturn:7', title: 'Shani (Saturn) in the 7th house', body: 'Traditionally linked with commitment and patience in partnerships.', reviewed: false },
  { kind: 'tarot-upright', key: 'star', title: 'The Star (upright)', body: 'Hope and renewal.', reviewed: false },
  { kind: 'tarot-reversed', key: 'star', title: 'The Star (reversed)', body: 'Hope feels distant for now.', reviewed: false },
];

/** Toy embedding: one dimension per keyword, so similar questions get similar vectors. */
const VOCAB = ['anxiety', 'worry', 'calm', 'mind', 'result', 'work', 'karma', 'sade', 'sati', 'marriage', 'my', 'stress'];
const embedText = (t: string) => {
  const v = VOCAB.map((w) => (t.toLowerCase().includes(w) ? 1 : 0));
  return [...v, 0.01];
};

class Fakes {
  aiCalls = 0;
  embedCalls = 0;
  cacheRows: { id: number; lang: string; hash: string; blocks: Block[]; question: string }[] = [];
  vectorsByNs = new Map<string, { id: string; vector: number[] }[]>([
    ['verses', [{ id: 'BG 2.47', vector: embedText('work result karma worry') }, { id: 'BG 6.25', vector: embedText('calm mind anxiety') }]],
    ['meanings', [{ id: 'graha-house/saturn:7', vector: embedText('marriage') }]],
  ]);
  usageCounts = new Map<string, number>();
  history: { userId: string; question: string; layer: string }[] = [];
  reply: Partial<Grounded> & { answers?: string[] } = {};

  deps(now = Date.parse('2026-11-12T10:00:00Z')): Deps {
    const library: Library = {
      verse: async (c, v) => verses.find((x) => x.chapter === c && x.verse === v) ?? null,
      verses: async (refs) => verses.filter((v) => refs.includes(v.ref)),
      verseCount: async () => verses.length,
      verseAt: async (i) => verses[i] ?? null,
      meaning: async (kind, key) => meanings.find((m) => m.kind === kind && m.key === key) ?? null,
      meanings: async (ids) => meanings.filter((m) => ids.includes(`${m.kind}/${m.key}`)),
    };
    const cache: AnswerCache = {
      exact: async (lang, hash) => this.cacheRows.find((r) => r.lang === lang && r.hash === hash) ?? null,
      byId: async (id) => this.cacheRows.find((r) => r.id === id) ?? null,
      put: async (e) => {
        const id = this.cacheRows.length + 1;
        this.cacheRows.push({ id, lang: e.lang, hash: e.hash, blocks: e.blocks, question: e.question });
        return id;
      },
      hit: async () => {},
    };
    const vectors: VectorSearch = {
      search: async (ns: Namespace, v, k, min) => topK(v, this.vectorsByNs.get(ns) ?? [], k, min),
      add: async (ns, id, v) => void this.vectorsByNs.set(ns, [...(this.vectorsByNs.get(ns) ?? []), { id, vector: v }]),
    };
    const usage: Usage = {
      count: async (s, p) => this.usageCounts.get(`${s}|${p}`) ?? 0,
      increment: async (s, p) => void this.usageCounts.set(`${s}|${p}`, (this.usageCounts.get(`${s}|${p}`) ?? 0) + 1),
    };
    const history: History = {
      record: async (e) => {
        this.history.push({ userId: e.userId, question: e.question, layer: e.layer });
        return { conversationId: e.conversationId ?? 'conv-1', messageId: `msg-${this.history.length}` };
      },
    };
    const ai: AiClient = {
      model: 'test-model',
      embed: async (t) => {
        this.embedCalls++;
        return embedText(t);
      },
      answer: async (_q, _lang, sources) => {
        this.aiCalls++;
        const scripted = this.reply.answers?.shift();
        return {
          answer: scripted ?? this.reply.answer ?? 'Focus on your effort, not the outcome.',
          cited: this.reply.cited ?? sources.verses.map((v) => v.ref),
          personal: this.reply.personal ?? false,
          offTopic: false,
        };
      },
    };
    return { library, cache, vectors, usage, history, ai, now: () => now, random: () => 0 };
  }
}

const user: Identity = { kind: 'user', id: 'u1', premium: false };

test('layer 1: a verse reference is answered without AI or embeddings', async () => {
  const f = new Fakes();
  const r = await ask(f.deps(), { question: 'Gita 2.47', identity: user });
  assert.equal(r.layer, 'direct');
  assert.equal(f.aiCalls + f.embedCalls, 0);
  const verse = r.blocks.find((b) => b.type === 'verse');
  assert.equal(verse?.type === 'verse' && verse.ref, 'BG 2.47');
  assert.equal(r.remaining, 10);
  assert.equal(f.history.length, 1);
});

test('layer 1: tarot draw uses the library meanings', async () => {
  const f = new Fakes();
  const r = await ask(f.deps(), { question: 'pull a tarot card', identity: user });
  const tarot = r.blocks.find((b) => b.type === 'tarot');
  assert.equal(r.layer, 'direct');
  assert.ok(tarot?.type === 'tarot' && tarot.cards.length === 1);
  assert.equal(f.aiCalls, 0);
});

test('only generic answers go in the shared cache', async () => {
  const { cacheable } = await import('../src/pipeline.ts');
  assert.ok(cacheable('How can I calm my restless mind?', false), 'everyday "I" and "my" are fine');
  assert.ok(!cacheable('Will my marriage happen this year?', false));
  assert.ok(!cacheable('meri kundli mein shani kaisa hai', false));
  assert.ok(!cacheable('Born 12/04/1999 at 10:30 in Pune, what is my lagna?', false));
  assert.ok(!cacheable('Contact me at a@b.com', false));
  assert.ok(!cacheable('What is karma?', true), 'the model said it was personal');
});

test('layer 4 then layers 2 and 3: a new question is answered once, then served from the cache', async () => {
  const f = new Fakes();
  const first = await ask(f.deps(), { question: 'How do I stop worrying about the result of my career?', identity: user });
  // About their own career: answered, not cached.
  assert.equal(first.layer, 'ai');
  assert.equal(f.cacheRows.length, 0);

  const generic = await ask(f.deps(), { question: 'What does the Gita say about worry over results of work?', identity: user });
  assert.equal(generic.layer, 'ai');
  assert.equal(f.cacheRows.length, 1);
  assert.equal(f.aiCalls, 2);

  const again = await ask(f.deps(), { question: '  what does the gita say about WORRY over results of work ', identity: user });
  assert.equal(again.layer, 'exact');
  assert.deepEqual(again.blocks, generic.blocks);

  const reworded = await ask(f.deps(), { question: 'Gita on worry about the results of work', identity: user });
  assert.equal(reworded.layer, 'semantic');
  assert.equal(f.aiCalls, 2, 'no new AI calls for repeats');
});

test('layer 4: citations the model was not given are dropped', async () => {
  const f = new Fakes();
  f.reply = { cited: ['BG 2.47', 'BG 99.1', 'made-up'] };
  const r = await ask(f.deps(), { question: 'What is karma and work?', identity: user });
  const refs = r.blocks.filter((b) => b.type === 'verse').map((b) => (b.type === 'verse' ? b.ref : ''));
  assert.deepEqual(refs, ['BG 2.47']);
});

test('layer 4: a reply that breaks the rules is retried, then replaced, and never cached', async () => {
  const f = new Fakes();
  f.reply = { answers: ['You will die young.', 'This stone cures stress.'] };
  const r = await ask(f.deps(), { question: 'What does stress mean spiritually?', identity: user });
  assert.equal(f.aiCalls, 2);
  assert.equal(r.blocks.length, 1);
  assert.match(r.blocks[0].type === 'text' ? r.blocks[0].text : '', /reliable answer/);
  assert.equal(f.cacheRows.length, 0);
  assert.equal(r.remaining, 11, 'a failed answer does not use up a question');
});

test('personal answers from the model are flagged and not cached', async () => {
  const f = new Fakes();
  f.reply = { personal: true };
  const r = await ask(f.deps(), { question: 'Will sade sati affect marriage timing?', identity: user });
  assert.ok(r.blocks.some((b) => b.type === 'notice' && b.kind === 'needs-chart'));
  assert.equal(f.cacheRows.length, 0);
});

test('crisis questions get the helpline and use no allowance', async () => {
  const f = new Fakes();
  const r = await ask(f.deps(), { question: 'I want to die', identity: user });
  assert.equal(r.layer, 'safety');
  assert.ok(r.blocks.some((b) => b.type === 'notice' && b.kind === 'helpline' && b.text.includes('14416')));
  assert.equal(f.aiCalls, 0);
  assert.equal(r.remaining, 11);
});

test('starter accounts get 11 questions a week; premium is unlimited; guests get 3 a day', async () => {
  const f = new Fakes();
  for (let i = 0; i < 11; i++) await ask(f.deps(), { question: 'Gita 2.47', identity: user });
  const blocked = await ask(f.deps(), { question: 'Gita 2.47', identity: user });
  assert.equal(blocked.layer, 'limit');
  assert.equal(blocked.remaining, 0);
  // Next Monday it refills.
  const nextWeek = await ask(f.deps(Date.parse('2026-11-16T10:00:00Z')), { question: 'Gita 2.47', identity: user });
  assert.equal(nextWeek.layer, 'direct');

  const premium = await ask(f.deps(), { question: 'Gita 2.47', identity: { kind: 'user', id: 'p1', premium: true } });
  assert.equal(premium.remaining, null);

  const guest: Identity = { kind: 'guest', subject: 'guest:abc' };
  for (let i = 0; i < 3; i++) await ask(f.deps(), { question: 'Gita 2.47', identity: guest });
  const g = await ask(f.deps(), { question: 'Gita 2.47', identity: guest });
  assert.ok(g.blocks.some((b) => b.type === 'notice' && b.kind === 'sign-in'));
  assert.equal(f.history.filter((h) => h.userId === 'guest:abc').length, 0, 'guests have no stored history');
});

test('notices (needs chart, coming soon) do not use up questions', async () => {
  const f = new Fakes();
  const r = await ask(f.deps(), { question: 'Explain my kundli', identity: user });
  assert.equal(r.remaining, 11);
  assert.ok(r.blocks.some((b) => b.type === 'notice' && b.kind === 'needs-chart'));
});

test('input validation', async () => {
  const f = new Fakes();
  await assert.rejects(ask(f.deps(), { question: ' ', identity: user }), BadQuestion);
  await assert.rejects(ask(f.deps(), { question: 'x'.repeat(501), identity: user }), BadQuestion);
});

test('answers follow the question language, and caches are kept per language', async () => {
  const f = new Fakes();
  const hi = await ask(f.deps(), { question: 'गीता 2.47', identity: user });
  assert.equal(hi.lang, 'hi');
  assert.match(hi.blocks[0].type === 'text' ? hi.blocks[0].text : '', /श्लोक/);
  await ask(f.deps(), { question: 'What does the Gita say about worry over results of work?', identity: user });
  const hinglish = await ask(f.deps(), { question: 'What does the Gita say about worry over results of work?', identity: user, lang: 'hinglish' });
  assert.equal(hinglish.layer, 'ai', 'a cached English answer is not served to a Hinglish question');
});

test('when the AI model is down, library and cached answers still work and new questions are not counted', async () => {
  const f = new Fakes();
  const q = 'What does the Gita say about worry over results of work?';
  await ask(f.deps(), { question: q, identity: user });
  const deps = f.deps();
  deps.ai.embed = async () => {
    throw new Error('daily free allocation used up');
  };

  const cached = await ask(deps, { question: q, identity: user });
  assert.equal(cached.layer, 'exact');

  const direct = await ask(deps, { question: 'Gita 2.47', identity: user });
  assert.equal(direct.layer, 'direct');

  const before = direct.remaining;
  const fresh = await ask(deps, { question: 'How should one face grief?', identity: user });
  assert.equal(fresh.layer, 'ai');
  assert.ok(fresh.blocks.some((b) => b.type === 'notice' && b.kind === 'busy'));
  assert.equal(fresh.remaining, before, 'a failed answer must not use up a question');
});
