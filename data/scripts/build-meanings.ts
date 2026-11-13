/**
 * Drafts the meaning library (grahas, rashis, nakshatras, houses, placements, tarot) with
 * Gemini (the first 426 entries were written with Llama 3.3 70B on Workers AI). Every entry
 * is saved with reviewed: false: an astrologer must check the text before launch. Resumable: entries already in data/meanings.json are kept.
 *
 * Needs GEMINI_API_KEY. Run with NODE_USE_ENV_PROXY=1 behind a proxy.
 * Usage: node data/scripts/build-meanings.ts
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { DEFAULT_CHAT_MODEL } from '../../api/src/ai.ts';
import { libraryEntries } from '../../api/src/lib/catalog.ts';
import { meaningProblems } from '../../api/src/lib/safety.ts';
import { gemini } from './gemini.ts';

export type Meaning = { kind: string; key: string; lang: 'en'; title: string; body: string; reviewed: boolean; flagged?: string[] };

const MODEL = DEFAULT_CHAT_MODEL;
const OUT = new URL('../meanings.json', import.meta.url);
const BATCH = 3;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const STYLE = `You write short reference entries for Kosmik, a Vedic astrology and tarot app for young Indians.
Rules for every entry:
- Each entry is 3 or 4 full sentences, about 60 words. Plain warm English, second person where natural ("you"), no headings or lists.
- Be specific to the item: what it governs or signals, how it tends to show up in everyday life, and one thing to be mindful of.
- Describe the traditional reading ("In Vedic astrology, ... is traditionally linked with ..."). Present it as tradition and interpretation, never as certain fact.
- Balanced: mention both strengths and things to be mindful of, without fear.
- Never predict or mention death, illness, disease, accidents, divorce, poverty or any guaranteed outcome.
- No remedies, gemstones, products, mantras or rituals. No health, legal or money advice.
- Tarot: the Death card means change and endings of a chapter, never physical death. Do not name other cards.
Reply with JSON only.`;

const SCHEMA = {
  type: 'object',
  properties: { items: { type: 'array', items: { type: 'object', properties: { key: { type: 'string' }, body: { type: 'string' } }, required: ['key', 'body'] } } },
  required: ['items'],
};

async function generate(batch: { kind: string; key: string; title: string }[]): Promise<Record<string, string>> {
  const list = batch.map((b) => `- key "${b.kind}/${b.key}": ${b.title}`).join('\n');
  for (let attempt = 1; ; attempt++) {
    const out = await gemini<{ choices?: { message?: { content?: string } }[] }>('/chat/completions', {
      model: MODEL,
      messages: [
        { role: 'system', content: STYLE },
        { role: 'user', content: `Write one entry for each of these, using the key exactly as given:\n${list}\n\nReturn {"items":[{"key":"...","body":"..."}]}.` },
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'entries', schema: SCHEMA } },
      reasoning_effort: 'none',
      max_tokens: 2200,
      temperature: 0.4,
    });
    const parsed = safeJson(out.choices?.[0]?.message?.content ?? '');
    if (parsed?.items?.length) return Object.fromEntries(parsed.items.map((i) => [i.key, i.body.trim()]));
    if (attempt >= 3) throw new Error('Generation returned no entries');
    await sleep(2000 * attempt);
  }
}

function safeJson(s: string): { items?: { key: string; body: string }[] } | undefined {
  try {
    return JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1));
  } catch {
    return undefined;
  }
}

async function main() {
  const done: Meaning[] = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : [];
  const have = new Set(done.map((m) => `${m.kind}/${m.key}`));
  const todo = libraryEntries().filter((e) => !have.has(`${e.kind}/${e.key}`));
  console.log(`${done.length} done, ${todo.length} to write`);

  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    let texts = await generate(batch);
    // One retry for entries that are missing or break the rules.
    const bad = batch.filter((b) => !texts[`${b.kind}/${b.key}`] || meaningProblems(texts[`${b.kind}/${b.key}`], b).length);
    if (bad.length) texts = { ...texts, ...(await generate(bad)) };
    for (const b of batch) {
      const body = texts[`${b.kind}/${b.key}`];
      if (!body) continue;
      const problems = meaningProblems(body, b);
      done.push({ kind: b.kind, key: b.key, lang: 'en', title: b.title, body, reviewed: false, ...(problems.length ? { flagged: problems } : {}) });
    }
    writeFileSync(OUT, JSON.stringify(done, null, 1) + '\n');
    process.stdout.write(`\r${done.length}/${libraryEntries().length}`);
    await sleep(500);
  }
  const flagged = done.filter((m) => m.flagged?.length).length;
  console.log(`\nDone: ${done.length} entries, ${flagged} flagged for a closer look`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
