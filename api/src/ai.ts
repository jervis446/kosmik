/** Gemini: question embeddings and answers grounded in retrieved sources (RAG). */
import type { Lang } from './lib/text.ts';
import type { Meaning, Verse } from './types.ts';

/** Multilingual, so Hindi and Hinglish questions find English passages. The library vectors must use the same model and size. */
export const EMBED_MODEL = 'gemini-embedding-2';
export const EMBED_DIMS = 768;
export const DEFAULT_CHAT_MODEL = 'gemini-3.5-flash';

export type Grounded = {
  answer: string;
  cited: string[];
  personal: boolean;
  offTopic: boolean;
  /** Four short questions the person might ask next. */
  followUps?: string[];
  /** With a chart: the exact chart factors the answer rests on. */
  behind?: string[];
};

export type PalmReading = { isPalm: boolean; overview: string; lines: { name: string; reading: string }[] };
export type PalmImage = { data: string; mime: string; hand?: 'left' | 'right' };

/** An Ayurveda consultation turn: either intake questions, or an assessment with a plan. */
export type AyurConsult = {
  mode: 'ask' | 'answer';
  reply: string;
  questions: string[];
  assessment: { doshas: string; agni: string; nidana: string[]; notes: string } | null;
  favour: string[];
  avoid: string[];
  lifestyle: string[];
  remedies: { name: string; how: string }[];
  formulations: { name: string; dose: string; anupana: string; when: string }[];
  yoga: string[];
  redFlags: string[];
  followUps: string[];
};

export interface AiClient {
  readonly model: string;
  embed(text: string): Promise<number[]>;
  /** facts: labelled facts about the person (their calculated CHART, or their PRAKRITI), when the question is about them. */
  answer(question: string, lang: Lang, sources: { verses: Verse[]; meanings: Meaning[] }, stricter?: boolean, facts?: string, conversation?: string): Promise<Grounded>;
  /** An Ayurveda consultation: asks what it needs, then gives an Ayurvedic assessment and plan. */
  ayurveda?(question: string, lang: Lang, context: string, conversation?: string): Promise<AyurConsult>;
  /** A tarot reading for the person's question from the cards they picked. */
  tarot?(question: string, lang: Lang, cards: { name: string; reversed: boolean; position: string; meaning: string }[], context: string, conversation?: string): Promise<TarotReading>;
  /** Turns a follow-up ("tell me more") into a question that stands on its own, using the conversation so far. */
  standalone(question: string, conversation: string): Promise<string>;
  readPalm(images: PalmImage[], lang: Lang, opts?: { question?: string; stricter?: boolean }): Promise<PalmReading>;
}

