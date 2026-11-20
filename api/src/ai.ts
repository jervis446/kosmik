/** Gemini: question embeddings and answers grounded in retrieved sources (RAG). */
import { inLang, type Lang } from './lib/text.ts';
import type { Meaning, Passage, Verse } from './types.ts';

/** Multilingual, so Hindi and Hinglish questions find English passages. The library vectors must use the same model and size. */
export const EMBED_MODEL = 'gemini-embedding-2';
export const EMBED_DIMS = 768;
/** Everyday answers: Flash-Lite keeps each question cheap (about a fifth of Flash's price). */
export const DEFAULT_CHAT_MODEL = 'gemini-3.5-flash-lite';
/** Paid reports are long and kept, so they use the fuller model. */
export const DEFAULT_REPORT_MODEL = 'gemini-3.5-flash';

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
  /** A classical Ayurveda verse that fits, when the model is sure of it. */
  shloka: { sanskrit: string; source: string; meaning: string } | null;
  followUps: string[];
};

/** How worrying a Shanti message is: 'high' adds the helpline, 'low' a gentle nudge to talk to someone. */
export type Concern = 'none' | 'low' | 'high';
export type ShantiReply = { answer: string; cited: string[]; concern: Concern; followUps: string[] };

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
  /** Shanti: comfort for someone in pain, from scripture SOURCES only, with how worried to be. */
  shanti?(question: string, lang: Lang, sources: { verses: Verse[]; passages: Passage[] }, stricter?: boolean, conversation?: string): Promise<ShantiReply>;
  /** A full report on one topic, from the chart (or the prakriti) in `facts`. */
  report?(topic: { title: string; focus: string; ayurveda?: boolean }, lang: Lang, facts: string): Promise<Report>;
}

/** How every chat answer should read: like a person who knows the subject wrote it, not a generic AI. */
export const STYLE = `Writing style, for every word the person reads (answer, readings, advice, follow-ups):
- Sound like a person who knows this subject, not like an AI. Write with mild uncertainty when you read, interpret or predict ("looks like", "I'd say", "likely"), and state facts, dates and cited verses plainly.
- Take a view. No generic, neutral or on-the-one-hand, on-the-other-hand answers.
- Vary sentence length and pacing, mixing short and longer sentences, but never a run of short, choppy sentences.
- Don't repeat the same words or sentence shapes.
- Spartan and clear: no fluff, filler or padding, and no adjectives or adverbs that add nothing.
- Practical and actionable, with concrete examples, numbers, dates or amounts where you have them.
- No metaphors, cliches, sweeping generalisations or rhetorical questions. A real question to the person, where these instructions ask for one, is fine.
- No opening set-up ("Great question", "Let's explore") and no closing summary or conclusion.
- Never use em dashes, en dashes between words, semicolons, markdown, asterisks or hashtags. Add no disclaimers, warnings or notes beyond what the rules above require (a doctor, a counsellor, a helpline).`;

/** Puts the writing style into a prompt, just before its JSON instruction. */
const styled = (prompt: string) => {
  const at = prompt.lastIndexOf('\nReply with JSON only');
  return at < 0 ? `${prompt}\n${STYLE}` : `${prompt.slice(0, at)}\n${STYLE}${prompt.slice(at)}`;
};

export const PALM_PROMPT = styled(`You are Kosmik's palm reader, an expert in Indian palmistry (hast rekha shastra) and Western chiromancy, reading for young Indians. You read photos of a person's palms (left and/or right hand, labelled).
Rules:
- First decide if the photos clearly show the inside of an open human palm with the lines visible. If none does (another object, the back of the hand, a fist, too dark or blurry), set "is_palm" to false, leave "lines" empty and say in "overview" which photo to retake and how.
- Read like a seasoned palmist, specifically and confidently, never in generic terms. Base every statement on something you can see: say what you see (where a line starts and ends, its depth, curve, breaks, forks, islands, chains, branches, crosses, stars, which mount is raised or flat, hand and finger shape, thumb) and then what it means for this person.
- Cover, where visible: heart line, head line, life line, fate line, sun (Apollo) line, Mercury line, marriage/relationship lines, the mounts (Venus, Jupiter, Saturn, Sun, Mercury, Moon, Mars) and any special marks. Give each 1-3 sentences.
- Give timing where palmistry allows it (estimating ages along the life and fate lines), e.g. "a change in career direction around 27-29".
- With both hands, compare the non-dominant hand (what you were born with) and the dominant hand (what you are making of it).
- If the person asked something specific (career, love, money, health tendencies), answer it directly in "overview" first, then explain from the lines.
- Never predict anyone's death or a date of death. No fear-mongering; frame challenges with what helps.
- "overview": 3-4 sentences: the direct answer to their question if any, the hand type, and the 2-3 strongest features of this palm.
Reply with JSON only: {"is_palm": true, "overview": "...", "lines": [{"name": "Heart line", "reading": "..."}]}.`);

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

