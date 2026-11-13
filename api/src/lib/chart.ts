/**
 * A sidereal (Vedic) birth chart, calculated, not guessed: planet positions come from
 * astronomy-engine, converted to the sidereal zodiac with the Lahiri ayanamsa.
 *
 * - Grahas: Sun to Saturn from the ephemeris (true ecliptic of date); Rahu is the mean lunar
 *   node and Ketu is opposite it.
 * - Lagna (ascendant): the ecliptic point rising on the eastern horizon at the birth place.
 * - Houses: whole-sign, counted from the lagna's rashi, as is usual in Jyotish.
 * Without a birth time there is no lagna and no houses; rashis and the Moon's nakshatra still hold
 * for the day (the Moon moves about 13° a day, so its nakshatra can change during it).
 */
import { Body, e_tilt, Ecliptic, EclipticGeoMoon, GeoVector, MakeTime, SiderealTime } from 'astronomy-engine';

import { GRAHAS, NAKSHATRAS, RASHIS } from './catalog.ts';

export type BirthDetails = {
  /** Local civil date and time at the birth place. */
  date: string; // YYYY-MM-DD
  time: string | null; // HH:MM (24 h), null when unknown
  /** Minutes east of UTC in force at the birth place, e.g. 330 for India. */
  tzOffsetMin: number;
  lat: number;
  lon: number;
};

export type Placement = { graha: string; rashi: string; degree: number; house: number | null; retrograde: boolean };
export type Chart = {
  lagna: { rashi: string; degree: number } | null;
  grahas: Placement[];
  moonNakshatra: { key: string; pada: number };
  ayanamsa: number;
};

const BODIES: Record<string, Body> = {
  sun: Body.Sun,
  mercury: Body.Mercury,
  venus: Body.Venus,
  mars: Body.Mars,
  jupiter: Body.Jupiter,
  saturn: Body.Saturn,
};

const DEG = Math.PI / 180;
const norm = (x: number) => ((x % 360) + 360) % 360;

/** Lahiri (Chitrapaksha) ayanamsa: 23°51′11″ at J2000, growing with general precession (50.29″ a year). */
export function lahiri(daysSinceJ2000: number): number {
  return 23.85305 + (daysSinceJ2000 / 365.25) * (50.2888 / 3600);
}

/** UTC instant of a local civil date and time. Throws on an impossible date or time. */
export function birthInstant(d: Pick<BirthDetails, 'date' | 'time' | 'tzOffsetMin'>): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d.date);
  const t = d.time === null ? ['12', '00'] : /^(\d{2}):(\d{2})$/.exec(d.time)?.slice(1);
  if (!m || !t) throw new RangeError('Invalid birth date or time');
  const [y, mo, day, h, mi] = [+m[1], +m[2], +m[3], +t[0], +t[1]];
  const local = Date.UTC(y, mo - 1, day, h, mi);
  const check = new Date(local);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== day || h > 23 || mi > 59) {
    throw new RangeError('Invalid birth date or time');
  }
  return new Date(local - d.tzOffsetMin * 60_000);
}

/** Tropical longitude of a graha (true ecliptic of date), in degrees. */
function tropical(graha: string, date: Date): number {
  if (graha === 'moon') return EclipticGeoMoon(date).lon;
  if (graha === 'rahu' || graha === 'ketu') {
    // Mean lunar node (Meeus, Astronomical Algorithms, 47.7).
    const T = MakeTime(date).tt / 36525;
    const node = norm(125.0445479 - 1934.1362891 * T + 0.0020754 * T * T + (T * T * T) / 467441 - (T * T * T * T) / 60616000);
    return graha === 'rahu' ? node : norm(node + 180);
  }
  return Ecliptic(GeoVector(BODIES[graha], date, true)).elon;
}

/** Tropical ascendant: the ecliptic longitude rising in the east, for latitude/longitude in degrees. */
export function ascendant(date: Date, lat: number, lon: number): number {
  const eps = e_tilt(MakeTime(date)).tobl * DEG;
  const ramc = norm(SiderealTime(date) * 15 + lon) * DEG;
  const asc = Math.atan2(Math.cos(ramc), -(Math.sin(ramc) * Math.cos(eps) + Math.tan(lat * DEG) * Math.sin(eps)));
  return norm(asc / DEG);
}

const rashiOf = (lon: number) => Math.floor(norm(lon) / 30);

export function calculateChart(d: BirthDetails): Chart {
  if (Math.abs(d.lat) > 66) throw new RangeError('Charts for births within the polar circles are not supported');
  const date = birthInstant(d);
  const ayanamsa = lahiri(MakeTime(date).tt);
  const sidereal = (graha: string, at: Date) => norm(tropical(graha, at) - ayanamsa);
  const lagnaLon = d.time === null ? null : norm(ascendant(date, d.lat, d.lon) - ayanamsa);
  const lagnaIdx = lagnaLon === null ? null : rashiOf(lagnaLon);
  const day = 86_400_000;

  const grahas = GRAHAS.map((g): Placement => {
    const lon = sidereal(g.key, date);
    let retrograde = g.key === 'rahu' || g.key === 'ketu';
    if (g.key in BODIES && g.key !== 'sun') {
      const delta = norm(sidereal(g.key, new Date(+date + day)) - sidereal(g.key, new Date(+date - day)) + 180) - 180;
      retrograde = delta < 0;
    }
    const idx = rashiOf(lon);
    return {
      graha: g.key,
      rashi: RASHIS[idx].key,
      degree: Math.round((lon % 30) * 100) / 100,
      house: lagnaIdx === null ? null : ((idx - lagnaIdx + 12) % 12) + 1,
      retrograde,
    };
  });

  const moon = sidereal('moon', date);
  const span = 360 / 27;
  return {
    lagna: lagnaLon === null ? null : { rashi: RASHIS[lagnaIdx!].key, degree: Math.round((lagnaLon % 30) * 100) / 100 },
    grahas,
    moonNakshatra: { key: NAKSHATRAS[Math.floor(moon / span)].key, pada: Math.floor((moon % span) / (span / 4)) + 1 },
    ayanamsa: Math.round(ayanamsa * 1000) / 1000,
  };
}

/** One line per fact, for the model and for the chart card. */
export function describeChart(c: Chart): string {
  const rashi = (k: string) => {
    const r = RASHIS.find((x) => x.key === k)!;
    return `${r.name} (${r.english})`;
  };
  const graha = (k: string) => {
    const g = GRAHAS.find((x) => x.key === k)!;
    return `${g.name} (${g.english})`;
  };
  const lines = [c.lagna ? `Lagna (ascendant): ${rashi(c.lagna.rashi)} ${c.lagna.degree.toFixed(1)}°` : 'Lagna: unknown (no birth time), so houses are not available'];
  for (const p of c.grahas) {
    lines.push(`${graha(p.graha)}: ${rashi(p.rashi)} ${p.degree.toFixed(1)}°${p.house ? `, house ${p.house}` : ''}${p.retrograde && p.graha !== 'rahu' && p.graha !== 'ketu' ? ', retrograde' : ''}`);
  }
  const nak = NAKSHATRAS.find((n) => n.key === c.moonNakshatra.key)!;
  lines.push(`Moon nakshatra: ${nak.name}, pada ${c.moonNakshatra.pada}`);
  return lines.join('\n');
}
