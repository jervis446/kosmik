import assert from 'node:assert/strict';
import { test } from 'node:test';

import { calculateChart } from '../src/lib/chart.ts';
import { DASHA_ORDER, dignity, navamsa, vimshottari, yogas } from '../src/lib/jyotish.ts';

const YEAR = 365.25 * 86_400_000;

test('vimshottari: starts from the Moon nakshatra lord, periods are contiguous and add up to 120 years', () => {
  // Moon at 0° Ashwini: a full Ketu mahadasha starts at birth.
  const born = new Date('2000-01-01T00:00:00Z');
  const d = vimshottari(0, born, new Date('2001-01-01T00:00:00Z'));
  assert.equal(d.maha[0].lord, 'ketu');
  assert.equal(+d.maha[0].start, +born);
  assert.equal(Math.round((+d.maha[0].end - +born) / YEAR), 7);
  const nine = d.maha.slice(0, 9);
  assert.equal(Math.round((+nine[8].end - +nine[0].start) / YEAR), 120);
  for (let i = 1; i < nine.length; i++) assert.equal(+nine[i].start, +nine[i - 1].end);
  // Ketu-Ketu antardasha is 7 * 7 / 120 years (about 4.9 months), then Ketu-Venus.
  assert.equal(d.current?.maha.lord, 'ketu');
  assert.equal(d.current?.antar.lord, 'venus');
  // Halfway through Bharani (ruled by Venus): half of Venus's 20 years is left at birth.
  const half = vimshottari(360 / 27 * 1.5, born, born);
  assert.equal(half.maha[0].lord, 'venus');
  assert.equal(Math.round((+half.maha[0].end - +born) / YEAR), 10);
  assert.deepEqual(DASHA_ORDER.reduce((n, [, y]) => n + y, 0), 120);
});

test('dignity and navamsa', () => {
  assert.equal(dignity('sun', 'mesh'), 'exalted');
  assert.equal(dignity('sun', 'tula'), 'debilitated');
  assert.equal(dignity('saturn', 'kumbh'), 'own sign');
  assert.equal(dignity('mercury', 'meen'), 'debilitated');
  assert.equal(navamsa(0), 0, '0° Aries is Aries navamsa');
  assert.equal(navamsa(30 + 1), 9, 'early Taurus is Capricorn navamsa');
  assert.equal(navamsa(120 + 29.9), 8, 'late Leo is Sagittarius navamsa');
});

test('yogas: found from the chart', () => {
  const chart = calculateChart({ date: '1998-03-14', time: '06:45', tzOffsetMin: 330, lat: 26.85, lon: 80.95 });
  const ys = yogas(chart).join(' | ');
  assert.match(ys, /Mangal dosha/);
  assert.match(ys, /Raj yoga/);
});

test('snapshot: three personal lines and the running dasha', async () => {
  const { snapshot } = await import('../src/lib/snapshot.ts');
  const chart = calculateChart({ date: '1998-03-14', time: '06:45', tzOffsetMin: 330, lat: 26.85, lon: 80.95 });
  const s = snapshot(chart, new Date('2026-11-15T06:00:00Z'), 'Asha');
  assert.deepEqual(s.lines.map((l) => l.tag), ['Moon · Kanya (Virgo)', 'Sun · Kumbh (Aquarius)', 'Lagna · Meen (Pisces)']);
  assert.ok(s.lines.every((l) => l.text.length > 20));
  assert.match(s.dasha ?? '', /^Rahu–Ketu until 19 April 2027$/);
  const noTime = snapshot(calculateChart({ date: '1998-03-14', time: null, tzOffsetMin: 330, lat: 26.85, lon: 80.95 }), new Date(), null);
  assert.equal(noTime.lines.length, 2, 'no lagna without a birth time');
});

test('tropical: Western big three, the Sun on the birthday, and the next solar return', async () => {
  const { zodiac, cusp } = await import('../src/lib/tropical.ts');
  const chart = calculateChart({ date: '1998-03-14', time: '06:45', tzOffsetMin: 330, lat: 26.85, lon: 80.95 });
  const z = zodiac(chart, new Date('2026-11-15T06:00:00Z'));
  assert.equal(z.sun.sign, 'Pisces');
  assert.match(z.sun.degree, /^23°1\d′ Pisces$/);
  assert.equal(z.moon.sign, 'Libra');
  assert.equal(z.rising?.sign, 'Aries');
  assert.match(z.siderealSun, /Kumbh \(Aquarius\)$/, 'the Vedic sun is in the previous sign');
  assert.match(z.solarReturn, /^14 March 2027 at /);
  assert.equal(cusp(30.5), 'Aries–Taurus cusp');
  assert.equal(cusp(45), null);
});

test('vargas follow Parashara: D2, D7, D9, D10 and D24 for odd and even signs', async () => {
  const { varga } = await import('../src/lib/jyotish.ts');
  const ARIES = 0, TAURUS = 30;
  // Hora: odd sign Leo then Cancer, even sign Cancer then Leo.
  assert.deepEqual([varga(ARIES + 10, 2), varga(ARIES + 20, 2), varga(TAURUS + 10, 2), varga(TAURUS + 20, 2)], [4, 3, 3, 4]);
  // Saptamsa: even signs start from the 7th.
  assert.equal(varga(TAURUS + 1, 7), 7);
  // Navamsa: Aries starts at Aries, Taurus at Capricorn.
  assert.deepEqual([varga(ARIES + 1, 9), varga(TAURUS + 1, 9)], [0, 9]);
  // Dashamsa: 3° parts; odd signs from themselves, even signs from the 9th.
  assert.deepEqual([varga(ARIES + 5, 10), varga(TAURUS + 5, 10), varga(TAURUS + 29.9, 10)], [1, 10, 6]);
  // Chaturvimshamsa: odd signs from Leo, even from Cancer.
  assert.deepEqual([varga(ARIES + 0.5, 24), varga(TAURUS + 0.5, 24), varga(ARIES + 29.9, 24)], [4, 3, 3]);
});