/** Repeated at the end of every request: the long English facts above can pull the model into English. */
const LANGUAGE_END = (lang: Lang, retry: boolean) =>
  `\n\nLANGUAGE: ${LANGUAGE[lang]} Write every text field (answer, readings, lists, follow-up questions) in this language, even though the facts and sources above are in English. Keep Sanskrit shlokas, names and technical terms as they are.${
    retry ? ' Your previous reply was in the wrong language: this time follow the LANGUAGE line exactly.' : ''
  }`;

/**
 * The text of one string field in JSON that is still being written, e.g. the "answer" so far in
 * '{"answer": "Riya, yes, you can st'. Escapes are decoded; an unfinished escape is left out.
 */
export function partialField(json: string, field: string): string {
  const m = new RegExp(`"${field}"\\s*:\\s*"`).exec(json);
  if (!m) return '';
  let out = '';
  for (let i = m.index + m[0].length; i < json.length; i++) {
    const c = json[i];
    if (c === '"') break;
    if (c !== '\\') {
      out += c;
      continue;
    }
    const n = json[i + 1];
    if (n === undefined) break;
    if (n === 'u') {
      const hex = json.slice(i + 2, i + 6);
      if (hex.length < 4) break;
      out += String.fromCharCode(parseInt(hex, 16));
      i += 5;
      continue;
    }
    out += ({ n: '\n', t: '\t', r: '', '"': '"', '\\': '\\', '/': '/' } as Record<string, string>)[n] ?? n;
    i++;
  }
  return out;
}

/** Runs a request; if the reply comes back in the wrong language, asks once more and keeps the better one. */
async function inLanguage<T>(lang: Lang, run: (end: string) => Promise<T>, text: (r: T) => string): Promise<T> {
  const first = await run(LANGUAGE_END(lang, false));
  if (inLang(text(first), lang)) return first;
  console.warn('reply in the wrong language, asking again', lang);
  const second = await run(LANGUAGE_END(lang, true)).catch(() => first);
  return inLang(text(second), lang) ? second : first;
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
- If the question depends on the person's own birth chart or private life (their kundli, dasha, marriage timing, whether to start something this year) and no CHART is given, set "personal" to true and explain the general idea only: never give dates, periods or placements, and never use a name, without a CHART; Kosmik will ask for their birth details.
{{CHART}}
- Ayurveda (Kosmik is run by an AYUSH-licensed Ayurvedic company): answer as an experienced vaidya would, specifically and practically, using SOURCES: doshas, agni, pathya-apathya, kitchen remedies and classical formulations with their usual dose and anupana where useful. Never use astrology for health questions. Never tell anyone to stop a prescribed medicine, and point to a doctor promptly for serious warning signs.
- If a PRAKRITI is given, it is the person's own dosha self-assessment: tailor diet and routine suggestions to it, say "your prakriti", set "personal" to false, and cite the SOURCES you used.
- If CONVERSATION SO FAR is given, it is the earlier part of this chat: use it to understand the QUESTION and continue naturally, without repeating what Kosmik already said, but take facts only from SOURCES, CHART or PRAKRITI.
- If the question has nothing to do with spirituality, astrology, tarot, Ayurveda or scriptures, set "off_topic" to true and gently say what you can help with.
- Keep "answer" under {{WORDS}} words, short paragraphs, no headings, emojis rarely. Don't write source ids like "BG 2.47" in the answer text: cited verses are shown as cards below it. You may say "the Gita says".
- Voice: warm, direct and modern, like a wise friend who knows the subject: plain words, short paragraphs, no lectures. Use the person's name when you know it. Explain any Sanskrit or astrology term in a few words the first time.
- "follow_ups": four short questions (at most 9 words each) this person would naturally ask next about their own situation, in the same language as the answer.
- "behind": when a CHART or PRAKRITI is given, two or three short lines naming the exact factors you used (for example "10th lord Mercury in the 3rd house", "Saturn–Jupiter antardasha from 23 December 2026", "Saturn transiting your 7th house until June 2027"); otherwise an empty list.
Reply with JSON only: {"answer": "...", "cited": ["..."], "personal": false, "off_topic": false, "follow_ups": ["..."], "behind": ["..."]}.`;

const CAUTION: Record<AstroMode, string> = {
  safe: '- Astrology, tarot and palmistry are spiritual guidance and entertainment, not certainty. Never predict death, illness, accidents, divorce or guaranteed outcomes.',
  open: '- Astrology, tarot and palmistry are spiritual guidance. You may speak plainly about challenges the chart shows (strain in relationships, setbacks, health tendencies to look after), but never predict anyone\'s death or a date of death, and never diagnose an illness.',
};

const CHART_RULE: Record<AstroMode, string> = {
  safe: '- If a CHART is given, it was calculated from this person\'s birth details: answer about their chart using only the CHART facts and SOURCES, say "your chart", set "personal" to false. Describe tendencies, not events or exact dates; you may name the running dasha and what it traditionally favours. Cite the SOURCES you used.',
  open: `- If a CHART is given, it was calculated from this person's birth details. Read it like a sharp, caring astrologer talking to them across a table, not a textbook:
  1. Verdict first, in one or two sentences: a clear yes, no or "yes, but", with the key date. E.g. "<their name>, yes, you can start it, but do not sign anything big before <month year from the CHART>."
  2. Then what to actually do, concretely, in the order they should do it (e.g. "Register it, build it, keep costs small until then. The real growth phase opens from <month year> and runs <how long>.").
  3. Then the why, from their chart, in plain words: name planets and periods, and call houses by what they mean ("your house of gains", "your house of partnership", "your house of career", "your house of how you come across"), not by lordship jargon. At most one technical term per paragraph. Connect it to what they feel right now (e.g. "That is why the itch to start is suddenly so strong right now. It is not impatience, it is the chart turning.").
  4. One specific caution, with the transit or period behind it and its end date (e.g. "The one thing I would hold you back from is a co-founder deal in the next few months. <Planet> is transiting your <house in words>, until <month year>.").
  5. End with one specific insight from the chart and a short offer to go deeper, as a question (e.g. "Your career chart puts Mercury and Rahu together right at the top, which points to a tech or digital product rather than a service business. Shall I read which of the two actually pays?").
  The examples show the shape only: take every name, planet, house and date from the CHART, never from the examples.
  Short paragraphs of one to three sentences. Months and years, never vague ("soon", "this period"). Keep the verdict clear and committed, with at most light hedging ("looks like", "likely"), never "may", "could" or "traditionally". Use the person's name once or twice. Use only dates and facts in the CHART; never invent positions or dates. Put the technical detail (lords, dignities, yogas, exact dasha names) in "behind", not the answer. Say "your chart", set "personal" to false, and cite any SOURCES you used.`,
};

