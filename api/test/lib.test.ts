import assert from 'node:assert/strict';
import { test } from 'node:test';

import { libraryEntries } from '../src/lib/catalog.ts';
import { toIAST } from '../src/lib/iast.ts';
import { matchIntent } from '../src/lib/intents.ts';
import { istDate, planFor, weekStart } from '../src/lib/limits.ts';
import { contentProblems, isCrisis, meaningProblems } from '../src/lib/safety.ts';
import { detectLang, normalizeQuestion } from '../src/lib/text.ts';
import { cosine, fromBlob, toBlob, topK } from '../src/lib/vectors.ts';

test('IAST transliteration of known verses', () => {
  assert.equal(toIAST('कर्मण्येवाधिकारस्ते मा फलेषु कदाचन ।'), 'karmaṇyevādhikāraste mā phaleṣu kadācana |');
  assert.equal(toIAST('मा कर्मफलहेतुर्भूर्मा ते सङ्गोऽस्त्वकर्मणि ॥'), 'mā karmaphalaheturbhūrmā te saṅgo’stvakarmaṇi ||');
  assert.equal(toIAST('धर्मक्षेत्रे कुरुक्षेत्रे'), 'dharmakṣetre kurukṣetre');
  assert.equal(toIAST('ॐ नमः शिवाय'), 'oṃ namaḥ śivāya');
  assert.equal(toIAST('२.४७'), '2.47');
});

test('questions normalise to the same cache key', () => {
  assert.equal(normalizeQuestion('  Please, what is Karma Yoga?? '), normalizeQuestion('what is karma yoga'));
  assert.equal(normalizeQuestion('Tell me: what’s sade sati!'), 'whats sade sati');
  assert.equal(normalizeQuestion('कर्म योग क्या है?'), 'कर्म योग क्या है');
});

test('language detection: Hindi, Hinglish and English', () => {
  assert.equal(detectLang('कर्म योग क्या है?'), 'hi');
  assert.equal(detectLang('karma yoga kya hai'), 'hinglish');
  assert.equal(detectLang('meri rashi kaunsi hai'), 'hinglish');
  assert.equal(detectLang('What is karma yoga?'), 'en');
});

test('direct intents need no AI', () => {
  assert.deepEqual(matchIntent('Gita 2.47'), { type: 'verse', chapter: 2, verse: 47 });
  assert.deepEqual(matchIntent('गीता २.४७'), { type: 'verse', chapter: 2, verse: 47 });
  assert.deepEqual(matchIntent('chapter 18 verse 66'), { type: 'verse', chapter: 18, verse: 66 });
  assert.deepEqual(matchIntent('Pull 3 tarot cards for my career'), { type: 'tarot-draw', count: 3 });
  assert.deepEqual(matchIntent('the tower reversed tarot meaning'), { type: 'meaning', kind: 'tarot-reversed', key: 'tower' });
  assert.deepEqual(matchIntent('Shani in my 7th house'), { type: 'meaning', kind: 'graha-house', key: 'saturn:7' });
  assert.deepEqual(matchIntent('moon in leo'), { type: 'meaning', kind: 'graha-rashi', key: 'moon:simha' });
  assert.deepEqual(matchIntent('rohini nakshatra'), { type: 'meaning', kind: 'nakshatra', key: 'rohini' });
  assert.deepEqual(matchIntent('Explain my kundli'), { type: 'needs-chart' });
  assert.deepEqual(matchIntent('aaj ka rashifal'), { type: 'daily-horoscope' });
  assert.equal(matchIntent('What does the Gita say about anxiety?'), undefined);
  assert.equal(matchIntent('is sade sati bad'), undefined);
});

test('weekly allowance refills on Monday, India time', () => {
  // Sunday 23:00 IST and Monday 00:30 IST fall in different weeks.
  const sundayLate = Date.parse('2026-11-15T17:30:00Z');
  const mondayEarly = Date.parse('2026-11-15T19:00:00Z');
  assert.equal(istDate(sundayLate), '2026-11-15');
  assert.equal(istDate(mondayEarly), '2026-11-16');
  assert.equal(weekStart(sundayLate), '2026-11-09');
  assert.equal(weekStart(mondayEarly), '2026-11-16');
  assert.deepEqual(planFor('starter', mondayEarly), { kind: 'starter', limit: 11, period: 'w:2026-11-16' });
  assert.equal(planFor('premium', mondayEarly).limit, null);
  assert.equal(planFor('guest', mondayEarly).limit, 3);
});

test('safety: crisis detection and content rules', () => {
  assert.ok(isCrisis('I want to die'));
  assert.ok(isCrisis('mujhe jeena nahi hai, marna chahta hoon'));
  assert.ok(isCrisis('मैं आत्महत्या के बारे में सोच रहा हूँ'));
  for (const msg of [
    'Mujhe jeene ka mann nahi karta',
    'jeene ki ichha nahi rahi',
    'I dont want to live anymore',
    'everyone would be better off dead without me',
    'khud ko khatam karna chahta hoon',
    'मुझे जीने का मन नहीं करता',
  ]) {
    assert.ok(isCrisis(msg), msg);
  }
  assert.ok(!isCrisis('what does the death card mean'));
  assert.ok(!isCrisis('I want to live a meaningful life'));
  assert.ok(!isCrisis('Saturn in the 8th house and fear of death'));
  assert.deepEqual(contentProblems('Saturn here is traditionally linked with patience.'), []);
  assert.ok(contentProblems('You will die young').length);
  assert.ok(contentProblems('This rudraksha cures anxiety').length);
  assert.ok(contentProblems('Buy a gemstone to fix this').length);
  assert.deepEqual(meaningProblems('The Death card is about endings of a chapter and making room for change. '.repeat(3), { kind: 'tarot-upright', title: 'Death (upright)' }), []);
});

test('vectors: blob round trip and ranking', () => {
  const v = [0.1, -0.2, 0.3];
  assert.deepEqual([...fromBlob(toBlob(v))].map((x) => Number(x.toFixed(4))), v);
  assert.ok(Math.abs(cosine([1, 0], [1, 0]) - 1) < 1e-9);
  const hits = topK([1, 0], [{ id: 'a', vector: [0, 1] }, { id: 'b', vector: [1, 0.1] }, { id: 'c', vector: [1, 1] }], 2, 0.5);
  assert.deepEqual(hits.map((h) => h.id), ['b', 'c']);
});

test('the meaning library covers every placement and card', () => {
  const entries = libraryEntries();
  assert.equal(entries.length, 432);
  assert.equal(new Set(entries.map((e) => `${e.kind}/${e.key}`)).size, 432);
});
