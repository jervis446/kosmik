/**
 * Kundli Milan: Ashtakoota guna matching (36 points) from the two Moons, the usual North Indian
 * method. Six kootas follow the standard rules; Yoni and Vashya use simplified tables (noted
 * in the result) because their full tables vary between sources.
 */
import { RASHIS } from './catalog.ts';

const NAK = 360 / 27;
const nakOf = (moonLon: number) => Math.floor(moonLon / NAK);
const rashiOf = (moonLon: number) => Math.floor(moonLon / 30);

/** Varna by Moon rashi: 4 Brahmin, 3 Kshatriya, 2 Vaishya, 1 Shudra. */
export const VARNA = [3, 2, 1, 4, 3, 2, 1, 4, 3, 2, 1, 4];
export const VARNA_NAME: Record<number, string> = { 4: 'Brahmin', 3: 'Kshatriya', 2: 'Vaishya', 1: 'Shudra' };

/** Vashya group by Moon rashi (Dhanu and Makar split at 15°). */
type Vashya = 'Chatushpada' | 'Manava' | 'Jalachara' | 'Vanachara' | 'Keeta';
export function vashyaOf(lon: number): Vashya {
  const r = rashiOf(lon);
  const half = lon % 30 < 15;
  if (r === 8) return half ? 'Manava' : 'Chatushpada';
  if (r === 9) return half ? 'Chatushpada' : 'Jalachara';
  return (['Chatushpada', 'Chatushpada', 'Manava', 'Jalachara', 'Vanachara', 'Manava', 'Manava', 'Keeta', 'Manava', 'Chatushpada', 'Manava', 'Jalachara'] as Vashya[])[r];
}
const VASHYA_ORDER: Vashya[] = ['Chatushpada', 'Manava', 'Jalachara', 'Vanachara', 'Keeta'];
/** Groom's group (row) and bride's group (column). */
const VASHYA_TABLE = [
  [2, 1, 1, 0.5, 1],
  [1, 2, 0.5, 0, 1],
  [1, 0.5, 2, 1, 1],
  [0, 0, 0, 2, 0],
  [1, 1, 1, 0, 2],
];

export const YONI = ['Horse', 'Elephant', 'Sheep', 'Serpent', 'Serpent', 'Dog', 'Cat', 'Sheep', 'Cat', 'Rat', 'Rat', 'Cow', 'Buffalo', 'Tiger', 'Buffalo', 'Tiger', 'Deer', 'Deer', 'Dog', 'Monkey', 'Mongoose', 'Monkey', 'Lion', 'Horse', 'Lion', 'Cow', 'Elephant'];
const YONI_ENEMIES = [['Horse', 'Buffalo'], ['Elephant', 'Lion'], ['Sheep', 'Monkey'], ['Serpent', 'Mongoose'], ['Dog', 'Deer'], ['Cat', 'Rat'], ['Cow', 'Tiger']];

/** Gana by nakshatra: D(eva), M(anushya), R(akshasa). */
export const GANA = 'DMRMDMDDRRMMDRDRDRRMMDRRMMD';
export const GANA_NAME: Record<string, string> = { D: 'Deva', M: 'Manushya', R: 'Rakshasa' };
/** Groom's gana (row) and bride's gana (column): D, M, R. */
const GANA_TABLE: Record<string, Record<string, number>> = { D: { D: 6, M: 6, R: 1 }, M: { D: 5, M: 6, R: 0 }, R: { D: 1, M: 0, R: 6 } };

/** Nadi by nakshatra: A(adi), M(adhya), N (antya). */
export const NADI = 'AMNNMAAMNNMAAMNNMAAMNNMAAMN';
const NADI_NAME: Record<string, string> = { A: 'Adi (Vata)', M: 'Madhya (Pitta)', N: 'Antya (Kapha)' };

const LORD = RASHIS.map((r) => r.ruler);
const FRIENDS: Record<string, string[]> = { sun: ['moon', 'mars', 'jupiter'], moon: ['sun', 'mercury'], mars: ['sun', 'moon', 'jupiter'], mercury: ['sun', 'venus'], jupiter: ['sun', 'moon', 'mars'], venus: ['mercury', 'saturn'], saturn: ['mercury', 'venus'] };
const ENEMIES: Record<string, string[]> = { sun: ['venus', 'saturn'], moon: [], mars: ['mercury'], mercury: ['moon'], jupiter: ['mercury', 'venus'], venus: ['sun', 'moon'], saturn: ['sun', 'moon', 'mars'] };
const relation = (a: string, b: string) => (a === b || FRIENDS[a].includes(b) ? 'F' : ENEMIES[a].includes(b) ? 'E' : 'N');

export type Koota = { name: string; got: number; max: number; boy: string; girl: string; note: string };
export type Milan = { total: number; kootas: Koota[]; verdict: string; simplified: string };

