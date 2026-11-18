import assert from 'node:assert/strict';
import { test } from 'node:test';

import { calculateChart } from '../src/lib/chart.ts';
import { kundali, kundaliFacts } from '../src/lib/kundali.ts';

// A published reference chart: 13 Dec 1981, 01:20, Nasik (20°N, 73°52′E), IST.
const birth = { date: '1981-12-13', time: '01:20', tzOffsetMin: 330, lat: 20, lon: 73.8667 };
const person = { name: 'Kiran', place: 'Nasik', birthDate: birth.date, birthTime: birth.time, lat: birth.lat, lon: birth.lon, tzOffsetMin: 330 };
const now = new Date('2026-11-18T06:00:00Z');
const k = kundali(calculateChart(birth), person, now);
const row = (rows: [string, string][], label: string) => rows.find(([l]) => l === label)?.[1];

test('kundali: panchang matches the reference chart', () => {
  assert.match(row(k.panchang, 'Tithi')!, /^Dwitiya/);
  assert.equal(row(k.panchang, 'Paksha'), 'Krishna');
  assert.match(row(k.panchang, 'Yoga')!, /^Shukla/);
  assert.match(row(k.panchang, 'Karana')!, /^Garaja/);
  // Born before sunrise, so the Vedic day is still Saturday though the date is a Sunday.
  assert.equal(row(k.basics, 'Weekday'), 'Sunday');
  assert.equal(row(k.panchang, 'Vedic weekday'), 'Saturday');
  assert.match(row(k.basics, 'Sunrise')!, /^0(6:5\d|7:0\d)$/);
  assert.match(row(k.basics, 'Sunset')!, /^17:5\d$/);
});

test('kundali: avkahada chakra matches the reference chart', () => {
  assert.match(row(k.avkahada, 'Lagna')!, /Kanya/);
  assert.match(row(k.avkahada, 'Rashi')!, /Mithun/);
  assert.equal(row(k.avkahada, 'Nakshatra'), 'Ardra, pada 4');
  assert.equal(row(k.avkahada, 'Nakshatra lord'), 'Rahu');
  assert.equal(row(k.avkahada, 'Varna'), 'Shudra');
  assert.equal(row(k.avkahada, 'Vashya'), 'Manava');
  assert.equal(row(k.avkahada, 'Yoni'), 'Dog');
  assert.equal(row(k.avkahada, 'Gana'), 'Manushya');
  assert.equal(row(k.avkahada, 'Nadi'), 'Adi');
  assert.match(row(k.avkahada, 'Dasha balance at birth')!, /^Rahu 2 y (10|11) m/);
});

test('kundali: diamond charts put the lagna sign in house 1 and planets in their signs', () => {
  assert.equal(k.d1.lagna, 5); // Kanya
  const sign = (g: string) => k.d1.planets.find((p) => p.graha === g)!.sign;
  assert.equal(sign('mars'), 5);
  assert.equal(sign('saturn'), 5);
  assert.equal(sign('moon'), 2);
  assert.equal(sign('sun'), 7);
  assert.equal(k.d9.planets.length, 9);
  assert.ok(k.d9.lagna !== null);
  assert.equal(k.chartKind, 'lagna');
});

test('kundali: planet table, dasha table with antardashas, manglik and sade sati', () => {
  const mars = k.planets.find((p) => p.graha === 'mars')!;
  assert.equal(mars.house, 1);
  assert.match(mars.nakshatra, /Uttara Phalguni/);
  assert.equal(k.dashas[0].lord, 'rahu');
  assert.equal(k.dashas[1].lord, 'jupiter');
  assert.match(k.dashas[1].start, /^1984-12/);
  assert.equal(k.dashas[1].antars.length, 9);
  assert.equal(k.dashas[1].antars[0].lord, 'jupiter');
  assert.ok(k.dashas.some((d) => d.current && d.lord === 'mercury'));
  assert.ok(k.dashas.find((d) => d.current)!.antars.some((a) => a.current));
  assert.equal(k.manglik.fromLagna, true);
  assert.equal(k.manglik.fromMoon, true);
  const first = k.sadeSati.find((s) => s.kind === 'Sade Sati')!;
  assert.equal(first.phase, 'Rising');
  assert.match(first.start, /^2000-0[5-7]/);
  assert.ok(k.sadeSati.some((s) => s.kind === 'Dhaiya' && /^2009/.test(s.start)));
});

test('kundali: without a birth time it draws the Moon chart and says so', () => {
  const noTime = kundali(calculateChart({ ...birth, time: null }), { ...person, birthTime: null }, now);
  assert.equal(noTime.chartKind, 'moon');
  assert.equal(noTime.d1.lagna, 2); // Mithun, the Moon's sign
  assert.equal(noTime.manglik.fromLagna, null);
  assert.equal(row(noTime.basics, 'Time'), 'Not known');
});

test('kundali facts: the full dasha table and sade sati periods for the model', () => {
  const f = kundaliFacts(k);
  assert.match(f, /Mercury mahadasha/);
  assert.match(f, /antardashas:/);
  assert.match(f, /Sade Sati/);
  assert.match(f, /Manglik/);
});
