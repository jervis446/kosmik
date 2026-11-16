/**
 * Translates the libraries into Hindi with Gemini, for people who pick हिंदी:
 *   data/meanings-hi.json     every meaning card (astrology, tarot, herbs, Ayurveda concepts)
 *   data/herb-names-hi.json   each herb's name in Devanagari
 *   data/verses-hi.json       a Hindi rendering of each Gita verse, made from the Sanskrit and the
 *                             public-domain English translation, credited to Kosmik
 * Resumable: items already translated are kept, so it can be re-run after a failure.
 *
 * Usage: GEMINI_API_KEY=... NODE_USE_ENV_PROXY=1 node data/scripts/translate-hi.ts [meanings|herbs|verses]
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { gemini } from './gemini.ts';

const MODEL = process.env.CHAT_MODEL ?? 'gemini-3.5-flash';
const root = new URL('../', import.meta.url);
const read = <T>(p: string): T => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const write = (p: string, v: unknown) => writeFileSync(new URL(p, root), `${JSON.stringify(v, null, 1)}\n`);

type Meaning = { kind: string; key: string; lang: string; title: string; body: string; reviewed: boolean };

const STYLE = `Write natural, warm, everyday Hindi in Devanagari, the way an educated Indian speaks, not stiff textbook Hindi.
Keep Sanskrit and Ayurveda/Jyotish terms, written in Devanagari (Vata → वात, Pitta → पित्त, Kapha → कफ, Surya → सूर्य, Mesh → मेष, Ashwini → अश्विनी, rasa → रस, guna → गुण, virya → वीर्य, vipaka → विपाक, mahadasha → महादशा).
Tarot card names: Hindi rendering with the English name in brackets the first time, e.g. "द स्टार (The Star)".
Botanical (Latin) names, numbers and units stay as they are.
Translate faithfully: do not add, drop or soften anything, and keep every caution.`;

async function ask(system: string, payload: unknown): Promise<Record<string, unknown>> {
  const out = await gemini<{ choices?: { message?: { content?: string } }[] }>('/chat/completions', {
    model: MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: JSON.stringify(payload) },
    ],
    response_format: { type: 'json_object' },
    reasoning_effort: 'low',
    temperature: 0.2,
    max_tokens: 16000,
  });
  const raw = out.choices?.[0]?.message?.content ?? '';
  return JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
}

const deva = (s: unknown) => typeof s === 'string' && /[ऀ-ॿ]/.test(s) && s.trim().length > 0;

/** Runs batches with a few in flight, saving after each one. */
async function run<T>(items: T[], size: number, parallel: number, work: (batch: T[]) => Promise<void>, save: () => void) {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size));
  let next = 0, done = 0;
  await Promise.all(
    Array.from({ length: parallel }, async () => {
      while (next < batches.length) {
        const b = batches[next++];
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            await work(b);
            break;
          } catch (err) {
            console.error(`batch failed (attempt ${attempt}):`, err instanceof Error ? err.message.slice(0, 200) : err);
          }
        }
        save();
        console.log(`${++done}/${batches.length}`);
      }
    }),
  );
}

async function meanings() {
  const all = [...read<Meaning[]>('meanings.json'), ...read<Meaning[]>('herb-meanings.json'), ...read<Meaning[]>('ayurveda-meanings.json')];
  const file = 'meanings-hi.json';
  const done: Meaning[] = existsSync(new URL(file, root)) ? read<Meaning[]>(file) : [];
  const have = new Set(done.map((m) => `${m.kind}/${m.key}`));
  const todo = all.filter((m) => !have.has(`${m.kind}/${m.key}`));
  console.log(`meanings: ${done.length} done, ${todo.length} to go`);
  const system = `You translate short library entries from English into Hindi for an Indian astrology, tarot and Ayurveda app.
${STYLE}
Input: {"items": [{"id", "title", "body"}]}. Output JSON: {"items": [{"id", "title", "body"}]} with the same ids, every item translated.`;
  await run(todo, 8, 4, async (batch) => {
    const out = await ask(system, { items: batch.map((m) => ({ id: `${m.kind}/${m.key}`, title: m.title, body: m.body })) });
    for (const it of (out.items as { id: string; title: string; body: string }[]) ?? []) {
      const src = batch.find((m) => `${m.kind}/${m.key}` === it.id);
      if (!src || !deva(it.title) || !deva(it.body) || have.has(it.id)) continue;
      have.add(it.id);
      done.push({ kind: src.kind, key: src.key, lang: 'hi', title: it.title.trim(), body: it.body.trim(), reviewed: false });
    }
  }, () => write(file, done));
  console.log(`meanings: ${done.length}/${all.length} in Hindi`);
}

async function herbs() {
  const all = read<{ key: string; name: string; english: string; botanical: string }[]>('herbs.json');
  const file = 'herb-names-hi.json';
  const done: Record<string, string> = existsSync(new URL(file, root)) ? read(file) : {};
  const todo = all.filter((h) => !done[h.key]);
  const system = `Give the usual Hindi/Sanskrit name in Devanagari for each Ayurvedic herb (e.g. Tulsi → तुलसी, Ashwagandha → अश्वगंधा, Amalaki → आमलकी).
Input: {"items": [{"key", "name", "english", "botanical"}]}. Output JSON: {"names": {"<key>": "<Devanagari name>"}}.`;
  await run(todo, 40, 3, async (batch) => {
    const out = await ask(system, { items: batch.map(({ key, name, english, botanical }) => ({ key, name, english, botanical })) });
    for (const [k, v] of Object.entries((out.names as Record<string, string>) ?? {})) if (batch.some((h) => h.key === k) && deva(v)) done[k] = v.trim();
  }, () => write(file, done));
  console.log(`herb names: ${Object.keys(done).length}/${all.length}`);
}

async function verses() {
  const all = read<{ ref: string; sanskrit: string; translation: string }[]>('verses.json');
  const file = 'verses-hi.json';
  const done: Record<string, string> = existsSync(new URL(file, root)) ? read(file) : {};
  const todo = all.filter((v) => !done[v.ref]);
  const system = `You render verses of the Bhagavad Gita into clear, reverent, modern Hindi prose for everyday readers.
Use the Sanskrit for accuracy and the English translation as a guide to its sense. One faithful rendering per verse: no commentary, no added teaching. Keep the speaker line (e.g. "श्रीभगवान ने कहा:") when the verse has one.
Input: {"items": [{"ref", "sanskrit", "english"}]}. Output JSON: {"verses": {"<ref>": "<Hindi>"}}.`;
  await run(todo, 10, 4, async (batch) => {
    const out = await ask(system, { items: batch.map((v) => ({ ref: v.ref, sanskrit: v.sanskrit, english: v.translation })) });
    for (const [k, v] of Object.entries((out.verses as Record<string, string>) ?? {})) if (batch.some((x) => x.ref === k) && deva(v)) done[k] = v.trim();
  }, () => write(file, done));
  console.log(`verses: ${Object.keys(done).length}/${all.length}`);
}

const which = process.argv[2];
if (!which || which === 'herbs') await herbs();
if (!which || which === 'meanings') await meanings();
if (!which || which === 'verses') await verses();
