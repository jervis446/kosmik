/**
 * The Western (tropical) zodiac, from the same birth moment as the Vedic chart: signs counted
 * from the equinox rather than the stars, so they sit about 24° ahead of the sidereal ones.
 * Also where the Sun stood on the birthday, and the solar return: the moment each year the Sun
 * comes back to exactly that degree.
 */
import { RASHIS } from './catalog.ts';
import { type Chart, tropical } from './chart.ts';

export const SIGNS = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
const GLYPHS = ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'];

/** One short line per sign, for each of the big three. */
const SUN_VIBE = [
  'Main-character energy: you start things and move first.',
  'Steady, loyal and here for the good things in life.',
  'Curious, quick and always in three conversations at once.',
  'Soft heart, strong shell; your people are everything.',
  'Warm, generous and made to be seen.',
  'Detail-brain: you fix, improve and quietly carry the team.',
  'Charm, taste and a need for things to feel fair.',
  'Deep, private and all-in when you care.',
  'Free spirit with big questions and bigger plans.',
  'Long-game player: ambitious, patient, built to last.',
  'Original thinker who does it your own way.',
  'Dreamy, intuitive and kinder than you let on.',
];
const MOON_VIBE = [
  'You feel fast and fire up quickly, then move on.',
  'You need calm, comfort and routine to feel safe.',
  'You process feelings by talking them out.',
  'You feel everything deeply and need a soft place to land.',
  'You need to feel appreciated; warmth fills your cup.',
  'You calm down by sorting, fixing and tidying.',
  'You need harmony; conflict drains you.',
  'Your feelings run deep and you guard them closely.',
  'You need space and something to look forward to.',
  'You keep feelings in check and lean on structure.',
  'You need room to be yourself, even in closeness.',
  'You absorb the mood of every room you walk into.',
];
const RISING_VIBE = [
  'First impression: bold, direct, ready to go.',
  'First impression: calm, grounded, easy to trust.',
  'First impression: chatty, witty, curious.',
  'First impression: caring, gentle, a little reserved.',
  'First impression: confident and hard to miss.',
  'First impression: neat, sharp, put-together.',
  'First impression: charming and easy to be around.',
  'First impression: magnetic and a bit mysterious.',
  'First impression: open, funny, up for anything.',
  'First impression: serious, capable, older than your years.',
  'First impression: friendly, quirky, original.',
  'First impression: soft, dreamy, kind.',
];

const norm = (x: number) => ((x % 360) + 360) % 360;
/** "23°41′ Scorpio" */
export const degreeText = (lon: number) => {
  const inSign = norm(lon) % 30;
  const d = Math.floor(inSign);
  const m = Math.floor((inSign - d) * 60);
  return `${d}°${String(m).padStart(2, '0')}′ ${SIGNS[Math.floor(norm(lon) / 30)]}`;
};
const signOf = (lon: number) => Math.floor(norm(lon) / 30);

export type Placement = { sign: string; glyph: string; degree: string; lon: number };
const place = (lon: number): Placement => ({ sign: SIGNS[signOf(lon)], glyph: GLYPHS[signOf(lon)], degree: degreeText(lon), lon: Math.round(norm(lon) * 1000) / 1000 });

/** Tropical longitude = sidereal longitude + ayanamsa. */
export function tropicalChart(chart: Chart) {
  const at = (g: string) => chart.grahas.find((p) => p.graha === g)!;
  const trop = (lon: number) => norm(lon + chart.ayanamsa);
  const sun = place(trop(at('sun').lon));
  const moon = place(trop(at('moon').lon));
  const rising = chart.lagna ? place(trop(RASHI_START(chart.lagna.rashi) + chart.lagna.degree)) : null;
  const planets = chart.grahas.map((p) => ({ graha: p.graha, ...place(trop(p.lon)) }));
  return { sun, moon, rising, planets };
}

const RASHI_KEYS = ['mesh', 'vrishabh', 'mithun', 'kark', 'simha', 'kanya', 'tula', 'vrishchik', 'dhanu', 'makar', 'kumbh', 'meen'];
const RASHI_START = (key: string) => RASHI_KEYS.indexOf(key) * 30;

/** Born within a degree of a sign change: "on the Scorpio–Sagittarius cusp". */
export function cusp(lon: number): string | null {
  const inSign = norm(lon) % 30;
  const i = signOf(lon);
  if (inSign < 1) return `${SIGNS[(i + 11) % 12]}–${SIGNS[i]} cusp`;
  if (inSign > 29) return `${SIGNS[i]}–${SIGNS[(i + 1) % 12]} cusp`;
  return null;
}

/** The next moment (after `after`) the Sun returns to the birth longitude, to about a minute. */
export function solarReturn(sunLon: number, born: Date, after: Date): Date {
  const birthday = (year: number) => new Date(Date.UTC(year, born.getUTCMonth(), born.getUTCDate(), born.getUTCHours(), born.getUTCMinutes()));
  let year = after.getUTCFullYear();
  if (+birthday(year) < +after - 2 * 86_400_000) year++;
  let t = +birthday(year);
  // Newton's method on the Sun's longitude (about 0.9856° a day).
  for (let i = 0; i < 8; i++) {
    const diff = ((sunLon - tropical('sun', new Date(t)) + 540) % 360) - 180;
    t += (diff / 0.98565) * 86_400_000;
    if (Math.abs(diff) < 1e-5) break;
  }
  if (t < +after) return solarReturn(sunLon, born, new Date(+after + 300 * 86_400_000));
  return new Date(t);
}

export const when = (d: Date) =>
  d.toLocaleString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

export type Zodiac = ReturnType<typeof zodiac>;

/** Everything the zodiac card shows. */
export function zodiac(chart: Chart, now: Date) {
  const t = tropicalChart(chart);
  const vedicSun = chart.grahas.find((p) => p.graha === 'sun')!;
  const ret = solarReturn(t.sun.lon, chart.born, now);
  return {
    sun: { ...t.sun, vibe: SUN_VIBE[signOf(t.sun.lon)] },
    moon: { ...t.moon, vibe: MOON_VIBE[signOf(t.moon.lon)] },
    rising: t.rising ? { ...t.rising, vibe: RISING_VIBE[signOf(t.rising.lon)] } : null,
    planets: t.planets,
    siderealSun: `${Math.floor(vedicSun.degree)}°${String(Math.floor((vedicSun.degree % 1) * 60)).padStart(2, '0')}′ ${(() => { const r = RASHIS.find((x) => x.key === vedicSun.rashi)!; return `${r.name} (${r.english})`; })()}`,
    cusp: cusp(t.sun.lon),
    solarReturn: `${when(ret)} (India time)`,
    ayanamsa: chart.ayanamsa,
  };
}

/** The tropical facts, as lines for the model. */
export function describeTropical(chart: Chart, now: Date): string {
  const z = zodiac(chart, now);
  return [
    `Western (tropical) signs: Sun ${z.sun.degree}, Moon ${z.moon.degree}${z.rising ? `, Rising ${z.rising.degree}` : ', Rising unknown (no birth time)'}${z.cusp ? `; born on the ${z.cusp}` : ''}`,
    `Tropical planets: ${z.planets.map((p) => `${p.graha} ${p.degree}`).join('; ')}`,
    `Next solar return (Sun back at its birth degree): ${z.solarReturn}`,
    `Tropical signs run about ${z.ayanamsa.toFixed(1)}° ahead of the sidereal (Vedic) ones.`,
  ].join('\n');
}
