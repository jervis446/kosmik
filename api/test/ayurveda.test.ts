import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { D1Ayurveda, dominant, prakritiLabel, scorePrakriti } from '../src/ayurveda.ts';
import { matchIntent } from '../src/lib/intents.ts';
import { D1Profiles } from '../src/profiles.ts';
import { herbProblems } from '../../data/scripts/build-herbs.ts';
import { d1 } from './d1.ts';

test('prakriti: answers are scored to percentages that add up to 100', () => {
  const a = (v: number, p: number, k: number) => [...Array(v).fill('v'), ...Array(p).fill('p'), ...Array(k).fill('k')];
  assert.deepEqual(scorePrakriti(a(6, 4, 2)), { vata: 50, pitta: 33, kapha: 17 });
  assert.deepEqual(scorePrakriti(a(4, 4, 4)), { vata: 33, pitta: 33, kapha: 34 });
  assert.throws(() => scorePrakriti(a(6, 4, 1)), /Answer all 12/);
  assert.throws(() => scorePrakriti([...a(6, 4, 1), 'x']));
});

test('prakriti: one dosha leads by 15+, two share the lead, or all three are close', () => {
  assert.deepEqual(dominant({ vata: 58, pitta: 25, kapha: 17 }), ['vata']);
  assert.deepEqual(dominant({ vata: 42, pitta: 33, kapha: 25 }), ['vata', 'pitta']);
  assert.equal(prakritiLabel({ vata: 33, pitta: 33, kapha: 34 }), 'Tridoshic (balanced)');
  assert.equal(prakritiLabel({ vata: 25, pitta: 42, kapha: 33 }), 'Pitta-Kapha');
});

test('intents: herbs, herb lists, doshas and prakriti are recognised; astrology still wins', () => {
  assert.deepEqual(matchIntent('What is Ashwagandha?'), { type: 'herb', key: 'ashwagandha' });
  assert.deepEqual(matchIntent('Tell me about holy basil'), { type: 'herb', key: 'tulsi' });
  assert.deepEqual(matchIntent('haldi ke fayde'), { type: 'herb', key: 'haridra' });
  assert.deepEqual(matchIntent('Withania somnifera'), { type: 'herb', key: 'ashwagandha' });
  assert.deepEqual(matchIntent('Which herbs balance Pitta?'), { type: 'herb-list', dosha: 'pitta', effect: 'pacify', virya: undefined });
  assert.deepEqual(matchIntent('herbs that increase kapha'), { type: 'herb-list', dosha: 'kapha', effect: 'aggravate', virya: undefined });
  assert.deepEqual(matchIntent('cooling herbs'), { type: 'herb-list', dosha: undefined, effect: 'pacify', virya: 'Sheeta' });
  assert.deepEqual(matchIntent('What is vata dosha?'), { type: 'meaning', kind: 'dosha', key: 'vata' });
  assert.deepEqual(matchIntent('mera dosha kya hai'), { type: 'prakriti', quiz: false });
  assert.deepEqual(matchIntent('take the prakriti quiz'), { type: 'prakriti', quiz: true });
  assert.deepEqual(matchIntent('What should I eat for my dosha?'), { type: 'prakriti-advice' });
  assert.deepEqual(matchIntent('Saturn in 7th house'), { type: 'meaning', kind: 'graha-house', key: 'saturn:7' });
  assert.deepEqual(matchIntent('Rohini nakshatra'), { type: 'meaning', kind: 'nakshatra', key: 'rohini' });
  assert.deepEqual(matchIntent('which herb cures diabetes?'), { type: 'herb-health' });
  assert.deepEqual(matchIntent('Can tulsi help with cold and cough?'), { type: 'herb-health', key: 'tulsi' });
  assert.deepEqual(matchIntent('What dose of ashwagandha should I take?'), { type: 'herb-health', key: 'ashwagandha' });
  assert.deepEqual(matchIntent('Which herbs balance Pitta?')?.type, 'herb-list');
  assert.deepEqual(matchIntent('What does the Gita say about pain?'), undefined);
  assert.equal(matchIntent('what is the meaning of life'), undefined);
  assert.equal(matchIntent('tea'), undefined);
});

test('herb descriptions: claims, doses and diseases are rejected', () => {
  const ok = 'In Ayurveda, Tulsi is traditionally used to support clarity and balance. Classical texts describe it as pungent and bitter, light and dry, with heating potency, balancing Vata and Kapha.';
  assert.deepEqual(herbProblems(ok), []);
  assert.ok(herbProblems(ok.replace('support clarity', 'boost immunity')).length);
  assert.ok(herbProblems(ok + ' Take 500 mg daily.').length);
  assert.ok(herbProblems(ok.replace('support clarity', 'treat diabetes')).length);
});

test('herb SQL: lists by dosha leave out herbs that raise it and poisonous plants; prakriti is saved and deleted with My details', async () => {
  const { db, raw } = d1();
  const all = JSON.parse(readFileSync(new URL('../../data/herbs.json', import.meta.url), 'utf8'));
  const ins = raw.prepare('INSERT INTO herbs (key, name, english, botanical, family, synonyms, parts, rasa, guna, virya, vipaka, pacify, aggravate, description, caution, link) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const j = JSON.stringify;
  for (const h of all) ins.run(h.key, h.name, h.english, h.botanical, h.family, j(h.synonyms), j(h.parts), j(h.rasa), j(h.guna), h.virya, h.vipaka, j(h.pacify), j(h.aggravate), h.description, h.caution ? 1 : 0, h.link);
  const ay = new D1Ayurveda(db);

  const tulsi = await ay.herb('tulsi');
  assert.equal(tulsi?.botanical, 'Ocimum sanctum');
  assert.deepEqual(tulsi?.aggravate, ['pitta']);

  const { herbs, total } = await ay.findHerbs({ dosha: 'pitta', effect: 'pacify' }, 12);
  assert.equal(herbs.length, 12);
  assert.ok(total > 100);
  assert.ok(herbs.every((h) => h.pacify.includes('pitta') && !h.aggravate.includes('pitta') && !h.caution));
  assert.equal(herbs[0].virya, 'Sheeta', 'cooling herbs come first for Pitta');
  const cooling = await ay.findHerbs({ effect: 'pacify', virya: 'Sheeta' }, 5);
  assert.ok(cooling.herbs.every((h) => h.virya === 'Sheeta'));

  const answers = [...Array(7).fill('p'), ...Array(3).fill('v'), ...Array(2).fill('k')];
  const saved = await ay.savePrakriti('u1', answers, 1000);
  assert.deepEqual(saved, { vata: 25, pitta: 58, kapha: 17, takenAt: 1000 });
  await ay.savePrakriti('u1', [...Array(12).fill('k')], 2000);
  assert.deepEqual(await ay.prakriti('u1'), { vata: 0, pitta: 0, kapha: 100, takenAt: 2000 });
  await new D1Profiles(db).deleteAll('u1');
  assert.equal(await ay.prakriti('u1'), null);
});