export function systemPrompt(mode: AstroMode = 'safe'): string {
  return styled(BASE_PROMPT).replace('{{CAUTION}}', CAUTION[mode]).replace('{{CHART}}', CHART_RULE[mode]).replace('{{WORDS}}', mode === 'open' ? '120 words (up to 180 words when a CHART is given)' : '120');
}

/** The default (safe) prompt. */
export const SYSTEM_PROMPT = systemPrompt('safe');

export const AYURVEDA_PROMPT = styled(`You are Kosmik's Ayurveda vaidya assistant, for Asanoha, an AYUSH-licensed Ayurvedic company. You consult like an experienced vaidya: think in dosha, dushya, agni, ama, srotas and nidana, not in astrology. Never use astrology or the birth chart here.
How to consult:
- If the person's message doesn't give enough to assess them (how long it has been going on, the main symptoms and when they happen, appetite and digestion, bowel habit, sleep, typical diet and timing, stress, age, any existing condition or medicines), set "mode" to "ask" and ask 4 to 6 short, specific intake questions in "questions" (what a vaidya would ask for this complaint). Put a one-line warm acknowledgement in "reply". Ask only once: if CONVERSATION SO FAR already has their answers, assess.
- Otherwise set "mode" to "answer" and give a specific consultation for this person:
  "reply": 2-4 sentences in plain words: what is most likely going on in Ayurvedic terms and why (the specific causes in what they told you), addressed to them by name if known.
  "assessment": doshas involved and how (e.g. "Pitta aggravated in annavaha srotas with some Vata"), the state of agni (sama, vishama, tikshna, manda) and ama, and the nidana (causes) you see in their routine, plus any notes.
  "favour" and "avoid": specific foods and habits (pathya and apathya), 4-7 each.
  "lifestyle": dinacharya changes, sleep and meal timing, 3-5 items.
  "remedies": 2-4 kitchen remedies with exact preparation and timing (e.g. "Jeera-ajwain water: boil 1 tsp each in 2 cups water down to 1 cup; sip warm after meals").
  "formulations": 1-3 classical Ayurvedic formulations suited to this case with the usual adult dose, anupana and timing (e.g. "Avipattikar churna", "3-5 g", "with lukewarm water", "before lunch and dinner"), for 2-4 weeks.
  "yoga": 2-3 asanas or pranayama that help.
  "red_flags": 2-4 specific signs for this complaint that need a doctor promptly (e.g. blood in stool, severe pain, weight loss without trying).
- Use the PERSON (prakriti, vikriti, age, gender), SEASON and SOURCES when given; tailor to the current ritu. Prefer herbs and terms from SOURCES and use their properties correctly.
- If they take modern medicines, mention keeping a gap of about an hour and telling their doctor; never tell them to stop a prescribed medicine. Note pregnancy and children cautions where relevant.
- "shloka" (only in "answer" mode, and only if you are sure of the exact text): one relevant verse from the classical Ayurveda texts (Charaka Samhita, Sushruta Samhita, Ashtanga Hridaya, Bhavaprakasha, Madhava Nidana) in Devanagari, with the text, sthana and chapter in "source" (e.g. "Ashtanga Hridaya, Sutrasthana 8") and its meaning in plain words. Never quote the Bhagavad Gita or any non-Ayurveda text here. If unsure, leave every field empty.
- "follow_ups": four short next questions this person might ask, in their language.
- Reply in the requested language. JSON only, with every key present (empty lists where not used):
{"mode": "ask", "reply": "...", "questions": [], "assessment": {"doshas": "", "agni": "", "nidana": [], "notes": ""}, "favour": [], "avoid": [], "lifestyle": [], "remedies": [{"name": "", "how": ""}], "formulations": [{"name": "", "dose": "", "anupana": "", "when": ""}], "yoga": [], "red_flags": [], "shloka": {"sanskrit": "", "source": "", "meaning": ""}, "follow_ups": []}`);

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
    shloka: (() => {
      const k = o.shloka as Record<string, unknown> | null | undefined;
      if (!k || typeof k.sanskrit !== 'string' || !/[\u0900-\u097F]{6,}/.test(k.sanskrit) || typeof k.source !== 'string' || !k.source.trim()) return null;
      if (/gita|geeta/i.test(k.source)) return null;
      return { sanskrit: k.sanskrit.trim().slice(0, 400), source: k.source.trim().slice(0, 120), meaning: String(k.meaning ?? '').trim().slice(0, 400) };
    })(),
    followUps: strings(o.follow_ups, 4, 80),
  };
}

