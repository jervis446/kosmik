/**
 * The kundali shown at the top of every chart report: diamond charts (D1 and D9), birth details and
 * panchang, the avkahada chakra, the planet table, the full Vimshottari table, Manglik and the
 * lifetime Sade Sati periods. All calculated, never written by the model, and kept with the report.
 */
import { Body, MakeTime, Observer, SearchRiseSet } from 'astronomy-engine';

import { GRAHAS, NAKSHATRAS, RASHIS } from './catalog.ts';
import { type Chart, lahiri, tropical } from './chart.ts';
import { dignity, navamsa, subPeriods, vimshottari } from './jyotish.ts';
import { GANA, GANA_NAME, manglik, NADI, VARNA, VARNA_NAME, vashyaOf, YONI } from './milan.ts';

export type Diagram = { lagna: number; planets: { graha: string; abbr: string; sign: number; retro: boolean }[] };
export type DashaRow = { lord: string; start: string; end: string; current: boolean };
export type SadeSatiRow = { kind: 'Sade Sati' | 'Dhaiya'; phase: 'Rising' | 'Peak' | 'Setting' | null; sign: string; start: string; end: string; current: boolean };
export type Kundali = {
  /** 'moon' when there is no birth time: the charts are counted from the Moon's sign. */
  chartKind: 'lagna' | 'moon';
  d1: Diagram;
  d9: Diagram;
  basics: [string, string][];
  panchang: [string, string][];
  avkahada: [string, string][];
  planets: { graha: string; name: string; sign: string; degree: string; nakshatra: string; pada: number; nakshatraLord: string; house: number | null; dignity: string; retro: boolean }[];
  dashas: (DashaRow & { antars: DashaRow[] })[];
  manglik: { fromLagna: boolean | null; fromMoon: boolean; text: string };
  sadeSati: SadeSatiRow[];
};

type Person = { name: string | null; place?: string | null; birthDate: string; birthTime: string | null; lat: number; lon: number; tzOffsetMin: number };

