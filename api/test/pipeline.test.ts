import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { AiClient, Grounded, PalmReading } from '../src/ai.ts';
import { ask, BadQuestion, chartSources, type Deps, type Identity } from '../src/pipeline.ts';
import type { PalmPhoto, Profile } from '../src/profiles.ts';
import { calculateChart } from '../src/lib/chart.ts';
import type { AnswerCache, History, Library, Namespace, Usage, VectorSearch } from '../src/store.ts';
import { topK } from '../src/lib/vectors.ts';
import type { Block, Meaning, Verse } from '../src/types.ts';
import type { Herb, Prakriti } from '../src/ayurveda.ts';

const herbs: Herb[] = [
  { key: 'tulsi', name: 'Tulsi', english: 'Holy Basil', botanical: 'Ocimum sanctum', rasa: ['Katu', 'Tikta'], guna: ['Laghu'], virya: 'Ushna', vipaka: 'Katu', pacify: ['vata', 'kapha'], aggravate: ['pitta'], parts: ['Patra'], description: 'In Ayurveda, Tulsi is traditionally used to support clarity.', caution: false, link: 'https://www.amidhaayurveda.com/p/tulsi.html' },
  { key: 'amla', name: 'Amla', english: 'Indian Gooseberry', botanical: 'Emblica officinalis', rasa: ['Amla'], guna: ['Laghu'], virya: 'Sheeta', vipaka: 'Madhura', pacify: ['vata', 'pitta', 'kapha'], aggravate: [], parts: ['Phala'], description: 'In Ayurveda, Amla is traditionally valued as a rasayana.', caution: false, link: 'https://www.amidhaayurveda.com/p/amla.html' },
];

const verses: Verse[] = [
  { ref: 'BG 2.47', chapter: 2, verse: 47, sanskrit: 'कर्मण्येवाधिकारस्ते…', iast: 'karmaṇy…', translation: 'Your right is only to work, but not to its results.', translator: 'Swami Sivananda' },
  { ref: 'BG 6.25', chapter: 6, verse: 25, sanskrit: 'शनैः शनैरुपरमेद्…', iast: 'śanaiḥ…', translation: 'Little by little, let him attain quietude.', translator: 'Swami Sivananda' },
];
const meanings: Meaning[] = [
  { kind: 'graha-house', key: 'saturn:7', title: 'Shani (Saturn) in the 7th house', body: 'Traditionally linked with commitment and patience in partnerships.', reviewed: false },
  { kind: 'tarot-upright', key: 'star', title: 'The Star (upright)', body: 'Hope and renewal.', reviewed: false },
  { kind: 'tarot-reversed', key: 'star', title: 'The Star (reversed)', body: 'Hope feels distant for now.', reviewed: false },
  { kind: 'dosha', key: 'pitta', title: 'Pitta dosha (fire and water)', body: 'The dosha of transformation.', reviewed: false },
  { kind: 'prakriti-care', key: 'pitta', title: 'Daily care for a Pitta prakriti', body: 'Cooling, calm and moderation.', reviewed: false },
  { kind: 'herb', key: 'amla', title: 'Amla (Indian Gooseberry)', body: 'Traditionally valued as a rasayana.', reviewed: false },
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
  cacheRows: { id: number; lang: string; hash: string; blocks: Block[]; question: string; sources: string[]; sourcesHash: string | null; disabled: boolean }[] = [];
  vectorsByNs = new Map<string, { id: string; vector: number[] }[]>([
    ['verses', [{ id: 'BG 2.47', vector: embedText('work result karma worry') }, { id: 'BG 6.25', vector: embedText('calm mind anxiety') }]],
    ['meanings', [{ id: 'graha-house/saturn:7', vector: embedText('marriage') }]],
  ]);
  usageCounts = new Map<string, number>();
  history: { userId: string; question: string; layer: string }[] = [];
  reply: Partial<Grounded> & { answers?: string[] } = {};
  palmReplies: PalmReading[] = [];
  palmCalls = 0;
  palmImages: { hand?: string }[] = [];
  palmQuestion: string | undefined;
  profile: Profile | null = null;
  photos: PalmPhoto[] = [];
  chartsSeen: string[] = [];
  prakriti: Prakriti | null = null;

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
      exact: async (lang, hash) => this.cacheRows.find((r) => r.lang === lang && r.hash === hash && !r.disabled) ?? null,
      byId: async (id) => this.cacheRows.find((r) => r.id === id && !r.disabled) ?? null,
      put: async (e) => {
        const row = { lang: e.lang, hash: e.hash, blocks: e.blocks, question: e.question, sources: e.sources, sourcesHash: e.sourcesHash, disabled: false };
        const existing = this.cacheRows.find((r) => r.lang === e.lang && r.hash === e.hash);
        if (existing?.disabled) Object.assign(existing, row);
        if (existing) return existing.id;
        const id = this.cacheRows.length + 1;
        this.cacheRows.push({ id, ...row });
        return id;
      },
      hit: async () => {},
      retire: async (id) => {
        const r = this.cacheRows.find((x) => x.id === id);
        if (r) r.disabled = true;
      },
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
      answer: async (_q, _lang, sources, _stricter, chart) => {
        this.aiCalls++;
        if (chart) this.chartsSeen.push(chart);
        const scripted = this.reply.answers?.shift();
        return {
          answer: scripted ?? this.reply.answer ?? 'Focus on your effort, not the outcome.',
          cited: this.reply.cited ?? sources.verses.map((v) => v.ref),
          personal: this.reply.personal ?? false,
          offTopic: false,
        };
      },
      readPalm: async (images, _lang, opts) => {
        this.palmCalls++;
        this.palmImages = images;
        this.palmQuestion = opts?.question;
        const next = this.palmReplies.shift();
        if (!next) throw new Error('model down');
        return next;
      },
    };
    const profiles = { get: async () => this.profile, palms: async () => this.photos };
    const ayurveda = {
      herb: async (k: string) => herbs.find((h) => h.key === k) ?? null,
      herbs: async (keys: string[]) => herbs.filter((h) => keys.includes(h.key)),
      findHerbs: async (f: { dosha?: string; effect: string }, limit: number) => {
        const all = herbs.filter((h) => !f.dosha || (f.effect === 'pacify' ? h.pacify : h.aggravate).includes(f.dosha as never));
        return { herbs: all.slice(0, limit), total: all.length };
      },
      prakriti: async () => this.prakriti,
    };
    return { library, cache, vectors, usage, history, ai, profiles, ayurveda, now: () => now, random: () => 0 };
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
  assert.ok(r.blocks.some((b) => b.type === 'notice' && b.kind === 'needs-details'));
  assert.equal(f.cacheRows.length, 0);

  // With birth details saved, the same question is answered from the person's chart instead.
  f.profile = birth;
  const withChart = await ask(f.deps(), { question: 'Will sade sati affect marriage timing?', identity: user });
  assert.ok(withChart.blocks.some((b) => b.type === 'chart'));
  assert.equal(f.chartsSeen.length, 1);
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

