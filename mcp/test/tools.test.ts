import assert from 'node:assert/strict';
import { test } from 'node:test';

import { d1 } from '../../api/test/d1.ts';
import { FREE_CALLS_PER_DAY, PREMIUM_CALLS_PER_DAY, drawTarot, findVerse, herbInfo, matchKundali, myDashas, myKundali, myPrakriti, myReports, RULES, takeCall, transitsNow, type ToolEnv } from '../src/tools.ts';

const NOW = new Date('2026-11-19T06:00:00Z');
const U = 'user-1';

function setup(opts: { profile?: boolean; premium?: boolean } = {}) {
  const { db, raw } = d1();
  if (opts.profile !== false) {
    raw.prepare(
      `INSERT INTO profiles (user_id, name, birth_date, birth_time, place, lat, lon, tz_offset_min, consent_at, updated_at, gender)
       VALUES (?, 'Kiran', '1981-12-13', '01:20', 'Nashik, Maharashtra, India', 20, 73.8667, 330, 0, 0, 'female')`,
    ).run(U);
  }
  if (opts.premium) raw.prepare('INSERT INTO premium (user_id, until) VALUES (?, ?)').run(U, NOW.getTime() + 86_400_000);
  const env: ToolEnv = {
    db,
    userId: U,
    now: NOW,
    // First card in the deck, and upright (a draw of 0 out of 3 means reversed).
    random: (n) => (n === 3 ? 1 : 0),
    searchPlaces: async (q) => (/pune/i.test(q) ? [{ name: 'Pune, Maharashtra, India', lat: 18.52, lon: 73.85, country: 'India', tzOffsetMin: 330 }] : []),
  };
  return { db, raw, env };
}

test('my_kundali: the chart from saved birth details, with Kosmik rules at the end', async () => {
  const { env } = setup();
  const out = await myKundali(env);
  assert.match(out, /Lagna \(ascendant\): Kanya/);
  assert.match(out, /Moon: Mithun/);
  assert.match(out, /Nakshatra: Ardra, pada 4/, 'avkahada rows are included');
  assert.match(out, /YOGAS:/);
  assert.doesNotMatch(out, /TRANSITS/, 'transits have their own tool');
  assert.ok(out.endsWith(RULES));
});

test('chart tools ask for birth details when there are none', async () => {
  const { env } = setup({ profile: false });
  for (const tool of [myKundali, myDashas, transitsNow]) {
    const out = await tool(env);
    assert.match(out, /Add your birth details in Kosmik first/);
    assert.match(out, /https:\/\/kosmik\.asanoha\.co\.in\/account/);
  }
});

test('my_dashas: the running periods and the full table with antardashas', async () => {
  const { env } = setup();
  const out = await myDashas(env);
  assert.match(out, /Mahadasha now: Mercury/);
  assert.match(out, /Antardasha now: Mercury–Sun/);
  assert.match(out, /Mercury mahadasha 2019-12-02 to 2036-12-01 \(running now\)/);
  assert.match(out, /antardashas:/);
});

test('transits_now: slow planets against the chart, and Sade Sati periods', async () => {
  const { env } = setup();
  const out = await transitsNow(env);
  assert.match(out, /Saturn now in /);
  assert.match(out, /Jupiter now in /);
  assert.match(out, /SADE SATI AND DHAIYA/);
});

test('match_kundali: Guna Milan and Manglik with a partner, whose details are not saved', async () => {
  const { env, raw } = setup();
  const out = await matchKundali(env, { name: 'Arjun', birthDate: '1980-05-10', birthTime: '08:15', place: 'Pune' });
  assert.match(out, /Guna Milan: \d+(\.\d)? out of 36/);
  assert.match(out, /Arjun/);
  assert.match(out, /Manglik/);
  assert.equal((raw.prepare('SELECT count(*) AS n FROM profiles').get() as { n: number }).n, 1, 'only the person’s own profile is stored');
  await assert.rejects(matchKundali(env, { birthDate: '1980-05-10', place: 'Nowhere' }), /couldn’t find that place/i);
  await assert.rejects(matchKundali(env, { birthDate: '10/05/1980', place: 'Pune' }), /YYYY-MM-DD/);
});

test('draw_tarot: Kosmik draws the cards and gives their meanings', async () => {
  const { env, raw } = setup();
  raw.prepare("INSERT INTO meanings (kind, key, title, body) VALUES ('tarot-upright', 'fool', 'The Fool', 'New beginnings and a leap of faith.')").run();
  const one = await drawTarot(env, 1);
  assert.match(one, /Your card: The Fool \(upright\)/);
  assert.match(one, /New beginnings/);
  const three = await drawTarot(env, 3);
  assert.equal((three.match(/^(Past|Present|Future): /gm) ?? []).length, 3);
});

