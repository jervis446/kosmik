/**
 * Builds Shanti's passages library from public-domain translations (Mahabharata, Ramayana,
 * Upanishads, Yoga Vasishtha):
 *   1. splits the texts into passages and keeps those that speak most to pain (passages.ts);
 *      scanned volumes only where every word reads cleanly;
 *   2. Gemini scores each, in batches, for how much it would comfort someone hurting today
 *      (it never rewrites them: the text in passages.json is the translator's, word for word);
 *   3. keeps the best of each work (score 4 or 5, up to its share; about 310 in all) and embeds them.
 *
 * Writes data/passages.json and data/vectors/passages.json. Picks are saved as they come in
 * (data/sources/raw/passage-picks.json), so a run that stops can be started again.
 *
 * Needs the texts in data/sources/raw (see data/sources/README.txt) and GEMINI_API_KEY.
 * Usage: node data/scripts/build-passages.ts
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { DEFAULT_CHAT_MODEL, EMBED_DIMS, EMBED_MODEL } from '../../api/src/ai.ts';
import { embedBatch, toBase64 } from './embed.ts';
import { gemini } from './gemini.ts';
import { type Candidate, type Pick, parsePicks, prefilter, type Ranked, readable, splitMahabharata, splitRamayana, splitUpanishads, splitYogaVasishtha, THEME_NAMES, vocabulary } from './passages.ts';

const root = new URL('../', import.meta.url);
const at = (p: string) => new URL(p, root);

type Source = {
  files: string[];
  split: (raw: string, file: string) => Candidate[];
  source: string;
  /** How many go to the model, and how many can be kept, so no one work crowds out the others. */
  candidates: number;
  keep: number;
  minThemes?: number;
  /** Scanned (OCR) text: only passages that read cleanly word for word are used. */
  scanned?: boolean;
};

const SOURCES: Source[] = [
  {
    files: ['pg15474.txt', 'pg15475.txt', 'pg15476.txt', 'pg15477.txt'].map((f) => `sources/raw/mahabharata-ganguli/${f}`),
    split: splitMahabharata,
    source: 'The Mahabharata of Krishna-Dwaipayana Vyasa, translated by Kisari Mohan Ganguli (1883–1896), public domain. Text from Project Gutenberg eBooks 15474–15477.',
    candidates: 900,
    keep: 140,
  },
  {
    files: ['sources/raw/ramayana-griffith/pg24869.txt'],
    split: splitRamayana,
    source: 'The Rámáyan of Válmíki, translated into English verse by Ralph T. H. Griffith (1870–1874), public domain. Text from Project Gutenberg eBook 24869.',
    candidates: 400,
    keep: 60,
  },
  {
    files: ['sources/raw/upanishads-paramananda/pg3283.txt'],
    split: splitUpanishads,
    source: 'The Upanishads (Isa, Katha, Kena), translated with commentary by Swami Paramananda (1919), public domain. Text from Project Gutenberg eBook 3283.',
    candidates: 200,
    keep: 50,
    minThemes: 0,
  },
  {
    files: ['sources/raw/yoga-vasishtha-mitra/pg46531.txt'],
    split: (raw) => splitYogaVasishtha(raw, '3b'),
    source: 'The Yoga-Vasishtha Maharamayana of Valmiki, translated by Vihari-Lala Mitra (1891–1899), public domain. Vol. 3 part 2 from Project Gutenberg eBook 46531.',
    candidates: 300,
    keep: 40,
  },
  {
    files: ['sources/raw/yoga-vasishtha-mitra/vol2_djvu.txt', 'sources/raw/yoga-vasishtha-mitra/vol4_djvu.txt'],
    split: (raw, file) => splitYogaVasishtha(raw, file.includes('vol2') ? '2' : '4'),
    source:
      'The Yoga-Vasishtha Maharamayana of Valmiki, translated by Vihari-Lala Mitra (1891–1899), public domain. Vols. 2 and 4 from scans on the Internet Archive (yogavasishthamah0002unse, in.ernet.dli.2015.96046); scanned text, checked word by word.',
    candidates: 150,
    keep: 20,
    scanned: true,
  },
];

/** Words known to be spelt right: the system word list and every word of the clean (non-scanned) texts. */
function dictionary(): Set<string> {
  const words = existsSync('/usr/share/dict/words') ? readFileSync('/usr/share/dict/words', 'utf8').split('\n') : [];
  const clean = SOURCES.filter((s) => !s.scanned).flatMap((s) => s.files.map((f) => readFileSync(at(f), 'utf8')));
  return vocabulary(words, clean);
}

const BATCH = 30;
const KEEP_SCORE = 4;
const PICKS = 'sources/raw/passage-picks.json';