test('notices (needs details, coming soon) do not use up questions', async () => {
  const f = new Fakes();
  const r = await ask(f.deps(), { question: 'Explain my kundli', identity: user });
  assert.equal(r.remaining, 11);
  assert.ok(r.blocks.some((b) => b.type === 'notice' && b.kind === 'needs-details'));
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

test('a cached answer is retired and rewritten when a verse it cites is edited', async () => {
  const f = new Fakes();
  const q = 'How do I stop worry about the result of my work?';
  await ask(f.deps(), { question: q, lang: 'en', identity: user });
  const again = await ask(f.deps(), { question: q, lang: 'en', identity: user });
  assert.equal(again.layer, 'exact');
  assert.equal(f.aiCalls, 1);

  const original = verses[0].translation;
  verses[0].translation = 'You have a right to your actions, never to their fruits.';
  try {
    const fresh = await ask(f.deps(), { question: q, lang: 'en', identity: user });
    assert.equal(fresh.layer, 'ai', 'stale answer is not served');
    assert.equal(f.aiCalls, 2);
    const verse = fresh.blocks.find((b) => b.type === 'verse');
    assert.equal(verse?.type === 'verse' && verse.translation, verses[0].translation, 'new answer shows the edited text');
    assert.equal(f.cacheRows.length, 1, 'the retired row is replaced, not duplicated');
    assert.equal(f.cacheRows[0].disabled, false);
    assert.equal((await ask(f.deps(), { question: q, lang: 'en', identity: user })).layer, 'exact', 'and cached again');
  } finally {
    verses[0].translation = original;
  }
});

test('a same-meaning match is not served when its sources changed, nor when it predates fingerprints', async () => {
  const f = new Fakes();
  await ask(f.deps(), { question: 'How do I calm my anxiety and mind?', lang: 'en', identity: user });
  f.cacheRows[0].sourcesHash = null; // as if cached before fingerprints existed
  const r = await ask(f.deps(), { question: 'Calm the anxiety in my mind, how?', lang: 'en', identity: user });
  assert.equal(r.layer, 'ai');
  assert.equal(f.cacheRows[0].disabled, true);
});

const goodPalm: PalmReading = {
  isPalm: true,
  overview: 'A square palm with clear, steady lines.',
  lines: [
    { name: 'Heart line', reading: 'Long and curved: palmistry links this with warmth.' },
    { name: 'Head line', reading: 'Straight and deep: a practical, focused thinker.' },
  ],
};
const bothHands: PalmPhoto[] = [
  { hand: 'left', mime: 'image/jpeg', data: 'TEZU' },
  { hand: 'right', mime: 'image/jpeg', data: 'UklHSFQ=' },
];
const birth: Profile = { name: 'Asha', birthDate: '1998-03-14', birthTime: '06:45', place: 'Lucknow, Uttar Pradesh, India', lat: 26.85, lon: 80.95, tzOffsetMin: 330 };

test('palm question without saved photos: asks for them, not counted, no AI call', async () => {
  const f = new Fakes();
  const r = await ask(f.deps(), { question: 'Read my palm please', lang: 'en', identity: user });
  assert.deepEqual(r.blocks.map((b) => b.type === 'notice' && b.kind), ['needs-palm']);
  assert.equal(r.remaining, 11);
  assert.equal(f.palmCalls, 0);
});

test('palm question with both hands saved: both photos and the question go to the model, counted', async () => {
  const f = new Fakes();
  f.photos = bothHands;
  f.palmReplies = [goodPalm];
  const r = await ask(f.deps(), { question: 'What does my heart line say?', lang: 'en', identity: user });
  assert.equal(r.layer, 'ai');
  assert.deepEqual(r.blocks[1], { type: 'palm', lines: goodPalm.lines });
  assert.deepEqual(f.palmImages.map((i) => i.hand), ['left', 'right']);
  assert.equal(f.palmQuestion, 'What does my heart line say?');
  assert.equal(r.remaining, 10);
});

test('palm: unclear photos ask for new ones; unsafe twice or the model down are not counted', async () => {
  const f = new Fakes();
  f.photos = bothHands;
  f.palmReplies = [{ isPalm: false, overview: 'The right-hand photo shows the back of the hand.', lines: [] }];
  const unclear = await ask(f.deps(), { question: 'read my palm', lang: 'en', identity: user });
  assert.equal(unclear.blocks[0].type === 'notice' && unclear.blocks[0].kind, 'retake');
  assert.equal(unclear.remaining, 11);

  const scary = { ...goodPalm, lines: [{ name: 'Life line', reading: 'A short life line means you will die young.' }] };
  f.palmReplies = [scary, scary];
  const unsafe = await ask(f.deps(), { question: 'hast rekha batao', lang: 'en', identity: user });
  assert.doesNotMatch(JSON.stringify(unsafe.blocks), /die young/);
  assert.equal(unsafe.remaining, 11);

  const down = await ask(f.deps(), { question: 'my palm reading', lang: 'en', identity: user });
  assert.equal(down.blocks[0].type === 'notice' && down.blocks[0].kind, 'busy');
  assert.equal(down.remaining, 11);
});

test('own-chart question without birth details: asks for them, not counted', async () => {
  const f = new Fakes();
  const r = await ask(f.deps(), { question: 'What does my kundli say about career?', lang: 'en', identity: user });
  assert.deepEqual(r.blocks.map((b) => b.type === 'notice' && b.kind), ['needs-details']);
  assert.equal(r.remaining, 11);
  assert.equal(f.aiCalls, 0);
});

test('own-chart question with birth details: calculated chart goes to the model and is shown', async () => {
  const f = new Fakes();
  f.profile = birth;
  f.reply = { answer: 'Your chart shows a steady, practical approach to work.', cited: [] };
  const r = await ask(f.deps(), { question: 'What does my kundli say about career?', lang: 'en', identity: user });
  assert.equal(r.layer, 'ai');
  assert.equal(r.blocks[0].type === 'text' && r.blocks[0].text, 'Your chart shows a steady, practical approach to work.');
  const chart = r.blocks.find((b) => b.type === 'chart');
  assert.ok(chart && chart.type === 'chart' && chart.lagna && chart.rows.length === 9 && chart.rows.every((x) => x.house));
  assert.match(f.chartsSeen[0], /^CHART \(calculated[^\n]*\nLagna \(ascendant\): /);
  assert.equal(r.remaining, 10);
});

test('chart sources follow the question: marriage looks at the 7th house, a named graha at its placement', () => {
  const chart = calculateChart({ date: birth.birthDate, time: birth.birthTime, tzOffsetMin: 330, lat: birth.lat, lon: birth.lon });
  const seventh = chart.grahas.filter((p) => p.house === 7).map((p) => `graha-house/${p.graha}:7`);
  const forMarriage = chartSources(chart, 'meri shaadi ke baare mein kundli kya kehti hai');
  for (const id of seventh) assert.ok(forMarriage.includes(id), id);
  assert.ok(forMarriage.includes(`rashi/${chart.lagna!.rashi}`));
  const saturn = chart.grahas.find((p) => p.graha === 'saturn')!;
  assert.ok(chartSources(chart, 'What does Saturn do in my chart?').includes(`graha-house/saturn:${saturn.house}`));
  assert.ok(forMarriage.length <= 6);
});

test('ayurveda: a herb name gets its herb card without AI, counted', async () => {
  const f = new Fakes();
  const r = await ask(f.deps(), { question: 'What is Tulsi?', lang: 'en', identity: user });
  assert.equal(r.layer, 'direct');
  const card = r.blocks.find((b) => b.type === 'herb');
  assert.ok(card && card.type === 'herb' && card.name === 'Tulsi' && card.pacify.includes('kapha'));
  assert.equal(f.aiCalls + f.embedCalls, 0);
  assert.equal(r.remaining, 10);
});

test('ayurveda: "which herbs balance pitta" lists herbs from the data, without AI', async () => {
  const f = new Fakes();
  const r = await ask(f.deps(), { question: 'Which herbs balance Pitta?', lang: 'en', identity: user });
  const list = r.blocks.find((b) => b.type === 'herb-list');
  assert.ok(list && list.type === 'herb-list');
  assert.equal(list.title, 'Herbs that balance Pitta');
  assert.deepEqual(list.herbs.map((h) => h.key), ['amla']);
  assert.equal(f.aiCalls, 0);
});

test('ayurveda: own prakriti without the quiz asks for it, not counted; with it, shows the result', async () => {
  const f = new Fakes();
  const none = await ask(f.deps(), { question: 'What is my dosha?', lang: 'en', identity: user });
  assert.deepEqual(none.blocks.map((b) => b.type === 'notice' && b.kind), ['needs-prakriti']);
  assert.equal(none.remaining, 11);

  f.prakriti = { vata: 25, pitta: 58, kapha: 17, takenAt: 1 };
  const mine = await ask(f.deps(), { question: 'What is my dosha?', lang: 'en', identity: user });
  const p = mine.blocks.find((b) => b.type === 'prakriti');
  assert.ok(p && p.type === 'prakriti' && p.label === 'Pitta');
  assert.ok(mine.blocks.some((b) => b.type === 'meaning' && b.kind === 'prakriti-care' && b.key === 'pitta'));
  assert.equal(f.aiCalls, 0);

  const retake = await ask(f.deps(), { question: 'Retake the dosha quiz', lang: 'en', identity: user });
  assert.deepEqual(retake.blocks.map((b) => b.type === 'notice' && b.kind), ['needs-prakriti']);
});

test('ayurveda: diet for my prakriti goes to the model with the quiz result, never cached', async () => {
  const f = new Fakes();
  f.prakriti = { vata: 25, pitta: 58, kapha: 17, takenAt: 1 };
  f.reply = { answer: 'For your prakriti, favour cooling, fresh food.', cited: ['prakriti-care/pitta', 'herb/amla'] };
  const r = await ask(f.deps(), { question: 'What should I eat for my prakriti?', lang: 'en', identity: user });
  assert.equal(r.layer, 'ai');
  assert.match(f.chartsSeen[0], /^PRAKRITI .*Pitta 58%/);
  assert.deepEqual(r.blocks.map((b) => b.type), ['text', 'prakriti', 'meaning', 'herb']);
  assert.equal(f.cacheRows.length, 0);
  assert.equal(r.remaining, 10);
});

test('ayurveda: a herb for a health problem or a dose gets no advice, the herb card, and is not counted', async () => {
  const f = new Fakes();
  const r = await ask(f.deps(), { question: 'Can tulsi help with cold and cough?', lang: 'en', identity: user });
  assert.equal(r.layer, 'direct');
  assert.match(r.blocks[0].type === 'text' ? r.blocks[0].text : '', /doctor or a qualified Ayurvedic practitioner/);
  assert.ok(r.blocks.some((b) => b.type === 'herb' && b.key === 'tulsi'));
  assert.equal(f.aiCalls, 0);
  assert.equal(r.remaining, 11);
});