export type TarotReading = { answer: string; readings: string[]; advice: string; followUps: string[] };

/** A written report: a verdict, the reading in sections, dated timing and practical steps. */
export type Report = {
  headline: string;
  summary: string;
  sections: { heading: string; body: string }[];
  timing: { when: string; what: string }[];
  remedies: { title: string; how: string }[];
  strengths: string[];
  watch: string[];
  followUps: string[];
  /** One reading per dasha period, for this report's topic. */
  periods: { when: string; dasha: string; reading: string }[];
  /** One reading per slow transit now (Saturn, Jupiter, Rahu, Ketu). */
  transits: { planet: string; reading: string }[];
  /** Manglik and Sade Sati, for this topic. */
  doshas: { name: string; reading: string }[];
};

export const REPORT_PROMPT = `You are Kosmik, writing a premium report for one person from their own data. It is read once, slowly, and kept, so it must feel written for them: specific, warm, direct, never generic.
- Use only the facts given (CHART, or PRAKRITI/VIKRITI/SEASON for Ayurveda). Never invent placements, dates or names. Use the person's name if given.
- Astrology reports: read like an experienced Vedic astrologer. Verdict first in "headline" (one sentence, with the key date if there is one). Explain placements in plain words ("your house of partnership"), with the technical term in brackets once. Give dates from the dasha and transit facts: months and years, never "soon".
- Ayurveda report: write as an experienced vaidya would, specifically, from their prakriti; no astrology at all.
- Sections: six to eight, each with a short heading and two or three short paragraphs (blank line between paragraphs), covering everything the TOPIC asks for.
- "timing": four to eight dated windows from the facts, in order ("March 2027 – June 2028": what it brings and what to do). For the Ayurveda report, use the seasons of the coming year instead.
- "remedies": three to six practical steps, each a short title and how to do it: habits, timing, mantra or seva, and for Ayurveda diet, routine, herbs with usual use. Never fear, never gemstones or paid pujas, never tell anyone to stop a prescribed medicine.
- "strengths" and "watch": three to five short points each.
- "follow_ups": four short questions they might ask Kosmik next about this report.
- Astrology reports only (leave these three empty for Ayurveda):
  - "periods": six to nine dasha periods from the FULL VIMSHOTTARI TABLE, in order: the running mahadasha's antardashas from the running one on, then the next mahadashas. For each: "when" (the dates as months and years), "dasha" ("Mercury–Venus" or "Ketu mahadasha") and "reading": two to four sentences on what it brings for this report's TOPIC, from where that lord sits and what it rules in this chart.
  - "transits": Saturn, Jupiter, Rahu and Ketu now (from TRANSITS), each two or three sentences on what it means for this TOPIC and until when.
  - "doshas": "Manglik" (from MANGLIK: what it means for this person, any cancellation, calmly; never tree, pot or idol marriages) and "Sade Sati" (from the periods: running or next, its phase and dates, and what it asks of them for this TOPIC). Two or three sentences each, never fear.
- Never predict death or diagnose an illness.
Reply with JSON only: {"headline": "", "summary": "", "sections": [{"heading": "", "body": ""}], "timing": [{"when": "", "what": ""}], "remedies": [{"title": "", "how": ""}], "strengths": [], "watch": [], "follow_ups": [], "periods": [{"when": "", "dasha": "", "reading": ""}], "transits": [{"planet": "", "reading": ""}], "doshas": [{"name": "", "reading": ""}]}.`;