const PROMPT = `You help build a library for Shanti, a space where young Indians talk through a breakup, a death, failure, loneliness, fights at home, fear or anger, and get comfort from Hindu scripture.
You get numbered passages from a 19th-century English translation. Score each from 1 to 5 for how well it, quoted on its own, would comfort or steady such a person today. If the text has scanning errors (misspelt or broken words, stray letters or numbers), score it 1: it is quoted word for word.
5: a clear, self-contained teaching on grief, loss, impermanence, letting go, anger, fear, adversity or self-worth that a modern reader can follow.
4: good, but needs a line of context.
3 or lower: mostly story, battle, ritual, genealogy, praise of kings or brahmins, caste rules, or harsh or outdated views (on women, caste, punishment, suicide). Score those 1.
Give each passage the themes it truly speaks to, from: ${THEME_NAMES.join(', ')}.
Reply with JSON only: {"picks": [{"id": "<id>", "score": 1-5, "themes": ["..."]}]} with one entry per passage.`;

async function score(batch: Ranked[]): Promise<Pick[]> {
  const out = await gemini<{ choices?: { message?: { content?: string } }[] }>('/chat/completions', {
    model: DEFAULT_CHAT_MODEL,
    messages: [
      { role: 'system', content: PROMPT },
      { role: 'user', content: batch.map((c) => `[${c.ref}] (${c.location})\n${c.text}`).join('\n\n') },
    ],
    response_format: { type: 'json_object' },
    reasoning_effort: 'minimal',
    temperature: 0.2,
    max_tokens: 4000,
  });
  return parsePicks(out.choices?.[0]?.message?.content ?? '', batch.map((c) => c.ref));
}

async function main() {
  const missing = SOURCES.flatMap((s) => s.files).filter((f) => !existsSync(at(f)));
  if (missing.length) throw new Error(`Missing ${missing.join(', ')}: see data/sources/README.txt`);
  const dict = dictionary();
  const candidates: (Ranked & { source: string; keep: number })[] = [];
  for (const s of SOURCES) {
    let all = s.files.flatMap((f) => s.split(readFileSync(at(f), 'utf8'), f));
    if (s.scanned) all = all.filter((c) => readable(c.text, dict));
    const picked = prefilter(all, s.candidates, s.minThemes);
    console.log(`${s.files[0].split('/')[2]}: ${all.length} passages, ${picked.length} candidates`);
    candidates.push(...picked.map((c) => ({ ...c, source: s.source, keep: s.keep })));
  }
  console.log(`${candidates.length} candidates`);

  const picks: Record<string, Pick> = existsSync(at(PICKS)) ? JSON.parse(readFileSync(at(PICKS), 'utf8')) : {};
  const todo = candidates.filter((c) => !picks[c.ref]);
  for (let i = 0; i < todo.length; i += BATCH) {
    for (const p of await score(todo.slice(i, i + BATCH))) picks[p.id] = p;
    writeFileSync(at(PICKS), JSON.stringify(picks));
    process.stdout.write(`\rscored ${Math.min(i + BATCH, todo.length)}/${todo.length}`);
  }

  // The best of each work, up to its share.
  const kept = SOURCES.flatMap((s) =>
    candidates
      .filter((c) => c.source === s.source && (picks[c.ref]?.score ?? 0) >= KEEP_SCORE)
      .sort((a, b) => picks[b.ref].score - picks[a.ref].score || b.score - a.score)
      .slice(0, s.keep),
  ).sort((a, b) => a.ref.localeCompare(b.ref, 'en', { numeric: true }));
  const passages = kept.map((c) => ({
    ref: c.ref,
    work: c.work,
    location: c.location,
    text: c.text,
    translator: c.translator,
    source: c.source,
    themes: picks[c.ref].themes.length ? picks[c.ref].themes : c.themes,
    reviewed: false,
  }));
  writeFileSync(at('passages.json'), JSON.stringify(passages, null, 1) + '\n');
  console.log(`\nKept ${passages.length} passages in data/passages.json`);

  const vectors: Record<string, string> = {};
  for (let i = 0; i < passages.length; i += 50) {
    const batch = passages.slice(i, i + 50);
    const data = await embedBatch(batch.map((p) => `${p.work}, ${p.location}: ${p.text}`));
    batch.forEach((p, j) => (vectors[p.ref] = toBase64(data[j])));
  }
  writeFileSync(at('vectors/passages.json'), JSON.stringify({ model: EMBED_MODEL, dims: EMBED_DIMS, vectors }) + '\n');
  console.log(`Wrote ${Object.keys(vectors).length} vectors to data/vectors/passages.json`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