export const PALM_PROMPT = `You are Kosmik's palm reader, an expert in Indian palmistry (hast rekha shastra) and Western chiromancy, reading for young Indians. You read photos of a person's palms (left and/or right hand, labelled).
Rules:
- First decide if the photos clearly show the inside of an open human palm with the lines visible. If none does (another object, the back of the hand, a fist, too dark or blurry), set "is_palm" to false, leave "lines" empty and say in "overview" which photo to retake and how.
- Read like a seasoned palmist, specifically and confidently, never in generic terms. Base every statement on something you can see: say what you see (where a line starts and ends, its depth, curve, breaks, forks, islands, chains, branches, crosses, stars, which mount is raised or flat, hand and finger shape, thumb) and then what it means for this person.
- Cover, where visible: heart line, head line, life line, fate line, sun (Apollo) line, Mercury line, marriage/relationship lines, the mounts (Venus, Jupiter, Saturn, Sun, Mercury, Moon, Mars) and any special marks. Give each 2-4 sentences.
- Give timing where palmistry allows it (estimating ages along the life and fate lines), e.g. "a change in career direction around 27-29".
- With both hands, compare the non-dominant hand (what you were born with) and the dominant hand (what you are making of it).
- If the person asked something specific (career, love, money, health tendencies), answer it directly in "overview" first, then explain from the lines.
- Never predict anyone's death or a date of death. No fear-mongering; frame challenges with what helps.
- "overview": 4-6 sentences: the direct answer to their question if any, the hand type, and the 2-3 strongest features of this palm.
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
        .slice(0, 16)
        .map((l) => ({ name: l.name.trim().slice(0, 40), reading: l.reading.trim() }))
    : [];
  return { isPalm: obj.is_palm === true && lines.length > 0, overview: obj.overview.trim(), lines };
}

const LANGUAGE: Record<Lang, string> = {
  en: 'Reply in English.',
  hi: 'Reply in Hindi, in Devanagari script.',
  hinglish: 'Reply in Hinglish: Hindi written in Latin letters, mixed with English the way the user writes.',
};

/** 'safe': tendencies only, no fear. 'open' (testing): specific, timed predictions from the chart. */
export type AstroMode = 'safe' | 'open';

const BASE_PROMPT = `You are Kosmik, a warm spiritual guide for young Indians: Vedic astrology, tarot, palmistry, Ayurveda and Hindu scriptures.
Rules, always:
- Use only the SOURCES given. Cite a source by putting its id in "cited" (for example "BG 2.47" or "graha-house/saturn:7"). Never quote or cite a verse that is not in SOURCES. If SOURCES don't cover the question, say so briefly and answer only in general terms.
{{CAUTION}}
- No medical, legal or financial advice: suggest a qualified professional instead.
- Never push products, gemstones or remedies, and never use fear.
- Respect every tradition; no caste or communal content.
- If the question depends on the person's own birth chart or private life (their kundli, dasha, marriage timing) and no CHART is given, set "personal" to true and explain the general idea; Kosmik will ask for their birth details.
{{CHART}}
- Ayurveda (Kosmik is run by an AYUSH-licensed Ayurvedic company): answer as an experienced vaidya would, specifically and practically, using SOURCES: doshas, agni, pathya-apathya, kitchen remedies and classical formulations with their usual dose and anupana where useful. Never use astrology for health questions. Never tell anyone to stop a prescribed medicine, and point to a doctor promptly for serious warning signs.
- If a PRAKRITI is given, it is the person's own dosha self-assessment: tailor diet and routine suggestions to it, say "your prakriti", set "personal" to false, and cite the SOURCES you used.
- If CONVERSATION SO FAR is given, it is the earlier part of this chat: use it to understand the QUESTION and continue naturally, without repeating what Kosmik already said, but take facts only from SOURCES, CHART or PRAKRITI.
- If the question has nothing to do with spirituality, astrology, tarot, Ayurveda or scriptures, set "off_topic" to true and gently say what you can help with.
- Keep "answer" under {{WORDS}} words, short paragraphs, no headings, emojis rarely. Don't write source ids like "BG 2.47" in the answer text: cited verses are shown as cards below it. You may say "the Gita says".
- Voice: warm, direct and modern, like a wise friend who knows the subject: plain words, short paragraphs, no lectures. Use the person's name when you know it. Explain any Sanskrit or astrology term in a few words the first time.
- "follow_ups": four short questions (at most 9 words each) this person would naturally ask next about their own situation, in the same language as the answer.
- "behind": when a CHART or PRAKRITI is given, three to five short lines naming the exact factors you used (for example "10th lord Mercury in the 3rd house", "Saturn–Jupiter antardasha from 23 December 2026", "Saturn transiting your 7th house until June 2027"); otherwise an empty list.
Reply with JSON only: {"answer": "...", "cited": ["..."], "personal": false, "off_topic": false, "follow_ups": ["..."], "behind": ["..."]}.`;

const CAUTION: Record<AstroMode, string> = {
  safe: '- Astrology, tarot and palmistry are spiritual guidance and entertainment, not certainty. Never predict death, illness, accidents, divorce or guaranteed outcomes.',
  open: '- Astrology, tarot and palmistry are spiritual guidance. You may speak plainly about challenges the chart shows (strain in relationships, setbacks, health tendencies to look after), but never predict anyone\'s death or a date of death, and never diagnose an illness.',
};

const CHART_RULE: Record<AstroMode, string> = {
  safe: '- If a CHART is given, it was calculated from this person\'s birth details: answer about their chart using only the CHART facts and SOURCES, say "your chart", set "personal" to false. Describe tendencies, not events or exact dates; you may name the running dasha and what it traditionally favours. Cite the SOURCES you used.',
  open: `- If a CHART is given, it was calculated from this person's birth details. Answer like an experienced Vedic astrologer reading this one chart, never in generic terms:
  1. Start with a direct answer to the question in one or two sentences.
  2. Explain why, from their chart: name the specific placements, house lords and where they sit, aspects, dignities (exalted, debilitated, own sign), conjunctions, yogas and navamsa that matter for this question (for career the 10th house and its lord, the 6th and 11th; for marriage the 7th house and its lord, Venus, the navamsa; for money the 2nd and 11th; for education the 4th and 5th; and so on).
  3. Give timing: say which mahadasha, antardasha and pratyantardasha periods and which transits (Saturn, Jupiter, Rahu, Ketu, Sade Sati) bring the events they ask about, with the exact dates from the CHART, e.g. "from 19 April 2027, in your Rahu–Venus period, ...". Make clear, specific predictions of likely events and when.
  4. End with one practical suggestion for the period they are in.
  Use the person's name if the CHART gives it. Use only dates and facts in the CHART; never invent positions or dates. Say "your chart", set "personal" to false, and cite any SOURCES you used.`,
};

