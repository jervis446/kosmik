/**
 * Free calculators: no AI, no question counted. Each works for the signed-in person's saved
 * details ("me") or for birth details typed in for someone else, which are used once and not stored.
 */
import { MakeTime } from 'astronomy-engine';

import { NAKSHATRAS, RASHIS } from './lib/catalog.ts';
import { type BirthDetails, calculateChart, type Chart, lahiri, tropical } from './lib/chart.ts';
import { fmtDate, vimshottari } from './lib/jyotish.ts';
import { gunaMilan, manglik } from './lib/milan.ts';
import { zodiac } from './lib/tropical.ts';
import { chartBlock } from './pipeline.ts';
import { ProfileError, type Profile, toBirth } from './profiles.ts';
import type { Block } from './types.ts';

export const CALCULATORS = ['kundli', 'milan', 'manglik', 'sadesati', 'dasha', 'nakshatra', 'zodiac'] as const;
export type Calculator = (typeof CALCULATORS)[number];

const GANA = 'DMRMDMDDRRMMDRDRDRRMMDRRMMD';
const NADI = 'AMNNMAAMNNMAAMNNMAAMNNMAAMN';
const YONI = ['Horse', 'Elephant', 'Sheep', 'Serpent', 'Serpent', 'Dog', 'Cat', 'Sheep', 'Cat', 'Rat', 'Rat', 'Cow', 'Buffalo', 'Tiger', 'Buffalo', 'Tiger', 'Deer', 'Deer', 'Dog', 'Monkey', 'Mongoose', 'Monkey', 'Lion', 'Horse', 'Lion', 'Cow', 'Elephant'];
const LORDS = ['Ketu', 'Venus', 'Sun', 'Moon', 'Mars', 'Rahu', 'Jupiter', 'Saturn', 'Mercury'];
const rashiName = (i: number) => `${RASHIS[i].name} (${RASHIS[i].english})`;
const idx = (key: string) => RASHIS.findIndex((r) => r.key === key);
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/** Birth details typed into a calculator (not stored). */
export function parseBirth(b: unknown): BirthDetails & { name: string | null } {
  const o = (b ?? {}) as Record<string, unknown>;
  const date = typeof o.birthDate === 'string' ? o.birthDate : '';
  const time = o.birthTime === null || o.birthTime === undefined || o.birthTime === '' ? null : String(o.birthTime);
  const lat = Number(o.lat), lon = Number(o.lon), tz = Number(o.tzOffsetMin ?? 330);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ProfileError('Enter the date of birth.');
  if (time !== null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new ProfileError('Enter the birth time as HH:MM (24-hour), or leave it empty if unknown.');
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new ProfileError('Choose the place of birth from the search results.');
  if (!Number.isInteger(tz) || tz < -720 || tz > 840) throw new ProfileError('Choose the time zone at the place of birth.');
  const name = typeof o.name === 'string' && o.name.trim() ? o.name.trim().slice(0, 60) : null;
  return { date, time, lat, lon, tzOffsetMin: tz, name };
}

const facts = (title: string, rows: [string, string][], note?: string): Block => ({ type: 'facts', title, rows, ...(note ? { note } : {}) });

const moonOf = (c: Chart) => c.grahas.find((p) => p.graha === 'moon')!;

function nakshatraFacts(c: Chart, who: string): Block {
  const m = moonOf(c);
  const n = Math.floor(m.lon / (360 / 27));
  return facts(`${who}: Moon nakshatra`, [
    ['Nakshatra', `${NAKSHATRAS[n].name}, pada ${c.moonNakshatra.pada}`],
    ['Nakshatra lord', LORDS[n % 9]],
    ['Moon sign (rashi)', rashiName(idx(m.rashi))],
    ['Gana', { D: 'Deva', M: 'Manushya', R: 'Rakshasa' }[GANA[n]]!],
    ['Nadi', { A: 'Adi', M: 'Madhya', N: 'Antya' }[NADI[n]]!],
    ['Yoni', YONI[n]],
  ]);
}

function manglikFacts(c: Chart, who: string): Block {
  const at = (g: string) => idx(c.grahas.find((p) => p.graha === g)!.rashi);
  const m = manglik(at('mars'), c.lagna ? idx(c.lagna.rashi) : null, at('moon'));
  const mars = c.grahas.find((p) => p.graha === 'mars')!;
  return facts(
    `${who}: Manglik check`,
    [
      ['Result', m.text],
      ['Mars', `${rashiName(at('mars'))}${mars.house ? `, ${mars.house}th house from the lagna` : ''}`],
      ['From the lagna', m.fromLagna === null ? 'Unknown (no birth time)' : m.fromLagna ? 'Yes' : 'No'],
      ['From the Moon', m.fromMoon ? 'Yes' : 'No'],
    ],
    'Mars in the 1st, 2nd, 4th, 7th, 8th or 12th house. Classical texts list many exceptions (cancellations); a full reading checks them.',
  );
}

const siderealSaturnSign = (d: Date) => Math.floor((((tropical('saturn', d) - lahiri(MakeTime(d).tt)) % 360) + 360) % 360 / 30);

/** Sade Sati windows (Saturn in the 12th, 1st and 2nd from the Moon) from 8 years ago to 30 years ahead. */
function sadeSati(c: Chart, now: Date): Block {
  const moon = idx(moonOf(c).rashi);
  const inSade = (d: Date) => [11, 0, 1].includes((siderealSaturnSign(d) - moon + 12) % 12);
  const step = 15 * 86_400_000;
  const windows: { start: Date; end: Date }[] = [];
  let open: Date | null = null;
  let last = +now - 8 * 365.25 * 86_400_000;
  for (let t = last; t < +now + 30 * 365.25 * 86_400_000; t += step) {
    const d = new Date(t);
    const on = inSade(d);
    if (on && !open) open = d;
    if (!on && open) {
      // Brief retrograde dips back out of the window don't end it.
      if (windows.length && +open - +windows[windows.length - 1].end < 400 * 86_400_000) windows[windows.length - 1].end = d;
      else windows.push({ start: open, end: d });
      open = null;
    }
    last = t;
  }
  if (open) windows.push({ start: open, end: new Date(last) });
  const merged = windows.reduce<{ start: Date; end: Date }[]>((acc, w) => {
    const prev = acc[acc.length - 1];
    if (prev && +w.start - +prev.end < 400 * 86_400_000) prev.end = w.end;
    else acc.push({ ...w });
    return acc;
  }, []);
  const rows: [string, string][] = merged.slice(0, 3).map((w) => {
    const state = +w.start <= +now && +now < +w.end ? 'Running now' : +w.end <= +now ? 'Past' : 'Next';
    return [state, `${fmtDate(w.start)} to ${fmtDate(w.end)}`];
  });
  return facts(`Sade Sati for Moon in ${rashiName(moon)}`, rows.length ? rows : [['Sade Sati', 'None in this range']], 'Saturn’s 7½-year transit over the 12th, 1st and 2nd signs from the natal Moon. Dates are to within about two weeks.');
}

function dashaTimeline(c: Chart, now: Date): Block {
  const d = vimshottari(moonOf(c).lon, c.born, now);
  const rows: [string, string][] = d.maha.slice(0, 9).map((p) => [`${cap(p.lord)} mahadasha${d.current?.maha.lord === p.lord && +p.start === +d.current.maha.start ? ' (now)' : ''}`, `${fmtDate(p.start)} to ${fmtDate(p.end)}`]);
  if (d.current) rows.push(['Antardasha now', `${cap(d.current.maha.lord)}–${cap(d.current.antar.lord)} until ${fmtDate(d.current.antar.end)}`], ['Pratyantardasha now', `${cap(d.current.pratyantar.lord)} until ${fmtDate(d.current.pratyantar.end)}`]);
  return facts('Vimshottari dasha timeline', rows, 'From the Moon’s nakshatra at birth; 120-year cycle.');
}

export function runCalculator(kind: Calculator, a: BirthDetails & { name?: string | null }, b: (BirthDetails & { name?: string | null }) | null, now: Date): Block[] {
  const ca = calculateChart(a);
  const who = a.name ?? 'You';
  switch (kind) {
    case 'kundli':
      return [chartBlock(ca, now), nakshatraFacts(ca, who)];
    case 'nakshatra':
      return [nakshatraFacts(ca, who)];
    case 'manglik':
      return [manglikFacts(ca, who)];
    case 'sadesati':
      return [sadeSati(ca, now)];
    case 'dasha':
      return [dashaTimeline(ca, now)];
    case 'zodiac': {
      const z = zodiac(ca, now);
      return [{ type: 'zodiac', sun: z.sun, moon: z.moon, rising: z.rising, planets: z.planets.map(({ graha, sign, glyph, degree }) => ({ graha, sign, glyph, degree })), siderealSun: z.siderealSun, cusp: z.cusp, solarReturn: z.solarReturn }];
    }
    case 'milan': {
      if (!b) throw new ProfileError('Add the second person’s birth details.');
      const cb = calculateChart(b);
      const m = gunaMilan(moonOf(ca).lon, moonOf(cb).lon);
      return [
        { type: 'milan', boy: a.name ?? 'Groom', girl: b.name ?? 'Bride', total: m.total, verdict: m.verdict, kootas: m.kootas, simplified: m.simplified },
        manglikFacts(ca, a.name ?? 'Groom'),
        manglikFacts(cb, b.name ?? 'Bride'),
      ];
    }
  }
}

export const meBirth = (p: Profile) => ({ ...toBirth(p), name: p.name });