test('find_verse: a Gita verse by chapter and verse, with its translator', async () => {
  const { env, raw } = setup();
  raw.prepare(
    "INSERT INTO verses (ref, work, chapter, verse, sanskrit, iast, translation, translator, source, embedding) VALUES ('BG 2.47', 'Bhagavad Gita', 2, 47, 'कर्मण्येवाधिकारस्ते', 'karmaṇy evādhikāras te', 'Thy right is to work only.', 'Swami Sivananda', 'test', x'00')",
  ).run();
  const out = await findVerse(env, 2, 47);
  assert.match(out, /Bhagavad Gita 2\.47/);
  assert.match(out, /कर्मण्येवाधिकारस्ते/);
  assert.match(out, /Thy right is to work only\. \(Swami Sivananda\)/);
  assert.match(await findVerse(env, 2, 99), /no verse 2\.99/i);
});

test('herb_info: an Ayurveda herb found by any of its names', async () => {
  const { env, raw } = setup();
  raw.prepare(
    `INSERT INTO herbs (key, name, english, botanical, family, synonyms, parts, rasa, guna, virya, vipaka, pacify, aggravate, description, caution, link)
     VALUES ('ashwagandha', 'Ashwagandha', 'Indian ginseng', 'Withania somnifera', 'Solanaceae', '["Turagi"]', '["root"]', '["tikta","kashaya"]', '["laghu","snigdha"]', 'ushna', 'madhura', '["vata","kapha"]', '["pitta"]', 'A classic rasayana for strength and sleep.', 0, 'https://example.test')`,
  ).run();
  const out = await herbInfo(env, 'Indian Ginseng');
  assert.match(out, /Ashwagandha \(Indian ginseng, Withania somnifera\)/);
  assert.match(out, /Virya: ushna/);
  assert.match(out, /Calms: vata, kapha/);
  assert.match(out, /doctor/i, 'health answers carry the doctor rule');
  assert.match(await herbInfo(env, 'unobtainium'), /isn’t in Kosmik’s herb library/);
});

test('my_prakriti: quiz results, or how to take the quiz', async () => {
  const { env, raw } = setup();
  assert.match(await myPrakriti(env), /haven’t taken the prakriti quiz/);
  raw.prepare("INSERT INTO prakriti (user_id, vata, pitta, kapha, answers, taken_at) VALUES (?, 50, 30, 20, '[]', 0)").run(U);
  const out = await myPrakriti(env);
  assert.match(out, /Prakriti: Vata 50%, Pitta 30%, Kapha 20%/);
});

test('my_reports: Premium only, and gives the reports already bought', async () => {
  const free = setup();
  assert.match(await myReports(free.env), /Premium/);
  const p = setup({ premium: true });
  assert.match(await myReports(p.env), /haven’t unlocked any reports/);
  p.raw.prepare("INSERT INTO reports (user_id, report_key, lang, content, created_at) VALUES (?, 'career', 'en', ?, 0)").run(
    U,
    JSON.stringify({ headline: 'A promotion window opens in March 2027.', summary: 'Steady rise.', sections: [{ heading: 'Work', body: 'Lead from the front.' }], timing: [], remedies: [], strengths: [], watch: [], followUps: [], periods: [], transits: [], doshas: [] }),
  );
  const out = await myReports(p.env);
  assert.match(out, /A promotion window opens in March 2027\./);
  assert.match(out, /Work\nLead from the front\./);
});

test('limits: 11 lookups a day on a free account, refilled the next day (India time)', async () => {
  const { env } = setup();
  assert.equal(FREE_CALLS_PER_DAY, 11);
  for (let i = 0; i < 11; i++) assert.deepEqual(await takeCall(env), { ok: true, limit: 11, premium: false });
  assert.deepEqual(await takeCall(env), { ok: false, limit: 11, premium: false });
  assert.equal((await takeCall({ ...env, now: new Date(NOW.getTime() + 86_400_000) })).ok, true);
});

test('limits: 51 lookups a day on Premium', async () => {
  const { env } = setup({ premium: true });
  assert.equal(PREMIUM_CALLS_PER_DAY, 51);
  for (let i = 0; i < 51; i++) assert.equal((await takeCall(env)).ok, true);
  assert.deepEqual(await takeCall(env), { ok: false, limit: 51, premium: true });
});