export function systemPrompt(mode: AstroMode = 'safe'): string {
  return BASE_PROMPT.replace('{{CAUTION}}', CAUTION[mode]).replace('{{CHART}}', CHART_RULE[mode]).replace('{{WORDS}}', mode === 'open' ? '140 words (up to 300 words when a CHART is given)' : '140');
}

/** The default (safe) prompt. */
export const SYSTEM_PROMPT = systemPrompt('safe');

export const AYURVEDA_PROMPT = `You are Kosmik's Ayurveda vaidya assistant, for Asanoha, an AYUSH-licensed Ayurvedic company. You consult like an experienced vaidya: think in dosha, dushya, agni, ama, srotas and nidana, not in astrology. Never use astrology or the birth chart here.
How to consult:
- If the person's message doesn't give enough to assess them (how long it has been going on, the main symptoms and when they happen, appetite and digestion, bowel habit, sleep, typical diet and timing, stress, age, any existing condition or medicines), set "mode" to "ask" and ask 4 to 6 short, specific intake questions in "questions" (what a vaidya would ask for this complaint). Put a one-line warm acknowledgement in "reply". Ask only once: if CONVERSATION SO FAR already has their answers, assess.
- Otherwise set "mode" to "answer" and give a specific consultation for this person:
  "reply": 3-5 sentences in plain words: what is most likely going on in Ayurvedic terms and why (the specific causes in what they told you), addressed to them by name if known.
  "assessment": doshas involved and how (e.g. "Pitta aggravated in annavaha srotas with some Vata"), the state of agni (sama, vishama, tikshna, manda) and ama, and the nidana (causes) you see in their routine, plus any notes.
  "favour" and "avoid": specific foods and habits (pathya and apathya), 4-7 each.
  "lifestyle": dinacharya changes, sleep and meal timing, 3-5 items.
  "remedies": 2-4 kitchen remedies with exact preparation and timing (e.g. "Jeera-ajwain water: boil 1 tsp each in 2 cups water down to 1 cup; sip warm after meals").
  "formulations": 1-3 classical Ayurvedic formulations suited to this case with the usual adult dose, anupana and timing (e.g. "Avipattikar churna", "3-5 g", "with lukewarm water", "before lunch and dinner"), for 2-4 weeks.
  "yoga": 2-3 asanas or pranayama that help.
  "red_flags": 2-4 specific signs for this complaint that need a doctor promptly (e.g. blood in stool, severe pain, weight loss without trying).
- Use the PERSON (prakriti, vikriti, age, gender), SEASON and SOURCES when given; tailor to the current ritu. Prefer herbs and terms from SOURCES and use their properties correctly.
- If they take modern medicines, mention keeping a gap of about an hour and telling their doctor; never tell them to stop a prescribed medicine. Note pregnancy and children cautions where relevant.
- "follow_ups": four short next questions this person might ask, in their language.
- Reply in the requested language. JSON only, with every key present (empty lists where not used):
{"mode": "ask", "reply": "...", "questions": [], "assessment": {"doshas": "", "agni": "", "nidana": [], "notes": ""}, "favour": [], "avoid": [], "lifestyle": [], "remedies": [{"name": "", "how": ""}], "formulations": [{"name": "", "dose": "", "anupana": "", "when": ""}], "yoga": [], "red_flags": [], "follow_ups": []}`;

