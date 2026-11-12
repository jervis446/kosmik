/** Workers AI: question embeddings and answers grounded in retrieved sources (RAG). */
import type { Lang } from './lib/text.ts';
import type { Meaning, Verse } from './types.ts';

export const EMBED_MODEL = '@cf/baai/bge-m3';
export const DEFAULT_CHAT_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

export type Grounded = { answer: string; cited: string[]; personal: boolean; offTopic: boolean };

export interface AiClient {
  readonly model: string;
  embed(text: string): Promise<number[]>;
  answer(question: string, lang: Lang, sources: { verses: Verse[]; meanings: Meaning[] }, stricter?: boolean): Promise<Grounded>;
}

const LANGUAGE: Record<Lang, string> = {
  en: 'Reply in English.',
  hi: 'Reply in Hindi, in Devanagari script.',
  hinglish: 'Reply in Hinglish: Hindi written in Latin letters, mixed with English the way the user writes.',
};

export const SYSTEM_PROMPT = `You are Kosmik, a warm spiritual guide for young Indians: Vedic astrology, tarot, palmistry and Hindu scriptures.
Rules, always:
- Use only the SOURCES given. Cite a source by putting its id in "cited" (for example "BG 2.47" or "graha-house/saturn:7"). Never quote or cite a verse that is not in SOURCES. If SOURCES don't cover the question, say so briefly and answer only in general terms.
- Astrology, tarot and palmistry are spiritual guidance and entertainment, not certainty. Never predict death, illness, accidents, divorce or guaranteed outcomes.
- No medical, legal or financial advice: suggest a qualified professional instead.
- Never push products, gemstones or remedies, and never use fear.
- Respect every tradition; no caste or communal content.
- If the question depends on the person's own birth chart or private life (their kundli, dasha, marriage timing), set "personal" to true and explain the general idea; Kosmik will ask for their birth details.
- If the question has nothing to do with spirituality, astrology, tarot or scriptures, set "off_topic" to true and gently say what you can help with.
- Keep "answer" under 140 words, short paragraphs, no headings, emojis rarely. Don't write source ids like "BG 2.47" in the answer text: cited verses are shown as cards below it. You may say "the Gita says".
Reply with JSON only: {"answer": "...", "cited": ["..."], "personal": false, "off_topic": false}.`;

const SCHEMA = {
  type: 'object',
  properties: {
    answer: { type: 'string' },
    cited: { type: 'array', items: { type: 'string' } },
    personal: { type: 'boolean' },
    off_topic: { type: 'boolean' },
  },
  required: ['answer', 'cited', 'personal', 'off_topic'],
};

export function buildSources(verses: Verse[], meanings: Meaning[]): string {
  const v = verses.map((x) => `[${x.ref}] Bhagavad Gita ${x.chapter}.${x.verse} (${x.translator}): ${x.translation}`);
  const m = meanings.map((x) => `[${x.kind}/${x.key}] ${x.title}: ${x.body}`);
  return [...v, ...m].join('\n') || '(none)';
}

/** Model output can be an object, a JSON string, or JSON wrapped in prose. */
export function parseGrounded(output: unknown): Grounded | null {
  const raw = (output as { response?: unknown })?.response ?? output;
  let obj: Record<string, unknown> | undefined;
  if (raw && typeof raw === 'object') obj = raw as Record<string, unknown>;
  else if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
    } catch {
      obj = undefined;
    }
  }
  if (!obj || typeof obj.answer !== 'string' || !obj.answer.trim()) return null;
  return {
    answer: obj.answer.trim(),
    cited: Array.isArray(obj.cited) ? obj.cited.filter((c): c is string => typeof c === 'string') : [],
    personal: obj.personal === true,
    offTopic: obj.off_topic === true,
  };
}

type Run = (model: string, input: unknown) => Promise<unknown>;

/**
 * Runs models through the Workers AI binding. For local development behind a network proxy
 * (where the local runtime can't reach Cloudflare), AI_RELAY_URL points at
 * data/scripts/ai-relay.ts, which forwards the same calls to the Workers AI REST API.
 */
export function workersAiRun(ai: Ai, relayUrl?: string): Run {
  if (!relayUrl) return (model, input) => ai.run(model as Parameters<Ai['run']>[0], input as never);
  return async (model, input) => {
    const res = await fetch(`${relayUrl.replace(/\/+$/, '')}/run/${model}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) });
    if (!res.ok) throw new Error(`AI relay failed (${res.status})`);
    return res.json();
  };
}

export class WorkersAi implements AiClient {
  readonly model: string;
  constructor(private run: Run, model?: string) {
    this.model = model || DEFAULT_CHAT_MODEL;
  }
  async embed(text: string): Promise<number[]> {
    const out = (await this.run(EMBED_MODEL, { text: [text] })) as { data?: number[][] };
    const v = out.data?.[0];
    if (!v?.length) throw new Error('Embedding failed');
    return v;
  }
  async answer(question: string, lang: Lang, sources: { verses: Verse[]; meanings: Meaning[] }, stricter = false): Promise<Grounded> {
    const user = `${LANGUAGE[lang]}\n\nSOURCES:\n${buildSources(sources.verses, sources.meanings)}\n\nQUESTION: ${question}${
      stricter ? '\n\nYour previous reply broke the rules. Follow every rule strictly this time.' : ''
    }`;
    const out = await this.run(this.model, {
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_schema', json_schema: SCHEMA },
      max_tokens: 600,
      temperature: 0.4,
    });
    const parsed = parseGrounded(out);
    if (!parsed) throw new Error('The model returned no usable answer');
    return parsed;
  }
}
