/** Gemini: question embeddings and answers grounded in retrieved sources (RAG). */
import type { Lang } from './lib/text.ts';
import type { Meaning, Verse } from './types.ts';

/** Multilingual, so Hindi and Hinglish questions find English passages. The library vectors must use the same model and size. */
export const EMBED_MODEL = 'gemini-embedding-2';
export const EMBED_DIMS = 768;
export const DEFAULT_CHAT_MODEL = 'gemini-3.5-flash';

export type Grounded = { answer: string; cited: string[]; personal: boolean; offTopic: boolean };

export type PalmReading = { isPalm: boolean; overview: string; lines: { name: string; reading: string }[] };
export type PalmImage = { data: string; mime: string; hand?: 'left' | 'right' };

export interface AiClient {
  readonly model: string;
  embed(text: string): Promise<number[]>;
  /** facts: labelled facts about the person (their calculated CHART, or their PRAKRITI), when the question is about them. */
  answer(question: string, lang: Lang, sources: { verses: Verse[]; meanings: Meaning[] }, stricter?: boolean, facts?: string, conversation?: string): Promise<Grounded>;
  /** Turns a follow-up ("tell me more") into a question that stands on its own, using the conversation so far. */
  standalone(question: string, conversation: string): Promise<string>;
  readPalm(images: PalmImage[], lang: Lang, opts?: { question?: string; stricter?: boolean }): Promise<PalmReading>;
}

export const PALM_PROMPT = `You are Kosmik's palm reader, for young Indians. You read photos of a person's palms (left and/or right hand, labelled) in the tradition of Indian palmistry (hast rekha shastra).
Rules, always:
- First decide if the photos clearly show the inside of an open human palm with the lines visible. If none does (another object, the back of the hand, a fist, too dark or blurry), set "is_palm" to false, leave "lines" empty and say in "overview" which photo to retake and how.
- With both hands, palmistry traditionally reads the non-dominant hand as natural tendencies and the dominant hand as how they have developed; compare them where it helps.
- If the person asked something specific, answer it in "overview" from what the lines show, within these rules.
- Describe only what you can actually see in this photo: the heart line, head line, life line, and the fate line if visible. For each, say how it looks (long, curved, deep, faint, forked, broken) and what palmistry traditionally links that with, in one or two warm sentences in the second person.
- Palmistry is reflection and entertainment, not certainty. Never mention lifespan, death, illness, accidents, the number or timing of marriages, divorce, children, or money predictions. A short life line says nothing about how long someone lives.
- No remedies, gemstones, rituals or products, and no fear.
- "overview" is 2-3 sentences on the hand's overall character (shape, mounts, how the lines work together).
Reply with JSON only: {"is_palm": true, "overview": "...", "lines": [{"name": "Heart line", "reading": "..."}]}.`;

const PALM_SCHEMA = {
  type: 'object',
  properties: {
    is_palm: { type: 'boolean' },
    overview: { type: 'string' },
    lines: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, reading: { type: 'string' } }, required: ['name', 'reading'] } },
  },
  required: ['is_palm', 'overview', 'lines'],
};

export function parsePalm(output: unknown): PalmReading | null {
  let obj: Record<string, unknown> | undefined;
  if (typeof output === 'string') {
    try {
      obj = JSON.parse(output.slice(output.indexOf('{'), output.lastIndexOf('}') + 1));
    } catch {
      obj = undefined;
    }
  }
  if (!obj || typeof obj.overview !== 'string' || !obj.overview.trim()) return null;
  const lines = Array.isArray(obj.lines)
    ? obj.lines
        .filter((l): l is { name: string; reading: string } => !!l && typeof l.name === 'string' && typeof l.reading === 'string' && !!l.reading.trim())
        .slice(0, 5)
        .map((l) => ({ name: l.name.trim().slice(0, 40), reading: l.reading.trim() }))
    : [];
  return { isPalm: obj.is_palm === true && lines.length > 0, overview: obj.overview.trim(), lines };
}

const LANGUAGE: Record<Lang, string> = {
  en: 'Reply in English.',
  hi: 'Reply in Hindi, in Devanagari script.',
  hinglish: 'Reply in Hinglish: Hindi written in Latin letters, mixed with English the way the user writes.',
};

