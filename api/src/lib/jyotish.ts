/**
 * Jyotish beyond positions: Vimshottari dashas, current and coming transits (gochar), house
 * lords, aspects (drishti), dignities, navamsa (D9) and the best-known yogas. All calculated from
 * the chart, so the model is given facts about this person rather than generic meanings.
 */
import { MakeTime } from 'astronomy-engine';

import { GRAHAS, NAKSHATRAS, ordinal, RASHIS } from './catalog.ts';
import { type Chart, lahiri, tropical } from './chart.ts';

const DAY = 86_400_000;
const YEAR = 365.25 * DAY;
const norm = (x: number) => ((x % 360) + 360) % 360;
const rashiIdx = (key: string) => RASHIS.findIndex((r) => r.key === key);
const gName = (k: string) => (k === 'rahu' || k === 'ketu' ? GRAHAS.find((g) => g.key === k)!.name : GRAHAS.find((g) => g.key === k)!.english);
const rName = (i: number) => `${RASHIS[i].name} (${RASHIS[i].english})`;

/** "12 March 2027" */
export const fmtDate = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });

const MONTHS_HI = ['जनवरी', 'फ़रवरी', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर'];
/** "12 मार्च 2027", in India time. */
export const fmtDateHi = (d: Date) => {
  const ist = new Date(+d + 330 * 60_000);
  return `${ist.getUTCDate()} ${MONTHS_HI[ist.getUTCMonth()]} ${ist.getUTCFullYear()}`;
};
/** The Devanagari name of a graha, rashi or nakshatra: the first alias written in Devanagari. */
export const devanagari = (x: { name: string; aliases: string[] }) => x.aliases.find((a) => /[ऀ-ॿ]/.test(a)) ?? x.name;

// ---------------------------------------------------------------- Vimshottari dasha

export const DASHA_ORDER: [string, number][] = [
  ['ketu', 7], ['venus', 20], ['sun', 6], ['moon', 10], ['mars', 7], ['rahu', 18], ['jupiter', 16], ['saturn', 19], ['mercury', 17],
];

export type Period = { lord: string; start: Date; end: Date };
export type Dashas = {
  maha: Period[];
  /** The periods running on the given day: mahadasha, antardasha, pratyantardasha. */
  current: { maha: Period; antar: Period; pratyantar: Period } | null;
  /** The next few antardashas after the current one. */
  nextAntar: Period[];
};

function subPeriods(parent: Period): Period[] {
  const start = DASHA_ORDER.findIndex(([l]) => l === parent.lord);
  const span = +parent.end - +parent.start;
  const out: Period[] = [];
  let t = +parent.start;
  for (let i = 0; i < 9; i++) {
    const [lord, years] = DASHA_ORDER[(start + i) % 9];
    const len = (span * years) / 120;
    out.push({ lord, start: new Date(t), end: new Date(t + len) });
    t += len;
  }
  return out;
}

/** Vimshottari dashas from the Moon's sidereal longitude at birth. */
export function vimshottari(moonLon: number, born: Date, now: Date): Dashas {
  const span = 360 / 27;
  const nak = Math.floor(moonLon / span);
  const elapsed = (moonLon % span) / span;
  const first = nak % 9;
  const maha: Period[] = [];
  let t = +born - elapsed * DASHA_ORDER[first][1] * YEAR;
  for (let i = 0; i < 10; i++) {
    const [lord, years] = DASHA_ORDER[(first + i) % 9];
    maha.push({ lord, start: new Date(t), end: new Date(t + years * YEAR) });
    t += years * YEAR;
  }
  const at = (list: Period[]) => list.find((p) => +p.start <= +now && +now < +p.end);
  const m = at(maha);
  if (!m) return { maha, current: null, nextAntar: [] };
  const antars = subPeriods(m);
  const a = at(antars)!;
  const p = at(subPeriods(a))!;
  // The next antardashas, running on into the next mahadasha if needed.
  const following = [...antars.slice(antars.indexOf(a) + 1), ...subPeriods(maha[maha.indexOf(m) + 1] ?? m)].slice(0, 4);
  return { maha, current: { maha: m, antar: a, pratyantar: p }, nextAntar: following };
}

// ---------------------------------------------------------------- dignity, lords, aspects

const EXALTED: Record<string, string> = { sun: 'mesh', moon: 'vrishabh', mars: 'makar', mercury: 'kanya', jupiter: 'kark', venus: 'meen', saturn: 'tula', rahu: 'vrishabh', ketu: 'vrishchik' };
const OWN: Record<string, string[]> = {
  sun: ['simha'], moon: ['kark'], mars: ['mesh', 'vrishchik'], mercury: ['mithun', 'kanya'], jupiter: ['dhanu', 'meen'], venus: ['vrishabh', 'tula'], saturn: ['makar', 'kumbh'], rahu: [], ketu: [],
};
const FRIENDS: Record<string, string[]> = {
  sun: ['moon', 'mars', 'jupiter'], moon: ['sun', 'mercury'], mars: ['sun', 'moon', 'jupiter'], mercury: ['sun', 'venus'],
  jupiter: ['sun', 'moon', 'mars'], venus: ['mercury', 'saturn'], saturn: ['mercury', 'venus'], rahu: ['venus', 'saturn', 'mercury'], ketu: ['mars', 'venus', 'saturn'],
};
const ENEMIES: Record<string, string[]> = {
  sun: ['venus', 'saturn'], moon: [], mars: ['mercury'], mercury: ['moon'], jupiter: ['mercury', 'venus'], venus: ['sun', 'moon'], saturn: ['sun', 'moon', 'mars'], rahu: ['sun', 'moon'], ketu: ['sun', 'moon'],
};

export function dignity(graha: string, rashi: string): string {
  if (EXALTED[graha] === rashi) return 'exalted';
  if (EXALTED[graha] && RASHIS[(rashiIdx(EXALTED[graha]) + 6) % 12].key === rashi) return 'debilitated';
  if (OWN[graha].includes(rashi)) return 'own sign';
  const lord = RASHIS[rashiIdx(rashi)].ruler;
  if (FRIENDS[graha].includes(lord)) return "friend's sign";
  if (ENEMIES[graha].includes(lord)) return "enemy's sign";
  return 'neutral sign';
}

/** Houses a graha aspects, counted from its own house (every graha aspects the 7th). */
const ASPECTS: Record<string, number[]> = { mars: [4, 7, 8], jupiter: [5, 7, 9], saturn: [3, 7, 10], rahu: [5, 7, 9], ketu: [5, 7, 9] };
const aspectsOf = (g: string) => ASPECTS[g] ?? [7];
const countFrom = (from: number, n: number) => ((from - 1 + n - 1) % 12) + 1;

/** Navamsa (D9) rashi index for a sidereal longitude. */
export const navamsa = (lon: number) => Math.floor(norm(lon) / (30 / 9)) % 12;

/**
 * Divisional charts (vargas), by Parashara's rules: the rashi a longitude falls in for the D-n chart.
 * D2 hora (wealth), D3 drekkana (siblings), D4 chaturthamsa (property), D7 saptamsa (children),
 * D9 navamsa (marriage), D10 dashamsa (career), D12 dwadashamsa (parents), D16 shodashamsa
 * (vehicles, comforts), D20 vimshamsa (spiritual life), D24 chaturvimshamsa (education).
 */
export type Varga = 2 | 3 | 4 | 7 | 9 | 10 | 12 | 16 | 20 | 24;
export const VARGA_NAME: Record<Varga, string> = {
  2: 'Hora (D2): wealth', 3: 'Drekkana (D3): siblings and courage', 4: 'Chaturthamsa (D4): home and property',
  7: 'Saptamsa (D7): children', 9: 'Navamsa (D9): marriage and inner strength', 10: 'Dashamsa (D10): career and status',
  12: 'Dwadashamsa (D12): parents', 16: 'Shodashamsa (D16): comforts and vehicles', 20: 'Vimshamsa (D20): spiritual life',
  24: 'Chaturvimshamsa (D24): learning and education',
};
export function varga(lon: number, n: Varga): number {
  const l = norm(lon);
  const sign = Math.floor(l / 30);
  const part = Math.floor((l % 30) / (30 / n));
  const odd = sign % 2 === 0; // Mesha (index 0) is an odd sign
  const movable = sign % 3 === 0, fixed = sign % 3 === 1;
  switch (n) {
    case 2: return odd ? (part === 0 ? 4 : 3) : part === 0 ? 3 : 4; // Leo (Sun) and Cancer (Moon)
    case 3: return (sign + 4 * part) % 12;
    case 4: return (sign + 3 * part) % 12;
    case 7: return ((odd ? sign : sign + 6) + part) % 12;
    case 9: return navamsa(l);
    case 10: return ((odd ? sign : sign + 8) + part) % 12;
    case 12: return (sign + part) % 12;
    case 16: return ((movable ? 0 : fixed ? 4 : 8) + part) % 12;
    case 20: return ((movable ? 0 : fixed ? 8 : 4) + part) % 12;
    case 24: return ((odd ? 4 : 3) + part) % 12;
  }
}

/** One divisional chart as lines for the model: its lagna and where each graha falls. */
export function describeVarga(chart: Chart, n: Varga): string {
  const lagnaLon = chart.lagna ? rashiIdx(chart.lagna.rashi) * 30 + chart.lagna.degree : null;
  const lagna = lagnaLon === null ? null : varga(lagnaLon, n);
  const where = chart.grahas.map((p) => {
    const r = varga(p.lon, n);
    return `${gName(p.graha)} in ${RASHIS[r].name}${lagna === null ? '' : ` (house ${((r - lagna + 12) % 12) + 1})`}`;
  });
  return `${VARGA_NAME[n]}: ${lagna === null ? 'lagna unknown (no birth time); ' : `lagna ${RASHIS[lagna].name}; `}${where.join('; ')}`;
}

const KENDRA = [1, 4, 7, 10];
const TRIKONA = [1, 5, 9];

export function yogas(chart: Chart): string[] {
  const at = (g: string) => chart.grahas.find((p) => p.graha === g)!;
  const idx = (g: string) => rashiIdx(at(g).rashi);
  const fromMoon = (g: string) => ((idx(g) - idx('moon') + 12) % 12) + 1;
  const found: string[] = [];
  if (KENDRA.includes(fromMoon('jupiter'))) found.push('Gajakesari yoga: Jupiter in a kendra from the Moon (wisdom, respect, support from others).');
  if (idx('sun') === idx('mercury')) found.push('Budhaditya yoga: Sun with Mercury (intelligence, communication, recognition for skill).');
  if (idx('moon') === idx('mars')) found.push('Chandra-Mangal yoga: Moon with Mars (drive to earn, enterprising mind).');
  const neighbours = chart.grahas.filter((p) => !['sun', 'moon', 'rahu', 'ketu'].includes(p.graha) && [2, 12].includes(fromMoon(p.graha)));
  const withMoon = chart.grahas.filter((p) => !['sun', 'moon', 'rahu', 'ketu'].includes(p.graha) && fromMoon(p.graha) === 1);
  if (!neighbours.length && !withMoon.length) found.push('Kemadruma yoga: no planets beside the Moon (times of feeling alone; eased by Moon in a kendra or aspected).');
  if (chart.lagna) {
    const MAHAPURUSHA: Record<string, string> = { mars: 'Ruchaka', mercury: 'Bhadra', jupiter: 'Hamsa', venus: 'Malavya', saturn: 'Sasa' };
    for (const [g, name] of Object.entries(MAHAPURUSHA)) {
      const p = at(g);
      if (p.house && KENDRA.includes(p.house) && ['exalted', 'own sign'].includes(dignity(g, p.rashi))) found.push(`${name} yoga (Pancha Mahapurusha): ${gName(g)} ${dignity(g, p.rashi)} in the ${ordinal(p.house)} house.`);
    }
    const mars = at('mars').house!;
    if ([1, 2, 4, 7, 8, 12].includes(mars)) found.push(`Mangal dosha (manglik): Mars in the ${ordinal(mars)} house from the lagna.`);
    // Raj yoga: a kendra lord together with a trikona lord (other than the lagna lord alone).
    const lordOf = (h: number) => RASHIS[(rashiIdx(chart.lagna!.rashi) + h - 1) % 12].ruler;
    const pairs = new Set<string>();
    for (const k of [4, 7, 10]) for (const t of [5, 9]) {
      const a = lordOf(k), b = lordOf(t);
      if (a !== b && idx(a) === idx(b)) pairs.add(`${gName(a)} (lord of ${ordinal(k)}) with ${gName(b)} (lord of ${ordinal(t)})`);
      if (a === b) pairs.add(`${gName(a)} rules both the ${ordinal(k)} and ${ordinal(t)} (yogakaraka)`);
    }
    for (const p of pairs) found.push(`Raj yoga: ${p}.`);
  }
  return found;
}

// ---------------------------------------------------------------- transits

const siderealAt = (graha: string, d: Date) => norm(tropical(graha, d) - lahiri(MakeTime(d).tt));
const signAt = (graha: string, d: Date) => Math.floor(siderealAt(graha, d) / 30);

/** The next times (within `days`) a slow graha moves into another rashi, to the nearest day. */
function ingresses(graha: string, from: Date, days: number, step: number): { date: Date; to: number }[] {
  const out: { date: Date; to: number }[] = [];
  let prevT = +from;
  let prev = signAt(graha, from);
  for (let t = +from + step * DAY; t <= +from + days * DAY; t += step * DAY) {
    const cur = signAt(graha, new Date(t));
    if (cur !== prev) {
      let lo = prevT, hi = t;
      while (hi - lo > 2 * DAY) {
        const mid = (lo + hi) / 2;
        if (signAt(graha, new Date(mid)) === prev) lo = mid;
        else hi = mid;
      }
      out.push({ date: new Date(hi), to: cur });
      prev = cur;
    }
    prevT = t;
  }
  return out;
}

export type Transits = { lines: string[]; sadeSati: string | null };

export function transits(chart: Chart, now: Date): Transits {
  const moon = rashiIdx(chart.grahas.find((p) => p.graha === 'moon')!.rashi);
  const lagna = chart.lagna ? rashiIdx(chart.lagna.rashi) : null;
  const house = (sign: number, from: number) => ((sign - from + 12) % 12) + 1;
  const where = (sign: number) => `${rName(sign)}: ${ordinal(house(sign, moon))} from your Moon${lagna !== null ? `, ${ordinal(house(sign, lagna))} house from your lagna` : ''}`;
  const lines: string[] = [];
  for (const g of ['saturn', 'jupiter', 'rahu', 'ketu']) {
    const sign = signAt(g, now);
    const next = ingresses(g, now, g === 'jupiter' ? 800 : g === 'saturn' ? 1100 : 600, g === 'jupiter' ? 12 : 20)
      .slice(0, 3)
      .map((x) => `${rName(x.to)} on ${fmtDate(x.date)}`)
      .join('; ');
    lines.push(`${gName(g)} now in ${where(sign)}${next ? `. Moves: ${next}` : ''}.`);
  }
  const saturn = signAt('saturn', now);
  const fromMoon = house(saturn, moon);
  let sadeSati: string | null = null;
  if ([12, 1, 2].includes(fromMoon)) {
    const phase = fromMoon === 12 ? 'first (rising) phase' : fromMoon === 1 ? 'second (peak) phase' : 'third (setting) phase';
    // Sade Sati ends when Saturn leaves the 2nd from the Moon for good.
    const exits = ingresses('saturn', now, 2800, 30).filter((x) => house(x.to, moon) === 3);
    sadeSati = `Sade Sati is running, in its ${phase}${exits.length ? `; it ends around ${fmtDate(exits[exits.length - 1].date)}` : ''}.`;
  } else if (fromMoon === 8) sadeSati = 'Ashtama Shani: Saturn is transiting the 8th from the Moon.';
  else if (fromMoon === 4) sadeSati = 'Kantaka Shani: Saturn is transiting the 4th from the Moon.';
  else {
    const start = ingresses('saturn', now, 3300, 30).find((x) => house(x.to, moon) === 12);
    if (start) sadeSati = `No Sade Sati now; the next one begins around ${fmtDate(start.date)}.`;
  }
  return { lines, sadeSati };
}

// ---------------------------------------------------------------- the full reading

/** Everything calculated about the chart, as labelled lines for the model. */
export function deepChart(chart: Chart, now: Date, name?: string | null): string {
  const moonP = chart.grahas.find((p) => p.graha === 'moon')!;
  const lines: string[] = [];
  if (name) lines.push(`Name: ${name}`);
  lines.push(`Today: ${fmtDate(now)}`);
  lines.push(`Born: ${fmtDate(chart.born)}`);
  const lagna = chart.lagna ? rashiIdx(chart.lagna.rashi) : null;
  lines.push(lagna !== null ? `Lagna (ascendant): ${rName(lagna)} ${chart.lagna!.degree.toFixed(1)}°, lagna lord ${gName(RASHIS[lagna].ruler)}` : 'Lagna: unknown (no birth time): houses, lords and house-based yogas are not available; use the Moon chart (houses from the Moon) instead.');

  lines.push('', 'PLANETS (rashi, degree, house, dignity, navamsa):');
  for (const p of chart.grahas) {
    const nak = NAKSHATRAS[Math.floor(p.lon / (360 / 27))].name;
    const owns = lagna === null ? [] : [...Array(12).keys()].map((h) => h + 1).filter((h) => RASHIS[(lagna + h - 1) % 12].ruler === p.graha);
    lines.push(
      `${gName(p.graha)}: ${rName(rashiIdx(p.rashi))} ${p.degree.toFixed(1)}°, ${nak} nakshatra${p.house ? `, ${ordinal(p.house)} house` : ''}, ${dignity(p.graha, p.rashi)}${p.retrograde && !['rahu', 'ketu'].includes(p.graha) ? ', retrograde' : ''}${owns.length ? `, lord of ${owns.map(ordinal).join(' and ')}` : ''}; navamsa ${RASHIS[navamsa(p.lon)].english}`,
    );
  }
  lines.push(`Moon nakshatra: ${NAKSHATRAS[Math.floor(moonP.lon / (360 / 27))].name}, pada ${chart.moonNakshatra.pada}`);

  if (lagna !== null) {
    lines.push('', 'HOUSE LORDS (where each house lord sits):');
    for (let h = 1; h <= 12; h++) {
      const lord = RASHIS[(lagna + h - 1) % 12].ruler;
      const p = chart.grahas.find((x) => x.graha === lord)!;
      const occupants = chart.grahas.filter((x) => x.house === h).map((x) => gName(x.graha));
      lines.push(`${ordinal(h)} house (${RASHIS[(lagna + h - 1) % 12].english}): lord ${gName(lord)} in the ${ordinal(p.house!)}${occupants.length ? `; occupied by ${occupants.join(', ')}` : '; empty'}`);
    }
    lines.push('', 'ASPECTS (drishti):');
    for (const p of chart.grahas) {
      const houses = aspectsOf(p.graha).map((n) => countFrom(p.house!, n));
      const on = chart.grahas.filter((q) => q !== p && houses.includes(q.house!)).map((q) => gName(q.graha));
      lines.push(`${gName(p.graha)} aspects houses ${houses.map(ordinal).join(', ')}${on.length ? ` (and ${on.join(', ')})` : ''}`);
    }
  }

  const together = new Map<string, string[]>();
  for (const p of chart.grahas) together.set(p.rashi, [...(together.get(p.rashi) ?? []), gName(p.graha)]);
  const conj = [...together.values()].filter((g) => g.length > 1);
  if (conj.length) lines.push('', `CONJUNCTIONS: ${conj.map((g) => g.join(' + ')).join('; ')}`);

  const ys = yogas(chart);
  lines.push('', 'YOGAS:', ...(ys.length ? ys : ['None of the common yogas checked.']));

  const d = vimshottari(moonP.lon, chart.born, now);
  lines.push('', 'VIMSHOTTARI DASHA:');
  if (d.current) {
    const { maha, antar, pratyantar } = d.current;
    lines.push(`Mahadasha now: ${gName(maha.lord)}, ${fmtDate(maha.start)} to ${fmtDate(maha.end)}`);
    lines.push(`Antardasha now: ${gName(maha.lord)}–${gName(antar.lord)}, ${fmtDate(antar.start)} to ${fmtDate(antar.end)}`);
    lines.push(`Pratyantardasha now: ${gName(pratyantar.lord)}, ${fmtDate(pratyantar.start)} to ${fmtDate(pratyantar.end)}`);
    lines.push(`Next antardashas: ${d.nextAntar.map((p) => `${gName(p.lord)} from ${fmtDate(p.start)}`).join('; ')}`);
  }
  const nextMaha = d.maha.filter((p) => +p.start > +now).slice(0, 2);
  if (nextMaha.length) lines.push(`Next mahadashas: ${nextMaha.map((p) => `${gName(p.lord)} from ${fmtDate(p.start)}`).join('; ')}`);

  const t = transits(chart, now);
  lines.push('', 'TRANSITS (gochar) now:', ...t.lines);
  if (t.sadeSati) lines.push(t.sadeSati);
  return lines.join('\n');
}

/** A one-line summary of the running dasha, for the chart card. */
export function dashaLine(chart: Chart, now: Date, lang = 'en'): string | null {
  const moon = chart.grahas.find((p) => p.graha === 'moon')!;
  const c = vimshottari(moon.lon, chart.born, now).current;
  if (!c) return null;
  if (lang === 'hi') {
    const hi = (k: string) => devanagari(GRAHAS.find((g) => g.key === k)!);
    return `${hi(c.maha.lord)}–${hi(c.antar.lord)}, ${fmtDateHi(c.antar.end)} तक`;
  }
  return `${gName(c.maha.lord)}–${gName(c.antar.lord)} until ${fmtDate(c.antar.end)}`;
}
