/**
 * Ayurveda: the herb library (Amidha Ayurveda Herb Database v2.0, Sparsh Varshney, CC BY 4.0,
 * descriptions rewritten by Kosmik) and each person's prakriti, from a short self-assessment quiz.
 */
import type { Block } from './types.ts';

export type Dosha = 'vata' | 'pitta' | 'kapha';
export const DOSHAS: Dosha[] = ['vata', 'pitta', 'kapha'];

export type Herb = {
  key: string;
  name: string;
  english: string;
  botanical: string;
  rasa: string[];
  guna: string[];
  virya: string;
  vipaka: string;
  pacify: Dosha[];
  aggravate: Dosha[];
  parts: string[];
  synonyms: string[];
  description: string;
  caution: boolean;
  link: string;
};

export type HerbFilter = { dosha?: Dosha; effect: 'pacify' | 'aggravate'; virya?: 'Ushna' | 'Sheeta'; rasa?: string[]; guna?: string[]; vipaka?: string };

export type Prakriti = { vata: number; pitta: number; kapha: number; takenAt: number };

export class PrakritiError extends Error {}

/** Vikriti: the current state, from ten questions about the last few weeks. The first is about digestion. */
export const VIKRITI_QUESTIONS = 10;
export type Vikriti = { vata: number; pitta: number; kapha: number; agni: 'sama' | 'vishama' | 'tikshna' | 'manda'; takenAt: number };
const AGNI = { n: 'sama', v: 'vishama', p: 'tikshna', k: 'manda' } as const;
export const AGNI_LABEL: Record<Vikriti['agni'], string> = {
  sama: 'Sama agni (balanced digestion)',
  vishama: 'Vishama agni (irregular, Vata-type)',
  tikshna: 'Tikshna agni (sharp, Pitta-type)',
  manda: 'Manda agni (slow, Kapha-type)',
};

export function scoreVikriti(answers: unknown): Omit<Vikriti, 'takenAt'> {
  if (!Array.isArray(answers) || answers.length !== VIKRITI_QUESTIONS || answers.some((a) => !['v', 'p', 'k', 'n'].includes(a))) {
    throw new PrakritiError(`Answer all ${VIKRITI_QUESTIONS} questions.`);
  }
  const count = (x: string) => answers.filter((a) => a === x).length;
  return { vata: count('v'), pitta: count('p'), kapha: count('k'), agni: AGNI[answers[0] as keyof typeof AGNI] };
}

/** Doshas raised now: three or more signs out of ten, strongest first. */
export const aggravated = (v: { vata: number; pitta: number; kapha: number }): Dosha[] =>
  DOSHAS.filter((d) => v[d] >= 3).sort((a, b) => v[b] - v[a]);

export const vikritiBlock = (v: Vikriti, prakriti: Prakriti | null): Block => ({
  type: 'vikriti',
  vata: v.vata,
  pitta: v.pitta,
  kapha: v.kapha,
  aggravated: aggravated(v).map(cap),
  agni: AGNI_LABEL[v.agni],
  takenAt: v.takenAt,
  prakriti: prakriti ? prakritiLabel(prakriti) : null,
});

export interface Ayurveda {
  /** The same store, with Hindi herb names and cards where there are some. */
  inLang?(lang: string): Ayurveda;
  herb(key: string): Promise<Herb | null>;
  herbs(keys: string[]): Promise<Herb[]>;
  /** Herbs matching a filter, and how many match in all. */
  findHerbs(filter: HerbFilter, limit: number): Promise<{ herbs: Herb[]; total: number }>;
  prakriti(userId: string): Promise<Prakriti | null>;
  vikriti(userId: string): Promise<Vikriti | null>;
}

/** How many questions the prakriti quiz has (the questions themselves live in the app). */
export const PRAKRITI_QUESTIONS = 12;

const cap = (d: string) => d[0].toUpperCase() + d.slice(1);

/** Turns quiz answers ('v' | 'p' | 'k', one per question) into percentages that add up to 100. */
export function scorePrakriti(answers: unknown): { vata: number; pitta: number; kapha: number } {
  if (!Array.isArray(answers) || answers.length !== PRAKRITI_QUESTIONS || answers.some((a) => a !== 'v' && a !== 'p' && a !== 'k')) {
    throw new PrakritiError(`Answer all ${PRAKRITI_QUESTIONS} questions.`);
  }
  const count = (x: string) => answers.filter((a) => a === x).length;
  const raw = { vata: count('v'), pitta: count('p'), kapha: count('k') };
  const pct = { vata: Math.round((100 * raw.vata) / PRAKRITI_QUESTIONS), pitta: Math.round((100 * raw.pitta) / PRAKRITI_QUESTIONS), kapha: 0 };
  pct.kapha = 100 - pct.vata - pct.pitta;
  return pct;
}

