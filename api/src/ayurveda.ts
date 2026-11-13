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
  description: string;
  caution: boolean;
  link: string;
};

export type HerbFilter = { dosha?: Dosha; effect: 'pacify' | 'aggravate'; virya?: 'Ushna' | 'Sheeta' };

export type Prakriti = { vata: number; pitta: number; kapha: number; takenAt: number };

export class PrakritiError extends Error {}

export interface Ayurveda {
  herb(key: string): Promise<Herb | null>;
  herbs(keys: string[]): Promise<Herb[]>;
  /** Herbs matching a filter, and how many match in all. */
  findHerbs(filter: HerbFilter, limit: number): Promise<{ herbs: Herb[]; total: number }>;
  prakriti(userId: string): Promise<Prakriti | null>;
}

/** How many questions the prakriti quiz has (the questions themselves live in the app). */
export const PRAKRITI_QUESTIONS = 12;

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

const cap = (d: string) => d[0].toUpperCase() + d.slice(1);
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
  description: string;
  caution: number;
  link: string;
};
const HERB_COLS = 'key, name, english, botanical, rasa, guna, virya, vipaka, pacify, aggravate, parts, description, caution, link';
const toHerb = (r: HerbRow): Herb => ({
  ...r,
  rasa: JSON.parse(r.rasa),
  guna: JSON.parse(r.guna),
  pacify: JSON.parse(r.pacify),
  aggravate: JSON.parse(r.aggravate),
  parts: JSON.parse(r.parts),
  caution: r.caution === 1,
});

export class D1Ayurveda implements Ayurveda {
  private readonly db: D1Database;
  constructor(db: D1Database) {
    this.db = db;
  }
  async herb(key: string) {
    const r = await this.db.prepare(`SELECT ${HERB_COLS} FROM herbs WHERE key = ?`).bind(key).first<HerbRow>();
    return r ? toHerb(r) : null;
  }
  async herbs(keys: string[]) {
    if (!keys.length) return [];
    const { results } = await this.db.prepare(`SELECT ${HERB_COLS} FROM herbs WHERE key IN (${keys.map(() => '?').join(',')})`).bind(...keys).all<HerbRow>();
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
    // Poisonous plants are never suggested in a list.
    where.push('caution = 0');
    const clause = where.join(' AND ');
    const suits = filter.dosha && filter.effect === 'pacify' ? SUITS[filter.dosha] : '';
    const [{ results }, total] = await Promise.all([
      this.db
        .prepare(`SELECT ${HERB_COLS} FROM herbs WHERE ${clause} ORDER BY (virya = ?) DESC, json_array_length(pacify) ASC, name LIMIT ?`)
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
  async deletePrakriti(userId: string) {
    await this.db.prepare('DELETE FROM prakriti WHERE user_id = ?').bind(userId).run();
  }
}