/** Matching for a groom and a bride from their sidereal Moon longitudes. */
export function gunaMilan(boyMoon: number, girlMoon: number): Milan {
  const bn = nakOf(boyMoon), gn = nakOf(girlMoon);
  const br = rashiOf(boyMoon), gr = rashiOf(girlMoon);
  const kootas: Koota[] = [];

  kootas.push({ name: 'Varna', max: 1, got: VARNA[br] >= VARNA[gr] ? 1 : 0, boy: VARNA_NAME[VARNA[br]], girl: VARNA_NAME[VARNA[gr]], note: 'Temperament and spiritual compatibility' });

  const bv = vashyaOf(boyMoon), gv = vashyaOf(girlMoon);
  kootas.push({ name: 'Vashya', max: 2, got: VASHYA_TABLE[VASHYA_ORDER.indexOf(bv)][VASHYA_ORDER.indexOf(gv)], boy: bv, girl: gv, note: 'Mutual attraction and influence' });

  // Tara: count from one nakshatra to the other, both ways; 3rd, 5th and 7th taras are unfavourable.
  const tara = (from: number, to: number) => ((((to - from + 27) % 27) + 1 - 1) % 9) + 1;
  const good = (t: number) => ![3, 5, 7].includes(t);
  const t1 = tara(gn, bn), t2 = tara(bn, gn);
  kootas.push({ name: 'Tara', max: 3, got: (good(t1) ? 1.5 : 0) + (good(t2) ? 1.5 : 0), boy: `Tara ${t2}`, girl: `Tara ${t1}`, note: 'Health and well-being of the couple' });

  const by = YONI[bn], gy = YONI[gn];
  const enemy = YONI_ENEMIES.some(([a, b]) => (a === by && b === gy) || (a === gy && b === by));
  kootas.push({ name: 'Yoni', max: 4, got: by === gy ? 4 : enemy ? 0 : 2, boy: by, girl: gy, note: 'Physical and intimate compatibility' });

  const bl = LORD[br], gl = LORD[gr];
  const rel = [relation(bl, gl), relation(gl, bl)].sort().join('');
  const maitri = { FF: 5, FN: 4, NN: 3, EF: 1, EN: 0.5, EE: 0 }[rel] ?? 0;
  kootas.push({ name: 'Graha Maitri', max: 5, got: bl === gl ? 5 : maitri, boy: `${RASHIS[br].name} (lord ${bl})`, girl: `${RASHIS[gr].name} (lord ${gl})`, note: 'Friendship of the Moon-sign lords: mental wavelength' });

  const bg = GANA[bn], gg = GANA[gn];
  kootas.push({ name: 'Gana', max: 6, got: GANA_TABLE[bg][gg], boy: GANA_NAME[bg], girl: GANA_NAME[gg], note: 'Nature and temperament' });

  const dist = ((br - gr + 12) % 12) + 1;
  const pair = [dist, ((gr - br + 12) % 12) + 1].sort((a, b) => a - b).join('/');
  const badBhakoot = ['2/12', '5/9', '6/8'].includes(pair);
  kootas.push({ name: 'Bhakoot', max: 7, got: badBhakoot ? 0 : 7, boy: RASHIS[br].name, girl: RASHIS[gr].name, note: `Moon signs ${pair} apart: family welfare and prosperity` });

  const sameNadi = NADI[bn] === NADI[gn];
  kootas.push({ name: 'Nadi', max: 8, got: sameNadi ? 0 : 8, boy: NADI_NAME[NADI[bn]], girl: NADI_NAME[NADI[gn]], note: 'Health and progeny; same nadi is Nadi dosha' });

  const total = kootas.reduce((n, k) => n + k.got, 0);
  const verdict = total < 18 ? 'Below 18: traditionally not recommended without further analysis' : total < 25 ? '18–24: an average match' : total < 33 ? '25–32: a good match' : '33–36: an excellent match';
  return { total, kootas, verdict, simplified: 'Yoni is scored 4 for the same animal, 0 for sworn enemies and 2 otherwise; Vashya uses a common table. Both vary between sources.' };
}

/** Manglik (Kuja dosha): Mars in the 1st, 2nd, 4th, 7th, 8th or 12th from the lagna or the Moon. */
export function manglik(marsRashi: number, lagnaRashi: number | null, moonRashi: number): { fromLagna: boolean | null; fromMoon: boolean; text: string } {
  const bad = [1, 2, 4, 7, 8, 12];
  const house = (from: number) => ((marsRashi - from + 12) % 12) + 1;
  const fromLagna = lagnaRashi === null ? null : bad.includes(house(lagnaRashi));
  const fromMoon = bad.includes(house(moonRashi));
  const text =
    fromLagna && fromMoon
      ? 'Manglik from both the lagna and the Moon'
      : fromLagna || fromMoon
        ? `Manglik from the ${fromLagna ? 'lagna' : 'Moon'} only (often considered mild)`
        : fromLagna === null
          ? `Not Manglik from the Moon (lagna unknown without a birth time)`
          : 'Not Manglik';
  return { fromLagna, fromMoon, text };
}
