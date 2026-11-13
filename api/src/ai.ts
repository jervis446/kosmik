/** Gemini: question embeddings and answers grounded in retrieved sources (RAG). */
import type { Lang } from './lib/text.ts';
import type { Meaning, Verse } from './types.ts';

/** Multilingual, so Hindi and Hinglish questions find English passages. The library vectors must use the same model and size. */
export const EMBED_MODEL = 'gemini-embedding-2';
export const EMBED_DIMS = 768;
export const DEFAULT_CHAT_MODEL = 'gemini-3.5-flash';

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

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';
const TIMEOUT_MS = 20_000;

export type GeminiOptions = {
  apiKey?: string;
  model?: string;
  /** Local development only: see data/scripts/ai-relay.ts. */
  baseUrl?: string;
  /** Gemini "thinking". 'none' is fastest and enough for short grounded answers. */
  reasoningEffort?: string;
};

/** Google Gemini through its OpenAI-compatible endpoint. */
export class GeminiAi implements AiClient {
  readonly model: string;
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly reasoningEffort: string;

  constructor(opts: GeminiOptions) {
    this.model = opts.model || DEFAULT_CHAT_MODEL;
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl || GEMINI_URL).replace(/\/+$/, '');
    this.reasoningEffort = opts.reasoningEffort || 'none';
  }

  private async post(path: string, body: unknown): Promise<unknown> {
    if (!this.apiKey) throw new Error('GEMINI_API_KEY is not set');
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      // Gemini error bodies never echo the key, but keep the log short anyway.
      const detail = (await res.text().catch(() => '')).slice(0, 200);
      throw new Error(`Gemini ${path} failed (${res.status}): ${detail}`);
    }
    return res.json();
  }

  async embed(text: string): Promise<number[]> {
    const out = (await this.post('/embeddings', { model: EMBED_MODEL, input: [text], dimensions: EMBED_DIMS })) as {
      data?: { embedding?: number[] }[];
    };
    const v = out.data?.[0]?.embedding;
    if (v?.length !== EMBED_DIMS) throw new Error('Embedding failed');
    return v;
  }

  async answer(question: string, lang: Lang, sources: { verses: Verse[]; meanings: Meaning[] }, stricter = false): Promise<Grounded> {
    const user = `${LANGUAGE[lang]}\n\nSOURCES:\n${buildSources(sources.verses, sources.meanings)}\n\nQUESTION: ${question}${
      stricter ? '\n\nYour previous reply broke the rules. Follow every rule strictly this time.' : ''
    }`;
    const out = (await this.post('/chat/completions', {
      model: this.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'grounded_answer', schema: SCHEMA } },
      reasoning_effort: this.reasoningEffort,
      max_tokens: 800,
      temperature: 0.4,
    })) as { choices?: { message?: { content?: string } }[] };
    const parsed = parseGrounded(out.choices?.[0]?.message?.content);
    if (!parsed) throw new Error('The model returned no usable answer');
    return parsed;
  }
}