/** The doshas that lead, strongest first: one, two, or all three when they are close. */
export function dominant(p: { vata: number; pitta: number; kapha: number }): Dosha[] {
  const order = [...DOSHAS].sort((a, b) => p[b] - p[a]);
  const [first, second, third] = order;
  if (p[first] - p[third] < 10) return order;
  if (p[first] - p[second] >= 15) return [first];
  return [first, second];
}

export const prakritiLabel = (p: { vata: number; pitta: number; kapha: number }) => {
  const d = dominant(p);
  return d.length === 3 ? 'Tridoshic (balanced)' : d.map(cap).join('-');
};

export const prakritiBlock = (p: Prakriti): Block => ({ type: 'prakriti', vata: p.vata, pitta: p.pitta, kapha: p.kapha, label: prakritiLabel(p), takenAt: p.takenAt });

export const herbBlock = (h: Herb): Block => ({
  type: 'herb',
  key: h.key,
  name: h.name,
  english: h.english,
  botanical: h.botanical,
  rasa: h.rasa,
  guna: h.guna,
  virya: h.virya,
  vipaka: h.vipaka,
  pacify: h.pacify,
  aggravate: h.aggravate,
  description: h.description,
  caution: h.caution,
  link: h.link,
  synonyms: h.synonyms,
  parts: h.parts,
});

/** Cooling herbs suit Pitta; warming herbs suit Vata and Kapha. Listed first, then by name. */
const SUITS: Record<Dosha, string> = { vata: 'Ushna', pitta: 'Sheeta', kapha: 'Ushna' };

type HerbRow = {
  key: string;
  name: string;
  english: string;
  botanical: string;
  rasa: string;
  guna: string;
  virya: string;
  vipaka: string;
  pacify: string;
  aggravate: string;
  parts: string;
  synonyms: string;
  description: string;
  caution: number;
  link: string;
};
const HERB_COLS = 'key, name, english, botanical, rasa, guna, virya, vipaka, pacify, aggravate, parts, synonyms, description, caution, link';
/** In Hindi: the Devanagari name first, and the Hindi herb card as the description where there is one. */
const HERB_COLS_HI = `herbs.key, CASE WHEN herbs.name_hi IS NOT NULL THEN herbs.name_hi || ' (' || herbs.name || ')' ELSE herbs.name END AS name, english, botanical, rasa, guna, virya, vipaka, pacify, aggravate, parts, synonyms, COALESCE((SELECT body FROM meanings m WHERE m.kind = 'herb' AND m.key = herbs.key AND m.lang = 'hi'), description) AS description, caution, link`;
const toHerb = (r: HerbRow): Herb => ({
  ...r,
  rasa: JSON.parse(r.rasa),
  guna: JSON.parse(r.guna),
  pacify: JSON.parse(r.pacify),
  aggravate: JSON.parse(r.aggravate),
  parts: JSON.parse(r.parts),
  synonyms: JSON.parse(r.synonyms),
  caution: r.caution === 1,
});