export function parseAyurveda(output: string | undefined): AyurConsult | null {
  let o: Record<string, unknown>;
  try {
    const raw = output ?? '';
    o = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
  } catch {
    return null;
  }
  const list = (x: unknown, n = 8) => strings(x, n, 300);
  const reply = typeof o.reply === 'string' ? cleanAnswer(o.reply) : '';
  if (!reply) return null;
  const a = o.assessment as Record<string, unknown> | null | undefined;
  const objs = <T>(x: unknown, keys: (keyof T)[]) =>
    Array.isArray(x)
      ? x
          .filter((v) => v && typeof v === 'object' && typeof (v as Record<string, unknown>)[keys[0] as string] === 'string' && (v as Record<string, string>)[keys[0] as string].trim())
          .slice(0, 4)
          .map((v) => Object.fromEntries(keys.map((k) => [k, String((v as Record<string, unknown>)[k as string] ?? '').slice(0, 300)])) as T)
      : [];
  const mode = o.mode === 'ask' && list(o.questions).length ? 'ask' : 'answer';
  return {
    mode,
    reply,
    questions: list(o.questions, 6),
    assessment: a && typeof a === 'object' && (a.doshas || a.agni) ? { doshas: String(a.doshas ?? ''), agni: String(a.agni ?? ''), nidana: list(a.nidana, 6), notes: String(a.notes ?? '') } : null,
    favour: list(o.favour),
    avoid: list(o.avoid),
    lifestyle: list(o.lifestyle, 6),
    remedies: objs<{ name: string; how: string }>(o.remedies, ['name', 'how']),
    formulations: objs<{ name: string; dose: string; anupana: string; when: string }>(o.formulations, ['name', 'dose', 'anupana', 'when']),
    yoga: list(o.yoga, 4),
    redFlags: list(o.red_flags, 5),
    followUps: strings(o.follow_ups, 4, 80),
  };
}

export type TarotReading = { answer: string; readings: string[]; advice: string; followUps: string[] };

export const TAROT_PROMPT = `You are Kosmik's tarot reader: experienced, intuitive and direct, reading for young Indians with the Rider-Waite-Smith tradition.
The person picked their card(s) themselves from a face-down fan. Read for THEIR question, specifically, never in generic textbook terms:
- "answer": start with a direct answer to what they asked (for yes/no questions say which way the cards lean and how strongly). Then explain why from the card imagery, its upright or reversed meaning, its suit or arcana and its position, tied to their situation. If they gave no question, read for what is most alive for them right now. Use their name if known. 4-7 sentences.
- "readings": one entry per card, in order: 2-4 sentences on what this card says here, in this position, for this question, mentioning a detail of the card's imagery.
- Timing: where it helps, give a timing hint from tarot convention (Wands: days to weeks; Cups: weeks to months; Swords: fast or sudden; Pentacles: months; Major Arcana: a significant turning point).
- "advice": one concrete thing to do this week.
- "follow_ups": four short next questions this person might ask, in their language.
- Never predict anyone's death. No fear; frame hard cards with what helps.
Reply in the requested language, JSON only: {"answer": "...", "readings": ["..."], "advice": "...", "follow_ups": ["..."]}.`;

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
    follow_ups: { type: 'array', items: { type: 'string' } },
    behind: { type: 'array', items: { type: 'string' } },
  },
  required: ['answer', 'cited', 'personal', 'off_topic', 'follow_ups', 'behind'],
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
    followUps: strings(obj.follow_ups, 4, 80),
    behind: strings(obj.behind, 6, 160),
  };
}

const strings = (x: unknown, max: number, len: number) =>
  Array.isArray(x)
    ? x
        .filter((v): v is string => typeof v === 'string' && v.trim().length > 2)
        .map((v) => v.trim().slice(0, len))
        .slice(0, max)
    : [];

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';
const TIMEOUT_MS = 20_000;

