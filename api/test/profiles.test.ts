import assert from 'node:assert/strict';
import { test } from 'node:test';

import { D1Profiles, ProfileError } from '../src/profiles.ts';
import { d1 } from './d1.ts';

const NOW = Date.parse('2026-11-13T10:00:00Z');
const details = { consent: true, name: 'Asha', birthDate: '1998-03-14', birthTime: '06:45', place: 'Lucknow, Uttar Pradesh, India', lat: 26.85, lon: 80.95, tzOffsetMin: 330 };
const photo = (fill: string) => ({ consent: true, mime: 'image/jpeg', image: Buffer.alloc(3000, fill).toString('base64') });

test('birth details: saved, updated in place, and read back', async () => {
  const p = new D1Profiles(d1().db);
  assert.equal(await p.get('u1'), null);
  await p.save('u1', details, NOW);
  await p.save('u1', { ...details, birthTime: null, name: '' }, NOW + 1);
  assert.deepEqual(await p.get('u1'), { name: null, birthDate: '1998-03-14', birthTime: null, place: 'Lucknow, Uttar Pradesh, India', lat: 26.85, lon: 80.95, tzOffsetMin: 330 });
  assert.equal(await p.get('u2'), null, 'one person never sees another’s details');
});

test('birth details: consent and every field are checked', async () => {
  const p = new D1Profiles(d1().db);
  for (const bad of [
    { ...details, consent: false },
    { ...details, birthDate: '14/03/1998' },
    { ...details, birthDate: '1850-01-01' },
    { ...details, birthDate: '2999-01-01' },
    { ...details, birthTime: '25:00' },
    { ...details, place: '' },
    { ...details, lat: 'north' },
    { ...details, tzOffsetMin: 333 },
  ]) {
    await assert.rejects(p.save('u1', bad as Record<string, unknown>, NOW), ProfileError, JSON.stringify(bad));
  }
});

test('palm photos: one per hand, replaced not duplicated, deletable; delete-all clears everything', async () => {
  const { db, raw } = d1();
  const p = new D1Profiles(db);
  await p.savePalm('u1', 'left', photo('a'), NOW);
  await p.savePalm('u1', 'right', photo('b'), NOW);
  await p.savePalm('u1', 'right', photo('c'), NOW + 5);
  assert.deepEqual(await p.palmStatus('u1'), { left: NOW, right: NOW + 5 });
  const photos = await p.palms('u1');
  assert.deepEqual(photos.map((x) => x.hand), ['left', 'right']);
  assert.equal(Buffer.from(photos[1].data, 'base64').toString(), 'c'.repeat(3000));
  assert.equal((await p.palm('u1', 'left'))!.mime, 'image/jpeg');

  await assert.rejects(p.savePalm('u1', 'third', photo('d'), NOW), ProfileError);
  await assert.rejects(p.savePalm('u1', 'left', { ...photo('d'), consent: false }, NOW), ProfileError);
  await assert.rejects(p.savePalm('u1', 'left', { ...photo('d'), mime: 'image/gif' }, NOW), ProfileError);

  await p.deletePalm('u1', 'left');
  assert.deepEqual(await p.palmStatus('u1'), { left: null, right: NOW + 5 });
  await p.save('u1', details, NOW);
  await p.deleteAll('u1');
  assert.equal(await p.get('u1'), null);
  assert.equal((raw.prepare('SELECT COUNT(*) AS n FROM palm_photos').get() as { n: number }).n, 0);
});
