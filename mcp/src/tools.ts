/**
 * What each Kosmik MCP tool returns: plain text another AI (Claude, ChatGPT) reads and explains.
 * Everything here is calculated or looked up; no AI is called, so no question is counted.
 */
import { isPremium } from '../../api/src/auth.ts';
import { D1Ayurveda, prakritiLabel } from '../../api/src/ayurveda.ts';
import { runCalculator } from '../../api/src/calculators.ts';
import { D1Profiles, type Place, type Profile, searchPlaces, toBirth } from '../../api/src/profiles.ts';
import { D1Library, D1Usage } from '../../api/src/store.ts';
import type { Block } from '../../api/src/types.ts';
import type { ToolCall } from './analytics.ts';
import { TAROT } from '../../api/src/lib/catalog.ts';
import { calculateChart } from '../../api/src/lib/chart.ts';
import { HERB_INDEX } from '../../api/src/lib/herb-index.ts';
import { deepChart } from '../../api/src/lib/jyotish.ts';
import { kundali, kundaliFacts } from '../../api/src/lib/kundali.ts';
import { istDate } from '../../api/src/lib/limits.ts';
import { reportSpec } from '../../api/src/lib/reports.ts';

export type ToolEnv = {
  db: D1Database;
  userId: string;
  now: Date;
  /** A random whole number below n (tests pass a fixed one). */
  random?: (n: number) => number;
  searchPlaces?: (q: string) => Promise<Place[]>;
  /** Told about every tool call (for PostHog); never given the inputs. */
  track?: (call: ToolCall) => void;
};

export const SITE = 'https://kosmik.asanoha.co.in';

/** Kosmik's rules, at the end of every result, so the other AI keeps to them when it explains. */
export const RULES =
  '\n\n---\nHow to use this (Kosmik’s rules): explain it warmly in plain words. Give dates only from these facts, never invented ones. No fear or doom, no gemstones, no paid pujas; remedies are practical (habits, timing, mantra, seva). For health, see a doctor first and never stop a prescribed medicine.';

const NO_DETAILS = `Add your birth details in Kosmik first (date, time and place of birth): ${SITE}/account. Then ask again.`;

const secureRandom = (n: number) => crypto.getRandomValues(new Uint32Array(1))[0] % n;

async function profileOf(env: ToolEnv): Promise<Profile | null> {
  return new D1Profiles(env.db).get(env.userId);
}

/** The chart text sections Kosmik's own AI reads, keyed by their heading. */
function chartParts(p: Profile, now: Date) {
  const chart = calculateChart(toBirth(p));
  const deep = deepChart(chart, now, p.name).split('\n\n');
  const k = kundali(chart, { name: p.name, place: p.place, birthDate: p.birthDate, birthTime: p.birthTime, lat: p.lat, lon: p.lon, tzOffsetMin: p.tzOffsetMin }, now);
  const facts = kundaliFacts(k).split('\n\n');
  return { deep, k, facts };
}

const section = (parts: string[], heading: string) => parts.find((s) => s.startsWith(heading)) ?? '';
const rows = (title: string, r: [string, string][]) => `${title}:\n${r.map(([l, v]) => `${l}: ${v}`).join('\n')}`;

export async function myKundali(env: ToolEnv): Promise<string> {
  const p = await profileOf(env);
  if (!p) return NO_DETAILS;
  const { deep, k } = chartParts(p, env.now);
  const chart = deep.filter((s) => !s.startsWith('VIMSHOTTARI DASHA') && !s.startsWith('TRANSITS')).join('\n\n');
  const kind = k.chartKind === 'moon' ? '\n(Birth time not known: houses are counted from the Moon sign.)' : '';
  return `${chart}${kind}\n\n${rows('BIRTH DETAILS', k.basics)}\n\n${rows('PANCHANG AT BIRTH', k.panchang)}\n\n${rows('AVKAHADA CHAKRA', k.avkahada)}${RULES}`;
}

export async function myDashas(env: ToolEnv): Promise<string> {
  const p = await profileOf(env);
  if (!p) return NO_DETAILS;
  const { deep, facts } = chartParts(p, env.now);
  return `${section(deep, 'VIMSHOTTARI DASHA')}\n\n${section(facts, 'FULL VIMSHOTTARI TABLE')}${RULES}`;
}

export async function transitsNow(env: ToolEnv): Promise<string> {
  const p = await profileOf(env);
  if (!p) return NO_DETAILS;
  const { deep, facts } = chartParts(p, env.now);
  return `${section(deep, 'TRANSITS')}\n\n${section(facts, 'SADE SATI AND DHAIYA')}${RULES}`;
}