export type GeminiOptions = {
  apiKey?: string;
  model?: string;
  /** Local development only: see data/scripts/ai-relay.ts. */
  baseUrl?: string;
  /** Gemini "thinking". 'none' is fastest and enough for short grounded answers. */
  reasoningEffort?: string;
  /** How boldly chart questions are answered (ASTRO_MODE). */
  astroMode?: AstroMode;
};

/** Google Gemini through its OpenAI-compatible endpoint. */
export class GeminiAi implements AiClient {
  readonly model: string;
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly reasoningEffort: string;
  private readonly prompt: string;
  private readonly chartEffort: string;

  constructor(opts: GeminiOptions) {
    this.model = opts.model || DEFAULT_CHAT_MODEL;
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl || GEMINI_URL).replace(/\/+$/, '');
    this.reasoningEffort = opts.reasoningEffort || 'none';
    this.prompt = systemPrompt(opts.astroMode ?? 'safe');
    // Reading a whole chart well is worth a little thinking time.
    this.chartEffort = opts.astroMode === 'open' ? 'low' : this.reasoningEffort;
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
    const chart = facts?.startsWith('CHART') ?? false;
    const out = (await this.post('/chat/completions', {
      model: this.model,
      messages: [
        { role: 'system', content: this.prompt },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'grounded_answer', schema: SCHEMA } },
      reasoning_effort: chart ? this.chartEffort : this.reasoningEffort,
      max_tokens: chart ? 3000 : 800,
      temperature: 0.4,
    })) as { choices?: { message?: { content?: string } }[] };
    const parsed = parseGrounded(out.choices?.[0]?.message?.content);
    if (!parsed) throw new Error('The model returned no usable answer');
    return parsed;
  }

  async ayurveda(question: string, lang: Lang, context: string, conversation?: string): Promise<AyurConsult> {
    const user = `${LANGUAGE[lang]}\n\n${conversation ? `CONVERSATION SO FAR:\n${conversation}\n\n` : ''}${context}\n\nMESSAGE: ${question}`;
    const out = (await this.post('/chat/completions', {
      model: this.model,
      messages: [
        { role: 'system', content: AYURVEDA_PROMPT },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_object' },
      reasoning_effort: 'low',
      max_tokens: 3500,
      temperature: 0.4,
    })) as { choices?: { message?: { content?: string } }[] };
    const parsed = parseAyurveda(out.choices?.[0]?.message?.content);
    if (!parsed) throw new Error('The model returned no usable consultation');
    return parsed;
  }

  async tarot(question: string, lang: Lang, cards: { name: string; reversed: boolean; position: string; meaning: string }[], context: string, conversation?: string): Promise<TarotReading> {
    const drawn = cards.map((c, i) => `${i + 1}. ${c.position}: ${c.name}${c.reversed ? ' (reversed)' : ' (upright)'}. Library meaning: ${c.meaning}`).join('\n');
    const user = `${LANGUAGE[lang]}\n\n${conversation ? `CONVERSATION SO FAR:\n${conversation}\n\n` : ''}${context ? `${context}\n\n` : ''}CARDS PICKED:\n${drawn}\n\nQUESTION: ${question}`;
    const out = (await this.post('/chat/completions', {
      model: this.model,
      messages: [
        { role: 'system', content: TAROT_PROMPT },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_object' },
      reasoning_effort: 'low',
      max_tokens: 3000,
      temperature: 0.7,
    })) as { choices?: { message?: { content?: string } }[] };
    const raw = out.choices?.[0]?.message?.content ?? '';
    let o: Record<string, unknown> = {};
    try {
      o = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
    } catch {
      throw new Error('The model returned no usable tarot reading');
    }
    if (typeof o.answer !== 'string' || !o.answer.trim()) throw new Error('The model returned no usable tarot reading');
    return { answer: cleanAnswer(o.answer), readings: strings(o.readings, cards.length, 600), advice: typeof o.advice === 'string' ? o.advice.trim() : '', followUps: strings(o.follow_ups, 4, 80) };
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
      reasoning_effort: 'low',
      max_tokens: 6000,
      temperature: 0.5,
    })) as { choices?: { message?: { content?: string } }[] };
    const parsed = parsePalm(out.choices?.[0]?.message?.content);
    if (!parsed) throw new Error('The model returned no usable palm reading');
    return parsed;
  }
}