export const SYSTEM_PROMPT = `You are Kosmik, a warm spiritual guide for young Indians: Vedic astrology, tarot, palmistry, Ayurveda and Hindu scriptures.
Rules, always:
- Use only the SOURCES given. Cite a source by putting its id in "cited" (for example "BG 2.47" or "graha-house/saturn:7"). Never quote or cite a verse that is not in SOURCES. If SOURCES don't cover the question, say so briefly and answer only in general terms.
- Astrology, tarot and palmistry are spiritual guidance and entertainment, not certainty. Never predict death, illness, accidents, divorce or guaranteed outcomes.
- No medical, legal or financial advice: suggest a qualified professional instead.
- Never push products, gemstones or remedies, and never use fear.
- Respect every tradition; no caste or communal content.
- If the question depends on the person's own birth chart or private life (their kundli, dasha, marriage timing) and no CHART is given, set "personal" to true and explain the general idea; Kosmik will ask for their birth details.
- If a CHART is given, it was calculated from this person's birth details: answer about their chart using only the CHART facts and SOURCES, say "your chart", set "personal" to false. Describe tendencies, never events, dates or timing (dashas are not calculated). Cite the SOURCES you used.
- Ayurveda: describe herbs, doshas and daily routine as traditional knowledge, from SOURCES only. Never say a herb cures, treats or prevents anything, never give doses or home preparations, and never suggest changing or stopping medicine. For any health problem, suggest seeing a doctor or a qualified Ayurvedic practitioner (vaidya).
- If a PRAKRITI is given, it is the person's own dosha self-assessment: tailor diet and routine suggestions to it, say "your prakriti", set "personal" to false, and cite the SOURCES you used.
- If CONVERSATION SO FAR is given, it is the earlier part of this chat: use it to understand the QUESTION and continue naturally, without repeating what Kosmik already said, but take facts only from SOURCES, CHART or PRAKRITI.
- If the question has nothing to do with spirituality, astrology, tarot, Ayurveda or scriptures, set "off_topic" to true and gently say what you can help with.
- Keep "answer" under 140 words, short paragraphs, no headings, emojis rarely. Don't write source ids like "BG 2.47" in the answer text: cited verses are shown as cards below it. You may say "the Gita says".
Reply with JSON only: {"answer": "...", "cited": ["..."], "personal": false, "off_topic": false}.`;

export const STANDALONE_PROMPT = `You help Kosmik, a spiritual guide app, understand follow-up messages in a chat.
Rewrite the LATEST MESSAGE as one question that makes sense on its own, using the conversation only to fill in what "it", "that", "more", "aur batao" and similar words refer to.
- Keep the person's language and wording (English, Hindi or Hinglish) and their point of view ("my", "mera").
- Do not answer it, and do not add facts, names or details that are not in the conversation.
- If the message already stands on its own, return it unchanged.
Reply with JSON only: {"question": "..."}.`;

/** The rewritten question, or the original when the model's reply is unusable. */
export function parseStandalone(output: string | undefined, original: string): string {
  try {
    const raw = output ?? '';
    const q = (JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)) as { question?: unknown }).question;
    if (typeof q === 'string' && q.trim().length >= 2 && q.trim().length <= 500) return q.trim();
  } catch {
    // fall through
  }
  return original;
}

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

/** Removes stray number runs the model sometimes leaves at the end of a line ("… zaroori hai. 1 2 3"). */
export const cleanAnswer = (text: string) =>
  text
    .replace(/[ \t]+\d{1,4}(?:[ .\-/]\d{1,4}){2,}[ \t]*(?=\n|$)/g, '')
    .trim();

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
    answer: cleanAnswer(obj.answer),
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

  async answer(question: string, lang: Lang, sources: { verses: Verse[]; meanings: Meaning[] }, stricter = false, facts?: string, conversation?: string): Promise<Grounded> {
    const user = `${LANGUAGE[lang]}\n\n${conversation ? `CONVERSATION SO FAR:\n${conversation}\n\n` : ''}${facts ? `${facts}\n\n` : ''}SOURCES:\n${buildSources(sources.verses, sources.meanings)}\n\nQUESTION: ${question}${
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

  async standalone(question: string, conversation: string): Promise<string> {
    const out = (await this.post('/chat/completions', {
      model: this.model,
      messages: [
        { role: 'system', content: STANDALONE_PROMPT },
        { role: 'user', content: `CONVERSATION SO FAR:\n${conversation}\n\nLATEST MESSAGE: ${question}` },
      ],
      response_format: { type: 'json_object' },
      reasoning_effort: this.reasoningEffort,
      max_tokens: 200,
      temperature: 0,
    })) as { choices?: { message?: { content?: string } }[] };
    return parseStandalone(out.choices?.[0]?.message?.content, question);
  }

  async readPalm(images: PalmImage[], lang: Lang, opts: { question?: string; stricter?: boolean } = {}): Promise<PalmReading> {
    const intro = `${LANGUAGE[lang]}${opts.question ? `\nThe person asks: ${opts.question}` : ''}${opts.stricter ? '\nYour previous reply broke the rules. Follow every rule strictly this time.' : ''}`;
    const out = (await this.post('/chat/completions', {
      model: this.model,
      messages: [
        { role: 'system', content: PALM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: intro },
            ...images.flatMap((img) => [
              { type: 'text', text: img.hand ? `${img.hand === 'left' ? 'Left' : 'Right'} hand:` : 'Palm:' },
              { type: 'image_url', image_url: { url: `data:${img.mime};base64,${img.data}` } },
            ]),
          ],
        },
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'palm_reading', schema: PALM_SCHEMA } },
      reasoning_effort: this.reasoningEffort,
      max_tokens: 1400,
      temperature: 0.5,
    })) as { choices?: { message?: { content?: string } }[] };
    const parsed = parsePalm(out.choices?.[0]?.message?.content);
    if (!parsed) throw new Error('The model returned no usable palm reading');
    return parsed;
  }
}