export type Partner = { name?: string; birthDate: string; birthTime?: string | null; place: string };

/** A calculator block as text. */
function blockText(b: Block): string {
  if (b.type === 'milan') {
    const kootas = b.kootas.map((x) => `${x.name}: ${x.got} of ${x.max} (${x.boy} / ${x.girl}). ${x.note}`).join('\n');
    return `GUNA MILAN (groom ${b.boy}, bride ${b.girl}):\nGuna Milan: ${b.total} out of 36. ${b.verdict}\n${kootas}\n${b.simplified}`;
  }
  if (b.type === 'facts') return `${rows(b.title.toUpperCase(), b.rows)}${b.note ? `\n${b.note}` : ''}`;
  return JSON.stringify(b);
}

export async function matchKundali(env: ToolEnv, partner: Partner): Promise<string> {
  const p = await profileOf(env);
  if (!p) return NO_DETAILS;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(partner.birthDate ?? '')) throw new ToolInputError('Give the partner’s date of birth as YYYY-MM-DD.');
  const time = partner.birthTime?.trim() || null;
  if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new ToolInputError('Give the partner’s birth time as HH:MM (24-hour), or leave it out if unknown.');
  const place = (await (env.searchPlaces ?? searchPlaces)(partner.place ?? ''))[0];
  if (!place) throw new ToolInputError('Kosmik couldn’t find that place. Give the town or city and the state or country.');
  if (place.tzOffsetMin === null) throw new ToolInputError('Kosmik needs the time zone at that place; for now matching works for places in India.');
  const them = { date: partner.birthDate, time, lat: place.lat, lon: place.lon, tzOffsetMin: place.tzOffsetMin, name: partner.name?.trim().slice(0, 60) || 'Partner' };
  const me = { ...toBirth(p), name: p.name ?? 'You' };
  // Guna Milan is read groom to bride.
  const [groom, bride] = p.gender === 'female' ? [them, me] : [me, them];
  const blocks = runCalculator('milan', groom, bride, env.now);
  return `${blocks.map(blockText).join('\n\n')}\n\n(${them.name}: born ${them.date}${time ? ` at ${time}` : ', time not known'} in ${place.name}. Not saved.)${RULES}`;
}

export async function drawTarot(env: ToolEnv, count: 1 | 3): Promise<string> {
  const random = env.random ?? secureRandom;
  const library = new D1Library(env.db);
  const deck = [...TAROT];
  const positions = count === 1 ? ['Your card'] : ['Past', 'Present', 'Future'];
  const out: string[] = [];
  for (const position of positions) {
    const card = deck.splice(random(deck.length), 1)[0];
    const reversed = random(3) === 0;
    const meaning = await library.meaning(reversed ? 'tarot-reversed' : 'tarot-upright', card.key);
    out.push(`${position}: ${card.name} (${reversed ? 'reversed' : 'upright'})${meaning ? `\n${meaning.body}` : ''}`);
  }
  return `Cards drawn by Kosmik (read them as drawn; don't redraw):\n\n${out.join('\n\n')}${RULES}`;
}

export async function findVerse(env: ToolEnv, chapter: number, verse: number): Promise<string> {
  const v = await new D1Library(env.db).verse(chapter, verse);
  if (!v) return `Kosmik's library has no verse ${chapter}.${verse} of the Bhagavad Gita.`;
  return `Bhagavad Gita ${v.chapter}.${v.verse}\n\n${v.sanskrit}\n\n${v.iast}\n\n${v.translation} (${v.translator})${RULES}`;
}

/** The herb's key, from any of its names (Sanskrit, Hindi, English, botanical or synonyms). */
function herbKey(name: string): string | null {
  const q = name.trim().toLowerCase();
  if (!q) return null;
  const hit = HERB_INDEX.find(([key, names, synonyms]) => key === q || names.includes(q) || synonyms.includes(q));
  return hit ? hit[0] : null;
}

export async function herbInfo(env: ToolEnv, name: string): Promise<string> {
  const key = herbKey(name);
  const h = key ? await new D1Ayurveda(env.db).herb(key) : null;
  if (!h) return `“${name}” isn’t in Kosmik’s herb library. Try its Sanskrit, Hindi or English name.`;
  const list = (x: string[]) => x.join(', ') || 'none';
  return [
    `${h.name} (${h.english}, ${h.botanical})`,
    `Parts used: ${list(h.parts)}`,
    `Rasa: ${list(h.rasa)}. Guna: ${list(h.guna)}. Virya: ${h.virya}. Vipaka: ${h.vipaka}.`,
    `Calms: ${list(h.pacify)}. Can aggravate: ${list(h.aggravate)}.`,
    h.synonyms.length ? `Sanskrit synonyms: ${list(h.synonyms)}` : '',
    h.description,
    h.caution ? 'Caution: classical texts class this plant as poisonous; use only under a qualified vaidya.' : '',
    `More: ${h.link}`,
  ]
    .filter(Boolean)
    .join('\n') + RULES;
}

