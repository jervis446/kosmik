import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { AiClient, Report } from '../src/ai.ts';
import { D1Ayurveda } from '../src/ayurveda.ts';
import { D1Profiles } from '../src/profiles.ts';
import { getReport, listReports, ReportError, unlockReport } from '../src/reports.ts';
import { d1 } from './d1.ts';

const NOW = Date.parse('2026-11-16T10:00:00Z');
const written: Report = {
  headline: 'Riya, marriage is most likely between March 2027 and June 2028.',
  summary: 'Your house of partnership is strong.',
  sections: [1, 2, 3].map((i) => ({ heading: `Part ${i}`, body: `Body ${i}` })),
  timing: [{ when: 'March 2027 – June 2028', what: 'The strongest window.' }],
  remedies: [{ title: 'Friday seva', how: 'Help at a temple kitchen.' }],
  strengths: ['Loyal'],
  watch: ['Rushing'],
  followUps: ['When exactly?'],
};

function setup() {
  const { db, raw } = d1();
  const facts: string[] = [];
  const ai = {
    report: async (_topic: unknown, _lang: unknown, f: string) => {
      facts.push(f);
      return written;
    },
  } as unknown as AiClient;
  const deps = { db, ai, profiles: new D1Profiles(db), ayurveda: new D1Ayurveda(db) };
  return { db, raw, deps, facts };
}

const credits = (raw: ReturnType<typeof setup>['raw'], user = 'u1') =>
  (raw.prepare('SELECT credits FROM report_credits WHERE user_id = ?').get(user) as { credits: number } | undefined)?.credits ?? 0;

test('reports: no credit, no report; with one, it is written from the chart, kept, and costs exactly one credit', async () => {
  const { raw, deps, facts, db } = setup();
  await assert.rejects(unlockReport(deps, 'u1', 'marriage', 'en', NOW), (e: unknown) => e instanceof ReportError && e.code === 'no-credits');

  raw.prepare('INSERT INTO report_credits (user_id, credits) VALUES (?, 2)').run('u1');
  await assert.rejects(unlockReport(deps, 'u1', 'marriage', 'en', NOW), (e: unknown) => e instanceof ReportError && e.code === 'needs-details');
  assert.equal(credits(raw), 2, 'nothing spent when the details are missing');

  await deps.profiles.save('u1', { name: 'Riya', gender: 'female', birthDate: '2001-08-19', birthTime: '10:20', place: 'Delhi', lat: 28.61, lon: 77.2, tzOffsetMin: 330, consent: true }, NOW);
  const r = await unlockReport(deps, 'u1', 'marriage', 'en', NOW);
  assert.equal(r.report?.headline, written.headline);
  assert.match(facts[0], /^CHART \(calculated/);
  assert.match(facts[0], /Navamsa \(D9\): marriage[^\n]*lagna \w+; Sun in/, 'marriage reads the D9');
  assert.equal(credits(raw), 1);

  // Opening it again is free, and so is a second unlock of the same report.
  assert.equal((await getReport(db, 'u1', 'marriage')).report?.headline, written.headline);
  await unlockReport(deps, 'u1', 'marriage', 'en', NOW);
  assert.equal(credits(raw), 1);
  assert.equal(facts.length, 1, 'not written twice');

  await deps.db.prepare('UPDATE report_credits SET credits = 1 WHERE user_id = ?').bind('u1').run();
  await unlockReport(deps, 'u1', 'career', 'en', NOW);
  assert.match(facts[1], /Dashamsa \(D10\): career/, 'career reads the D10');
  assert.doesNotMatch(facts[1], /Navamsa \(D9\)/);
  await deps.db.prepare('UPDATE report_credits SET credits = 1 WHERE user_id = ?').bind('u1').run();

  const list = await listReports(db, 'u1');
  assert.equal(list.credits, 1);
  assert.equal(list.reports.find((x) => x.key === 'marriage')?.owned, true);
  assert.equal(list.reports.find((x) => x.key === 'education')?.owned, false);
  assert.deepEqual(list.reports.find((x) => x.key === 'education')?.vargas, [24]);
  assert.ok(!('focus' in list.reports[0]), 'the model instructions stay on the server');
});

test('reports: the Ayurveda report needs the dosha quiz and uses the prakriti, not the chart', async () => {
  const { raw, deps, facts } = setup();
  raw.prepare('INSERT INTO report_credits (user_id, credits) VALUES (?, 1)').run('u1');
  await assert.rejects(unlockReport(deps, 'u1', 'prakriti', 'en', NOW), (e: unknown) => e instanceof ReportError && e.code === 'needs-prakriti');
  await deps.ayurveda.savePrakriti('u1', ['p', 'p', 'p', 'p', 'v', 'v', 'k', 'p', 'p', 'k', 'v', 'p'], NOW);
  await unlockReport(deps, 'u1', 'prakriti', 'en', NOW);
  assert.match(facts[0], /PRAKRITI: [\s\S]*SEASON:/);
  assert.doesNotMatch(facts[0], /CHART/);
  assert.equal(credits(raw), 0);
});