const DAY = 86_400_000;
const YEAR = 365.25 * DAY;
const NAK = 360 / 27;
const norm = (x: number) => ((x % 360) + 360) % 360;
const ABBR: Record<string, string> = { sun: 'Su', moon: 'Mo', mars: 'Ma', mercury: 'Me', jupiter: 'Ju', venus: 'Ve', saturn: 'Sa', rahu: 'Ra', ketu: 'Ke' };
const NAK_LORDS = ['ketu', 'venus', 'sun', 'moon', 'mars', 'rahu', 'jupiter', 'saturn', 'mercury'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const TITHIS = ['Pratipada', 'Dwitiya', 'Tritiya', 'Chaturthi', 'Panchami', 'Shashthi', 'Saptami', 'Ashtami', 'Navami', 'Dashami', 'Ekadashi', 'Dwadashi', 'Trayodashi', 'Chaturdashi'];
const YOGAS = ['Vishkambha', 'Priti', 'Ayushman', 'Saubhagya', 'Shobhana', 'Atiganda', 'Sukarma', 'Dhriti', 'Shula', 'Ganda', 'Vriddhi', 'Dhruva', 'Vyaghata', 'Harshana', 'Vajra', 'Siddhi', 'Vyatipata', 'Variyan', 'Parigha', 'Shiva', 'Siddha', 'Sadhya', 'Shubha', 'Shukla', 'Brahma', 'Indra', 'Vaidhriti'];
const KARANAS = ['Bava', 'Balava', 'Kaulava', 'Taitila', 'Garaja', 'Vanija', 'Vishti'];
const NADI_NAME: Record<string, string> = { A: 'Adi', M: 'Madhya', N: 'Antya' };

const gEnglish = (k: string) => GRAHAS.find((g) => g.key === k)!.english;
const gLabel = (k: string) => (k === 'rahu' || k === 'ketu' ? GRAHAS.find((g) => g.key === k)!.name : gEnglish(k));
const rLabel = (i: number) => `${RASHIS[i].name} (${RASHIS[i].english})`;
const rIdx = (key: string) => RASHIS.findIndex((r) => r.key === key);
const dms = (deg: number) => {
  const d = Math.floor(deg);
  const m = Math.floor((deg - d) * 60);
  return `${d}°${String(m).padStart(2, '0')}′`;
};
/** A date in the person's own time zone, as YYYY-MM-DD. */
const isoIn = (d: Date, tz: number) => new Date(+d + tz * 60_000).toISOString().slice(0, 10);
const hhmm = (d: Date, tz: number) => new Date(+d + tz * 60_000).toISOString().slice(11, 16);

function diagram(chart: Chart, kind: 'lagna' | 'moon', map: (lon: number) => number): Diagram {
  const moon = chart.grahas.find((p) => p.graha === 'moon')!;
  const lagnaLon = chart.lagna ? rIdx(chart.lagna.rashi) * 30 + chart.lagna.degree : moon.lon;
  return {
    lagna: map(kind === 'lagna' ? lagnaLon : moon.lon),
    planets: chart.grahas.map((p) => ({ graha: p.graha, abbr: ABBR[p.graha], sign: map(p.lon), retro: p.retrograde && p.graha !== 'rahu' && p.graha !== 'ketu' })),
  };
}

function sunTimes(p: Person): { rise: Date | null; set: Date | null } {
  const [y, m, d] = p.birthDate.split('-').map(Number);
  const midnight = new Date(Date.UTC(y, m - 1, d) - p.tzOffsetMin * 60_000);
  const obs = new Observer(p.lat, p.lon, 0);
  const rise = SearchRiseSet(Body.Sun, obs, +1, midnight, 1);
  const set = SearchRiseSet(Body.Sun, obs, -1, midnight, 1);
  return { rise: rise?.date ?? null, set: set?.date ?? null };
}

function balance(end: Date, born: Date): string {
  const left = (+end - +born) / YEAR;
  const y = Math.floor(left);
  const mf = (left - y) * 12;
  const mo = Math.floor(mf);
  const dd = Math.floor((mf - mo) * 30.44);
  return `${y} y ${mo} m ${dd} d`;
}

const saturnSign = (d: Date) => Math.floor(norm(tropical('saturn', d) - lahiri(MakeTime(d).tt)) / 30);

/** Sade Sati (Saturn in the 12th, 1st, 2nd from the Moon) and dhaiya (4th, 8th) periods, birth to 100 years. */
function sadeSatiPeriods(moonSign: number, born: Date, now: Date, tz: number): SadeSatiRow[] {
  const PHASE: Record<number, SadeSatiRow['phase']> = { 12: 'Rising', 1: 'Peak', 2: 'Setting' };
  const out: SadeSatiRow[] = [];
  let open: { from: number; sign: number; start: Date } | null = null;
  const close = (end: Date) => {
    if (!open) return;
    out.push({
      kind: open.from in PHASE ? 'Sade Sati' : 'Dhaiya',
      phase: PHASE[open.from] ?? null,
      sign: rLabel(open.sign),
      start: isoIn(open.start, tz),
      end: isoIn(end, tz),
      current: +open.start <= +now && +now < +end,
    });
    open = null;
  };
  const step = 10 * DAY;
  for (let t = +born; t < +born + 100 * YEAR; t += step) {
    const d = new Date(t);
    const sign = saturnSign(d);
    const from = ((sign - moonSign + 12) % 12) + 1;
    const counts = [12, 1, 2, 4, 8].includes(from);
    if (open && open.sign !== sign) close(d);
    if (counts && !open) open = { from, sign, start: d };
  }
  close(new Date(+born + 100 * YEAR));
  return out;
}

export function kundali(chart: Chart, person: Person, now: Date): Kundali {
  const tz = person.tzOffsetMin;
  const moon = chart.grahas.find((p) => p.graha === 'moon')!;
  const sun = chart.grahas.find((p) => p.graha === 'sun')!;
  const moonSign = rIdx(moon.rashi);
  const nak = Math.floor(moon.lon / NAK);
  const kind = chart.lagna ? 'lagna' : 'moon';
  const lagnaSign = chart.lagna ? rIdx(chart.lagna.rashi) : null;

  // Panchang at birth.
  const elong = norm(moon.lon - sun.lon);
  const tithi = Math.floor(elong / 12); // 0–29
  const paksha = tithi < 15 ? 'Shukla' : 'Krishna';
  const tName = tithi % 15 === 14 ? (tithi < 15 ? 'Purnima' : 'Amavasya') : TITHIS[tithi % 15];
  const half = Math.floor(elong / 6); // 0–59
  const karana = half === 0 ? 'Kimstughna' : half >= 57 ? ['Shakuni', 'Chatushpada', 'Naga'][half - 57] : KARANAS[(half - 1) % 7];
  const yoga = YOGAS[Math.floor(norm(sun.lon + moon.lon) / NAK)];
  const { rise, set } = sunTimes(person);
  const localDay = new Date(`${person.birthDate}T00:00:00Z`).getUTCDay();
  const vedicDay = rise && person.birthTime && +chart.born < +rise ? (localDay + 6) % 7 : localDay;

  const d = vimshottari(moon.lon, chart.born, now);
  const nine = d.maha.slice(0, 9);
  const row = (p: { lord: string; start: Date; end: Date }): DashaRow => ({ lord: p.lord, start: isoIn(p.start, tz), end: isoIn(p.end, tz), current: +p.start <= +now && +now < +p.end });

  const mars = chart.grahas.find((p) => p.graha === 'mars')!;
  return {
    chartKind: kind,
    d1: diagram(chart, kind, (lon) => Math.floor(norm(lon) / 30)),
    d9: diagram(chart, kind, navamsa),
    basics: [
      ['Name', person.name ?? '—'],
      ['Date of birth', person.birthDate],
      ['Time', person.birthTime ?? 'Not known'],
      ['Place', person.place || `${person.lat.toFixed(2)}, ${person.lon.toFixed(2)}`],
      ['Latitude, longitude', `${person.lat.toFixed(2)}°${person.lat >= 0 ? 'N' : 'S'}, ${person.lon.toFixed(2)}°${person.lon >= 0 ? 'E' : 'W'}`],
      ['Weekday', WEEKDAYS[localDay]],
      ['Sunrise', rise ? hhmm(rise, tz) : '—'],
      ['Sunset', set ? hhmm(set, tz) : '—'],
      ['Ayanamsa', `Lahiri ${dms(chart.ayanamsa)}`],
    ],
    panchang: [
      ['Tithi', tName],
      ['Paksha', paksha],
      ['Yoga', yoga],
      ['Karana', karana],
      ['Nakshatra', `${NAKSHATRAS[nak].name}, pada ${chart.moonNakshatra.pada}`],
      ['Vedic weekday', WEEKDAYS[vedicDay]],
    ],
    avkahada: [
      ['Lagna', lagnaSign === null ? 'Not known (no birth time)' : `${rLabel(lagnaSign)} ${dms(chart.lagna!.degree)}`],
      ['Lagna lord', lagnaSign === null ? '—' : gLabel(RASHIS[lagnaSign].ruler)],
      ['Rashi', rLabel(moonSign)],
      ['Rashi lord', gLabel(RASHIS[moonSign].ruler)],
      ['Nakshatra', `${NAKSHATRAS[nak].name}, pada ${chart.moonNakshatra.pada}`],
      ['Nakshatra lord', gLabel(NAK_LORDS[nak % 9])],
      ['Varna', VARNA_NAME[VARNA[moonSign]]],
      ['Vashya', vashyaOf(moon.lon)],
      ['Yoni', YONI[nak]],
      ['Gana', GANA_NAME[GANA[nak]]],
      ['Nadi', NADI_NAME[NADI[nak]]],
      ['Dasha balance at birth', `${gLabel(nine[0].lord)} ${balance(nine[0].end, chart.born)}`],
    ],
    planets: chart.grahas.map((p) => {
      const n = Math.floor(p.lon / NAK);
      return {
        graha: p.graha,
        name: gLabel(p.graha),
        sign: rLabel(rIdx(p.rashi)),
        degree: dms(p.degree),
        nakshatra: NAKSHATRAS[n].name,
        pada: Math.floor((p.lon % NAK) / (NAK / 4)) + 1,
        nakshatraLord: gLabel(NAK_LORDS[n % 9]),
        house: p.house,
        dignity: dignity(p.graha, p.rashi),
        retro: p.retrograde && p.graha !== 'rahu' && p.graha !== 'ketu',
      };
    }),
    dashas: nine.map((m) => ({ ...row(m), antars: subPeriods(m).map(row) })),
    manglik: manglik(rIdx(mars.rashi), lagnaSign, moonSign),
    sadeSati: sadeSatiPeriods(moonSign, chart.born, now, tz),
  };
}

/** The tables the report's model reads beyond deepChart: every dasha period and the Sade Sati periods. */
export function kundaliFacts(k: Kundali): string {
  const lines = ['FULL VIMSHOTTARI TABLE (dates YYYY-MM-DD):'];
  const running = k.dashas.findIndex((m) => m.current);
  k.dashas.forEach((m, i) => {
    lines.push(`${gLabel(m.lord)} mahadasha ${m.start} to ${m.end}${m.current ? ' (running now)' : ''}`);
    if (running >= 0 && (i === running || i === running + 1)) {
      lines.push(`  antardashas: ${m.antars.map((a) => `${gLabel(a.lord)} ${a.start} to ${a.end}${a.current ? ' (running now)' : ''}`).join('; ')}`);
    }
  });
  lines.push('', `MANGLIK: ${k.manglik.text}`);
  lines.push('', 'SADE SATI AND DHAIYA PERIODS (Saturn from the Moon sign, whole life):');
  for (const s of k.sadeSati) lines.push(`${s.kind}${s.phase ? ` (${s.phase})` : ''}, Saturn in ${s.sign}: ${s.start} to ${s.end}${s.current ? ' (running now)' : ''}`);
  return lines.join('\n');
}