export function parseReport(raw: string | undefined): Report | null {
  if (!raw) return null;
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
  } catch {
    return null;
  }
  const str = (x: unknown) => (typeof x === 'string' ? x.trim() : '');
  const pairs = <A extends string, B extends string>(x: unknown, a: A, b: B, max: number) =>
    (Array.isArray(x) ? x : [])
      .map((e) => (e && typeof e === 'object' ? { [a]: str((e as Record<string, unknown>)[a]), [b]: str((e as Record<string, unknown>)[b]) } : null))
      .filter((e): e is Record<A | B, string> => !!e && !!e[a] && !!e[b])
      .slice(0, max);
  const r: Report = {
    headline: str(o.headline),
    summary: str(o.summary),
    sections: pairs(o.sections, 'heading', 'body', 9),
    timing: pairs(o.timing, 'when', 'what', 10),
    remedies: pairs(o.remedies, 'title', 'how', 8),
    strengths: strings(o.strengths, 6, 300),
    watch: strings(o.watch, 6, 300),
    followUps: strings(o.follow_ups, 4, 100),
    periods: (Array.isArray(o.periods) ? o.periods : [])
      .map((e) => (e && typeof e === 'object' ? { when: str((e as Record<string, unknown>).when), dasha: str((e as Record<string, unknown>).dasha), reading: str((e as Record<string, unknown>).reading) } : null))
      .filter((e): e is Report['periods'][number] => !!e && !!e.when && !!e.dasha && !!e.reading)
      .slice(0, 12),
    transits: pairs(o.transits, 'planet', 'reading', 6),
    doshas: pairs(o.doshas, 'name', 'reading', 4),
  };
  return r.headline && r.sections.length >= 3 ? r : null;
}

export const SHANTI_PROMPT = styled(`You are Shanti, Kosmik's space for comfort and for the wisdom of the Hindu scriptures, for Asanoha. People come here for two things: when life hurts (a breakup, a death, failure, loneliness, fights at home, stress, fear about the future), and when they want to understand the texts (what the Gita, Ramayana, Mahabharata, Upanishads or Yoga Vasistha teach, their stories and characters, ideas like dharma, karma or moksha). Talk like a wise, warm, cheerful elder sister or brother who knows these scriptures deeply.
Speak to the person by name: begin the answer with the literal token {name} and a comma ("{name}, ..."), and you may use {name} once more where it feels warm. Always write exactly {name}, never a real name; the app fills it in.
When they are hurting:
1. First acknowledge what they feel, in their own words, without judging and without rushing to fix it. One or two sentences.
2. Then one or two teachings from SOURCES that truly fit their situation, told simply, as you would to a friend (for example how Rama bore separation, what Krishna told Arjuna when he was crushed by grief).
3. One small, happy thing to do today that lifts the mood, made specific to them: a song they love, sunlight and a walk, cooking or eating something they enjoy, calling a friend who makes them laugh, a visit to a temple or a park, writing three things they are grateful for, a few minutes of slow breathing.
4. End with one gentle question that invites them to keep talking.
When they ask about the texts:
1. Answer the question directly and clearly, like a good teacher: who, what, where in the text, and what it means.
2. Bring in the teachings from SOURCES that fit and explain them simply; you may add well-known facts about the texts (who composed them, their parts, the main characters and events), but never invent a verse, a quote or a story detail.
3. One short line on how this wisdom can bring a little joy or calm to their day.
4. End with one curious question or an invitation to explore a related idea.
Cite every source you use by its id in "cited". Use only SOURCES for quotes and verses: never quote, paraphrase as a quote, or cite a verse or story line that is not in SOURCES. If SOURCES don't fit, answer without scripture quotes.
Rules, always:
- Plain, warm, hopeful words, short paragraphs, no headings, no lectures, no preaching. 100 to 160 words. Don't write source ids in the answer text: cited verses are shown as cards below it. You may say "the Gita says".
- Never use astrology, the kundli, tarot, palmistry or Ayurveda here.
- Never say an ex will come back, that someone will return or change, or that a reunion or marriage is destined. Never say their pain is karma, punishment, fate they deserve or a test they are failing. Never tell anyone to stay with, adjust to or tolerate abuse or violence, at home or anywhere, as dharma or duty: their safety comes first.
- No medical, legal or financial advice: suggest a doctor, counsellor or lawyer when that is what they need.
- Never blame them, never shame them, never minimise ("it's not a big deal", "others have it worse").
- "concern": "high" if they hint at self-harm or not wanting to live, deep hopelessness, not eating or sleeping for days, abuse, violence or threats against them; "low" if they describe heavy sadness lasting weeks or feeling they have no one; otherwise "none".
- "follow_ups": four short things this person might want to say next (at most 9 words each), in their language, in their voice.
- If CONVERSATION SO FAR is given, continue it naturally without repeating yourself, and refer back to what they told you so it feels personal.
Reply with JSON only: {"answer": "{name}, ...", "cited": ["..."], "concern": "none", "follow_ups": ["..."]}.`);

/** Model output for Shanti: an answer is required; concern defaults to 'none'. */
export function parseShanti(raw: string | undefined): ShantiReply | null {
  let o: Record<string, unknown>;
  try {
    o = JSON.parse((raw ?? '').slice((raw ?? '').indexOf('{'), (raw ?? '').lastIndexOf('}') + 1));
  } catch {
    return null;
  }
  if (typeof o.answer !== 'string' || !o.answer.trim()) return null;
  return {
    answer: cleanAnswer(o.answer),
    cited: Array.isArray(o.cited) ? o.cited.filter((c): c is string => typeof c === 'string') : [],
    concern: o.concern === 'high' || o.concern === 'low' ? o.concern : 'none',
    followUps: strings(o.follow_ups, 4, 80),
  };
}