export class D1Ayurveda implements Ayurveda {
  private readonly db: D1Database;
  private readonly cols: string;
  constructor(db: D1Database, lang = 'en') {
    this.db = db;
    this.cols = lang === 'hi' ? HERB_COLS_HI : HERB_COLS;
  }
  inLang(lang: string) {
    return new D1Ayurveda(this.db, lang);
  }
  async herb(key: string) {
    const r = await this.db.prepare(`SELECT ${this.cols} FROM herbs WHERE key = ?`).bind(key).first<HerbRow>();
    return r ? toHerb(r) : null;
  }
  async herbs(keys: string[]) {
    if (!keys.length) return [];
    const { results } = await this.db.prepare(`SELECT ${this.cols} FROM herbs WHERE key IN (${keys.map(() => '?').join(',')})`).bind(...keys).all<HerbRow>();
    return keys.map((k) => results.find((r) => r.key === k)).filter((r): r is HerbRow => !!r).map(toHerb);
  }
  async findHerbs(filter: HerbFilter, limit: number) {
    const where: string[] = [];
    const binds: string[] = [];
    if (filter.dosha) {
      const col = filter.effect === 'pacify' ? 'pacify' : 'aggravate';
      where.push(`EXISTS (SELECT 1 FROM json_each(herbs.${col}) WHERE value = ?)`);
      binds.push(filter.dosha);
      // Herbs that balance a dosha but also raise it are left out (none should, but the data is hand-made).
      if (filter.effect === 'pacify') {
        where.push(`NOT EXISTS (SELECT 1 FROM json_each(herbs.aggravate) WHERE value = ?)`);
        binds.push(filter.dosha);
      }
    }
    if (filter.virya) {
      where.push('virya = ?');
      binds.push(filter.virya);
    }
    if (filter.vipaka) {
      where.push('vipaka = ?');
      binds.push(filter.vipaka);
    }
    for (const r of filter.rasa ?? []) {
      where.push('EXISTS (SELECT 1 FROM json_each(herbs.rasa) WHERE value = ?)');
      binds.push(r);
    }
    for (const g of filter.guna ?? []) {
      where.push('EXISTS (SELECT 1 FROM json_each(herbs.guna) WHERE value = ?)');
      binds.push(g);
    }
    // Poisonous plants are never suggested in a list.
    where.push('caution = 0');
    const clause = where.join(' AND ');
    const suits = filter.dosha && filter.effect === 'pacify' ? SUITS[filter.dosha] : '';
    const [{ results }, total] = await Promise.all([
      this.db
        .prepare(`SELECT ${this.cols} FROM herbs WHERE ${clause} ORDER BY (virya = ?) DESC, json_array_length(pacify) ASC, name LIMIT ?`)
        .bind(...binds, suits, limit)
        .all<HerbRow>(),
      this.db.prepare(`SELECT COUNT(*) AS n FROM herbs WHERE ${clause}`).bind(...binds).first<{ n: number }>(),
    ]);
    return { herbs: results.map(toHerb), total: total?.n ?? 0 };
  }
  async prakriti(userId: string) {
    const r = await this.db.prepare('SELECT vata, pitta, kapha, taken_at FROM prakriti WHERE user_id = ?').bind(userId).first<{ vata: number; pitta: number; kapha: number; taken_at: number }>();
    return r ? { vata: r.vata, pitta: r.pitta, kapha: r.kapha, takenAt: r.taken_at } : null;
  }
  async savePrakriti(userId: string, answers: unknown, now: number): Promise<Prakriti> {
    const p = scorePrakriti(answers);
    await this.db
      .prepare(
        `INSERT INTO prakriti (user_id, vata, pitta, kapha, answers, taken_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (user_id) DO UPDATE SET vata = excluded.vata, pitta = excluded.pitta, kapha = excluded.kapha, answers = excluded.answers, taken_at = excluded.taken_at`,
      )
      .bind(userId, p.vata, p.pitta, p.kapha, JSON.stringify(answers), now)
      .run();
    return { ...p, takenAt: now };
  }
  async vikriti(userId: string) {
    const r = await this.db.prepare('SELECT vata, pitta, kapha, agni, taken_at FROM vikriti WHERE user_id = ?').bind(userId).first<{ vata: number; pitta: number; kapha: number; agni: Vikriti['agni']; taken_at: number }>();
    return r ? { vata: r.vata, pitta: r.pitta, kapha: r.kapha, agni: r.agni, takenAt: r.taken_at } : null;
  }
  async saveVikriti(userId: string, answers: unknown, now: number): Promise<Vikriti> {
    const v = scoreVikriti(answers);
    await this.db
      .prepare(
        `INSERT INTO vikriti (user_id, vata, pitta, kapha, agni, answers, taken_at) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (user_id) DO UPDATE SET vata = excluded.vata, pitta = excluded.pitta, kapha = excluded.kapha, agni = excluded.agni, answers = excluded.answers, taken_at = excluded.taken_at`,
      )
      .bind(userId, v.vata, v.pitta, v.kapha, v.agni, JSON.stringify(answers), now)
      .run();
    return { ...v, takenAt: now };
  }
  async deletePrakriti(userId: string) {
    await this.db.prepare('DELETE FROM prakriti WHERE user_id = ?').bind(userId).run();
  }
}