export async function myPrakriti(env: ToolEnv): Promise<string> {
  const a = new D1Ayurveda(env.db);
  const [p, v] = await Promise.all([a.prakriti(env.userId), a.vikriti(env.userId)]);
  if (!p && !v) return `You haven’t taken the prakriti quiz yet. Take it in Kosmik (Ask Ayurveda → “What is my prakriti?”): ${SITE}/chat`;
  const lines: string[] = [];
  if (p) lines.push(`Prakriti: Vata ${p.vata}%, Pitta ${p.pitta}%, Kapha ${p.kapha}% (${prakritiLabel(p)}).`);
  else lines.push('Prakriti: quiz not taken yet.');
  if (v) lines.push(`Vikriti (current state, answers out of 10): Vata ${v.vata}, Pitta ${v.pitta}, Kapha ${v.kapha}; agni: ${v.agni}.`);
  return lines.join('\n') + RULES;
}

type StoredReport = {
  headline: string;
  summary: string;
  sections: { heading: string; body: string }[];
  timing?: { when: string; what: string }[];
  remedies?: { title: string; how: string }[];
  periods?: { when: string; dasha: string; reading: string }[];
  transits?: { planet: string; reading: string }[];
  doshas?: { name: string; reading: string }[];
};

export async function myReports(env: ToolEnv): Promise<string> {
  if (!(await isPremium(env.db, env.userId, env.now.getTime()))) {
    return `Reading your Kosmik reports here is part of Premium (₹51 for 7 days or ₹101 for 30 days): ${SITE}/premium`;
  }
  const { results } = await env.db
    .prepare('SELECT report_key AS key, content FROM reports WHERE user_id = ? ORDER BY created_at DESC LIMIT 5')
    .bind(env.userId)
    .all<{ key: string; content: string }>();
  if (!results.length) return `You haven’t unlocked any reports yet. See them in Kosmik: ${SITE}/reports`;
  const one = (key: string, r: StoredReport) => {
    const parts = [`REPORT: ${reportSpec(key)?.title ?? key}`, r.headline, r.summary, ...r.sections.map((s) => `${s.heading}\n${s.body}`)];
    if (r.timing?.length) parts.push(`Timing:\n${r.timing.map((t) => `${t.when}: ${t.what}`).join('\n')}`);
    if (r.periods?.length) parts.push(`Dasha periods:\n${r.periods.map((x) => `${x.when}, ${x.dasha}: ${x.reading}`).join('\n')}`);
    if (r.transits?.length) parts.push(`Transits:\n${r.transits.map((x) => `${x.planet}: ${x.reading}`).join('\n')}`);
    if (r.doshas?.length) parts.push(r.doshas.map((x) => `${x.name}: ${x.reading}`).join('\n'));
    if (r.remedies?.length) parts.push(`Remedies:\n${r.remedies.map((x) => `${x.title}: ${x.how}`).join('\n')}`);
    return parts.filter(Boolean).join('\n\n');
  };
  const texts = results.map((row) => {
    try {
      return one(row.key, JSON.parse(row.content) as StoredReport);
    } catch {
      return `REPORT: ${row.key} (couldn’t be read)`;
    }
  });
  return texts.join('\n\n=====\n\n') + RULES;
}

/** Daily lookups in Claude and ChatGPT: 11 on a free account, 51 on Premium. */
export const FREE_CALLS_PER_DAY = 11;
export const PREMIUM_CALLS_PER_DAY = 51;

/** Counts one tool call; ok is false once today's allowance is used (India time). */
export async function takeCall(env: ToolEnv): Promise<{ ok: boolean; limit: number; premium: boolean }> {
  const premium = await isPremium(env.db, env.userId, env.now.getTime());
  const limit = premium ? PREMIUM_CALLS_PER_DAY : FREE_CALLS_PER_DAY;
  const usage = new D1Usage(env.db);
  const subject = `mcp:${env.userId}`;
  const period = `d:${istDate(env.now.getTime())}`;
  if ((await usage.count(subject, period)) >= limit) return { ok: false, limit, premium };
  await usage.increment(subject, period);
  return { ok: true, limit, premium };
}

/** A tool input the person (or their AI) can fix, shown to them as is. */
export class ToolInputError extends Error {}
