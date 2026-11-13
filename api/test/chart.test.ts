import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Horizon, Observer, RotateVector, Rotation_ECT_EQD, SphereFromVector, Spherical, VectorFromSphere } from 'astronomy-engine';

import { ascendant, birthInstant, calculateChart, describeChart, lahiri } from '../src/lib/chart.ts';

/** Independent check: scan the ecliptic for the point sitting on the eastern horizon. */
function risingPoint(date: Date, lat: number, lon: number): number {
  const obs = new Observer(lat, lon, 0);
  let best = 0;
  let bestAlt = Infinity;
  for (let l = 0; l < 360; l += 0.02) {
    const eqd = SphereFromVector(RotateVector(Rotation_ECT_EQD(date), VectorFromSphere(new Spherical(0, l, 1), date)));
    const h = Horizon(date, obs, eqd.lon / 15, eqd.lat);
    if (h.azimuth > 0 && h.azimuth < 180 && Math.abs(h.altitude) < bestAlt) {
      bestAlt = Math.abs(h.altitude);
      best = l;
    }
  }
  return best;
}

const arc = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

test('ascendant formula agrees with a direct horizon search (Delhi, Mumbai, Chennai, London)', () => {
  for (const [when, lat, lon] of [
    ['2000-01-01T06:30:00Z', 28.61, 77.21],
    ['1995-08-15T14:00:00Z', 19.08, 72.88],
    ['2010-03-20T21:45:00Z', 13.08, 80.27],
    ['1988-12-02T02:10:00Z', 51.5, -0.12],
  ] as const) {
    const d = new Date(when);
    assert.ok(arc(ascendant(d, lat, lon), risingPoint(d, lat, lon)) < 0.1, when);
  }
});

test('reference values: Lahiri ayanamsa and the Sun in Dhanu at the start of 2000', () => {
  assert.ok(Math.abs(lahiri(0) - 23.853) < 0.01);
  assert.ok(Math.abs(lahiri(365.25 * 25) - 24.2) < 0.03, 'about 24°12′ in 2025');
  const c = calculateChart({ date: '2000-01-01', time: '17:30', tzOffsetMin: 330, lat: 28.61, lon: 77.21 });
  const sun = c.grahas.find((g) => g.graha === 'sun')!;
  assert.equal(sun.rashi, 'dhanu');
  assert.ok(Math.abs(sun.degree - 16.5) < 0.3, String(sun.degree));
  const [rahu, ketu] = ['rahu', 'ketu'].map((k) => c.grahas.find((g) => g.graha === k)!);
  assert.equal((['mesh', 'vrishabh', 'mithun', 'kark', 'simha', 'kanya', 'tula', 'vrishchik', 'dhanu', 'makar', 'kumbh', 'meen'].indexOf(rahu.rashi) + 6) % 12, ['mesh', 'vrishabh', 'mithun', 'kark', 'simha', 'kanya', 'tula', 'vrishchik', 'dhanu', 'makar', 'kumbh', 'meen'].indexOf(ketu.rashi));
  assert.ok(c.lagna);
  for (const g of c.grahas) assert.ok(g.house! >= 1 && g.house! <= 12);
  assert.match(describeChart(c), /Lagna \(ascendant\): .+\nSurya \(Sun\): Dhanu \(Sagittarius\)/);
});

test('without a birth time: no lagna or houses, rashis and nakshatra still given', () => {
  const c = calculateChart({ date: '1995-08-15', time: null, tzOffsetMin: 330, lat: 19.08, lon: 72.88 });
  assert.equal(c.lagna, null);
  assert.ok(c.grahas.every((g) => g.house === null));
  assert.ok(c.moonNakshatra.pada >= 1 && c.moonNakshatra.pada <= 4);
  assert.match(describeChart(c), /Lagna: unknown/);
});

test('local time is converted with the birth place offset, and impossible dates are refused', () => {
  assert.equal(birthInstant({ date: '2000-01-01', time: '05:30', tzOffsetMin: 330 }).toISOString(), '2000-01-01T00:00:00.000Z');
  assert.equal(birthInstant({ date: '1990-06-10', time: '23:15', tzOffsetMin: -240 }).toISOString(), '1990-06-11T03:15:00.000Z');
  for (const bad of [{ date: '2001-02-29', time: '10:00' }, { date: '2000-13-01', time: '10:00' }, { date: '2000-01-01', time: '24:10' }, { date: '1/1/2000', time: null }]) {
    assert.throws(() => birthInstant({ ...bad, tzOffsetMin: 330 }), RangeError);
  }
  assert.throws(() => calculateChart({ date: '2000-01-01', time: '10:00', tzOffsetMin: 0, lat: 78, lon: 15 }), RangeError);
});