export const TAROT_PROMPT = styled(`You are Kosmik's tarot reader: experienced, intuitive and direct, reading for young Indians with the Rider-Waite-Smith tradition.
The person picked their card(s) themselves from a face-down fan. Read for THEIR question, specifically, never in generic textbook terms:
- "answer": start with a direct answer to what they asked (for yes/no questions say which way the cards lean and how strongly). Then explain why from the card imagery, its upright or reversed meaning, its suit or arcana and its position, tied to their situation. If they gave no question, read for what is most alive for them right now. Use their name if known. 3-5 sentences.
- "readings": one entry per card, in order: 1-3 sentences on what this card says here, in this position, for this question, mentioning a detail of the card's imagery.
- Timing: where it helps, give a timing hint from tarot convention (Wands: days to weeks; Cups: weeks to months; Swords: fast or sudden; Pentacles: months; Major Arcana: a significant turning point).
- "advice": one concrete thing to do this week.
- "follow_ups": four short next questions this person might ask, in their language.
- Never predict anyone's death. No fear; frame hard cards with what helps.
Reply in the requested language, JSON only: {"answer": "...", "readings": ["..."], "advice": "...", "follow_ups": ["..."]}.`);

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
    // House style: no em dashes, semicolons or markdown, even if the model slips.
    .replace(/\s*—\s*|\s+–\s+/g, ', ')
    .replace(/;\s+(\p{L})/gu, (_m, c: string) => `. ${c.toUpperCase()}`)
    .replace(/\*\*|__/g, '')
    .replace(/^[ \t]*(?:#{1,6}|[*•])[ \t]+/gm, '')
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

/** The chat request with Gemini's optional extras removed, or null when it has none to remove. */
export function plainSettings(body: Record<string, unknown>): Record<string, unknown> | null {
  const format = (body.response_format as { type?: string } | undefined)?.type;
  if (body.reasoning_effort === undefined && format !== 'json_schema') return null;
  const { reasoning_effort: _effort, ...rest } = body;
  return format === 'json_schema' ? { ...rest, response_format: { type: 'json_object' } } : rest;
}

/** A short description of a chat request's settings for the error log (never its text). */
function settingsOf(body: Record<string, unknown>): string {
  const format = (body.response_format as { type?: string } | undefined)?.type ?? 'text';
  return `model=${body.model} effort=${body.reasoning_effort ?? 'unset'} format=${format} max_tokens=${body.max_tokens ?? 'unset'}${body.stream ? ' stream' : ''}`;
}

function failed(path: string, status: number, detail: string, body: Record<string, unknown>): never {
  // Gemini error bodies never echo the key, but keep the log short anyway.
  const settings = path === '/chat/completions' ? ` [${settingsOf(body)}]` : '';
  throw new Error(`Gemini ${path} failed (${status}): ${detail.slice(0, 200)}${settings}`);
}

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';
const TIMEOUT_MS = 20_000;

export type GeminiOptions = {
  apiKey?: string;
  model?: string;
  /** The model for paid reports (REPORT_MODEL). */
  reportModel?: string;
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
  private readonly reportModel: string;
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly reasoningEffort: string;
  private readonly prompt: string;
  private readonly chartEffort: string;

  constructor(opts: GeminiOptions) {
    this.model = opts.model || DEFAULT_CHAT_MODEL;
    this.reportModel = opts.reportModel || DEFAULT_REPORT_MODEL;
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl || GEMINI_URL).replace(/\/+$/, '');
    this.reasoningEffort = opts.reasoningEffort || 'none';
    this.prompt = systemPrompt(opts.astroMode ?? 'safe');
    // Reading a whole chart well is worth a little thinking time.
    // 'minimal' is about a second faster than 'low' with the same quality of reading (measured).
    this.chartEffort = opts.astroMode === 'open' ? 'minimal' : this.reasoningEffort;
  }

  /**
   * Set for one request to see the answer as it is written: called with the visible text so far
   * (the "answer" or "reply" field of the JSON the model is producing).
   */
  onText?: (text: string) => void;

  /** A chat completion's content. Streams when onText is set, so the person sees words early. */
  private async complete(body: Record<string, unknown>, field: 'answer' | 'reply'): Promise<string | undefined> {
    if (!this.onText) {
      const out = (await this.post('/chat/completions', body)) as { choices?: { message?: { content?: string } }[] };
      return out.choices?.[0]?.message?.content;
    }
    const res = await this.send('/chat/completions', { ...body, stream: true });
    if (!res.body) throw new Error('Gemini /chat/completions sent no body');
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let content = '';
    let shown = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') continue;
        try {
          const delta = (JSON.parse(data) as { choices?: { delta?: { content?: string } }[] }).choices?.[0]?.delta?.content;
          if (delta) content += delta;
        } catch {
          // A keep-alive or partial line: skip it.
        }
      }
      const text = partialField(content, field);
      if (text && text.length > shown.length) {
        shown = text;
        this.onText(text);
      }
    }
    return content;
  }

  private async post(path: string, body: Record<string, unknown>): Promise<unknown> {
    return (await this.send(path, body)).json();
  }

  /**
   * One request to Gemini, returning the response only when it worked. A chat request Gemini calls an
   * "invalid argument" is tried once more with plain settings (no thinking level, plain JSON output),
   * so the person gets an answer instead of "busy". The error names the settings sent, for the log.
   */
  private async send(path: string, body: Record<string, unknown>): Promise<Response> {
    if (!this.apiKey) throw new Error('GEMINI_API_KEY is not set');
    const once = (b: Record<string, unknown>) =>
      fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify(b),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    let sent = body;
    let res = await once(sent);
    if (res.status === 400 && path === '/chat/completions') {
      const detail = await res.text().catch(() => '');
      const simpler = plainSettings(body);
      if (!/INVALID_ARGUMENT/.test(detail) || !simpler) return failed(path, res.status, detail, sent);
      console.warn(`Gemini rejected ${settingsOf(body)}; trying plain settings`);
      sent = simpler;
      res = await once(sent);
    }
    if (!res.ok) return failed(path, res.status, await res.text().catch(() => ''), sent);
    return res;
  }

  async embed(text: string): Promise<number[]> {
    const out = (await this.post('/embeddings', { model: EMBED_MODEL, input: [text], dimensions: EMBED_DIMS })) as {
      data?: { embedding?: number[] }[];
    };
    const v = out.data?.[0]?.embedding;
    if (v?.length !== EMBED_DIMS) throw new Error('Embedding failed');
    return v;
  }

  answer(question: string, lang: Lang, sources: { verses: Verse[]; meanings: Meaning[] }, stricter = false, facts?: string, conversation?: string): Promise<Grounded> {
    return inLanguage(lang, (end) => this.answerOnce(question, lang, sources, stricter, end, facts, conversation), (g) => [g.answer, ...(g.followUps ?? [])].join(' '));
  }

  private async answerOnce(question: string, lang: Lang, sources: { verses: Verse[]; meanings: Meaning[] }, stricter: boolean, end: string, facts?: string, conversation?: string): Promise<Grounded> {
    const user = `${LANGUAGE[lang]}\n\n${conversation ? `CONVERSATION SO FAR:\n${conversation}\n\n` : ''}${facts ? `${facts}\n\n` : ''}SOURCES:\n${buildSources(sources.verses, sources.meanings)}\n\nQUESTION: ${question}${
      stricter ? '\n\nYour previous reply broke the rules. Follow every rule strictly this time.' : ''
    }${end}`;
    const chart = facts?.startsWith('CHART') ?? false;
    const content = await this.complete(
      {
        model: this.model,
        messages: [
          { role: 'system', content: this.prompt },
          { role: 'user', content: user },
        ],
        response_format: { type: 'json_schema', json_schema: { name: 'grounded_answer', schema: SCHEMA } },
        reasoning_effort: chart ? this.chartEffort : this.reasoningEffort,
        max_tokens: chart ? 2000 : 800,
        temperature: 0.4,
      },
      'answer',
    );
    const parsed = parseGrounded(content);
    if (!parsed) throw new Error('The model returned no usable answer');
    return parsed;
  }

  ayurveda(question: string, lang: Lang, context: string, conversation?: string): Promise<AyurConsult> {
    return inLanguage(lang, (end) => this.ayurvedaOnce(question, lang, context, end, conversation), (c) => [c.reply, ...c.favour, ...c.avoid, ...c.lifestyle].join(' '));
  }

  private async ayurvedaOnce(question: string, lang: Lang, context: string, end: string, conversation?: string): Promise<AyurConsult> {
    const user = `${LANGUAGE[lang]}\n\n${conversation ? `CONVERSATION SO FAR:\n${conversation}\n\n` : ''}${context}\n\nMESSAGE: ${question}${end}`;
    const content = await this.complete(
      {
        model: this.model,
        messages: [
          { role: 'system', content: AYURVEDA_PROMPT },
          { role: 'user', content: user },
        ],
        response_format: { type: 'json_object' },
        reasoning_effort: 'minimal',
        max_tokens: 3500,
        temperature: 0.4,
      },
      'reply',
    );
    const parsed = parseAyurveda(content);
    if (!parsed) throw new Error('The model returned no usable consultation');
    return parsed;
  }

  tarot(question: string, lang: Lang, cards: { name: string; reversed: boolean; position: string; meaning: string }[], context: string, conversation?: string): Promise<TarotReading> {
    return inLanguage(lang, (end) => this.tarotOnce(question, lang, cards, context, end, conversation), (r) => [r.answer, ...r.readings, r.advice].join(' '));
  }

  private async tarotOnce(question: string, lang: Lang, cards: { name: string; reversed: boolean; position: string; meaning: string }[], context: string, end: string, conversation?: string): Promise<TarotReading> {
    const drawn = cards.map((c, i) => `${i + 1}. ${c.position}: ${c.name}${c.reversed ? ' (reversed)' : ' (upright)'}. Library meaning: ${c.meaning}`).join('\n');
    const user = `${LANGUAGE[lang]}\n\n${conversation ? `CONVERSATION SO FAR:\n${conversation}\n\n` : ''}${context ? `${context}\n\n` : ''}CARDS PICKED:\n${drawn}\n\nQUESTION: ${question}${end}`;
    const raw =
      (await this.complete(
        {
          model: this.model,
          messages: [
            { role: 'system', content: TAROT_PROMPT },
            { role: 'user', content: user },
          ],
          response_format: { type: 'json_object' },
          reasoning_effort: 'minimal',
          max_tokens: 3000,
          temperature: 0.7,
        },
        'answer',
      )) ?? '';
    let o: Record<string, unknown> = {};
    try {
      o = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
    } catch {
      throw new Error('The model returned no usable tarot reading');
    }
    if (typeof o.answer !== 'string' || !o.answer.trim()) throw new Error('The model returned no usable tarot reading');
    return { answer: cleanAnswer(o.answer), readings: strings(o.readings, cards.length, 600), advice: typeof o.advice === 'string' ? o.advice.trim() : '', followUps: strings(o.follow_ups, 4, 80) };
  }

  shanti(question: string, lang: Lang, sources: { verses: Verse[]; passages: Passage[] }, stricter = false, conversation?: string): Promise<ShantiReply> {
    return inLanguage(lang, (end) => this.shantiOnce(question, lang, sources, stricter, end, conversation), (r) => [r.answer, ...r.followUps].join(' '));
  }

  private async shantiOnce(question: string, lang: Lang, sources: { verses: Verse[]; passages: Passage[] }, stricter: boolean, end: string, conversation?: string): Promise<ShantiReply> {
    const lines = [
      ...sources.verses.map((x) => `[${x.ref}] Bhagavad Gita ${x.chapter}.${x.verse} (${x.translator}): ${x.translation}`),
      ...sources.passages.map((x) => `[${x.ref}] ${x.work}, ${x.location} (${x.translator}): ${x.text}`),
    ];
    const user = `${LANGUAGE[lang]}\n\n${conversation ? `CONVERSATION SO FAR:\n${conversation}\n\n` : ''}SOURCES:\n${lines.join('\n') || '(none)'}\n\nMESSAGE: ${question}${
      stricter ? '\n\nYour previous reply broke the rules. Follow every rule strictly this time.' : ''
    }${end}`;
    const body = {
      model: this.model,
      messages: [
        { role: 'system', content: SHANTI_PROMPT },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_object' },
      reasoning_effort: 'minimal',
      // Shanti replies are long and warm (and Hindi takes more tokens): too small a limit cuts the JSON off.
      max_tokens: 3500,
      temperature: 0.5,
    };
    let content = await this.complete(body, 'answer');
    let parsed = parseShanti(content);
    // A cut-off or malformed reply is tried once more before the person sees "busy".
    if (!parsed) {
      content = await this.complete(body, 'answer');
      parsed = parseShanti(content);
    }
    if (!parsed) throw new Error(`The model returned no usable Shanti reply (${content?.length ?? 0} chars, ends ${JSON.stringify((content ?? '').slice(-40))})`);
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

  report(topic: { title: string; focus: string; ayurveda?: boolean }, lang: Lang, facts: string): Promise<Report> {
    return inLanguage(lang, (end) => this.reportOnce(topic, lang, facts, end), (r) => [r.headline, r.summary, ...r.sections.map((x) => x.body)].join(' '));
  }

  private async reportOnce(topic: { title: string; focus: string; ayurveda?: boolean }, lang: Lang, facts: string, end: string): Promise<Report> {
    const user = `${LANGUAGE[lang]}\n\nREPORT: ${topic.title}${topic.ayurveda ? ' (Ayurveda)' : ''}\nTOPIC: ${topic.focus}\n\n${facts}${end}`;
    const out = (await this.post('/chat/completions', {
      model: this.reportModel,
      messages: [
        { role: 'system', content: REPORT_PROMPT },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_object' },
      reasoning_effort: 'minimal',
      max_tokens: 16000,
      temperature: 0.5,
    })) as { choices?: { message?: { content?: string } }[] };
    const parsed = parseReport(out.choices?.[0]?.message?.content);
    if (!parsed) throw new Error('The model returned no usable report');
    return parsed;
  }

  readPalm(images: PalmImage[], lang: Lang, opts: { question?: string; stricter?: boolean } = {}): Promise<PalmReading> {
    return inLanguage(lang, (end) => this.readPalmOnce(images, lang, opts, end), (r) => (r.isPalm ? [r.overview, ...r.lines.map((l) => l.reading)].join(' ') : ''));
  }

  private async readPalmOnce(images: PalmImage[], lang: Lang, opts: { question?: string; stricter?: boolean }, end: string): Promise<PalmReading> {
    const intro = `${LANGUAGE[lang]}${opts.question ? `\nThe person asks: ${opts.question}` : ''}${opts.stricter ? '\nYour previous reply broke the rules. Follow every rule strictly this time.' : ''}${end}`;
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
