import assert from 'node:assert/strict';
import { test } from 'node:test';

import { prefilter, romanToInt, splitMahabharata } from './passages.ts';

const long = (s: string) => `${s} ${'and the wise man bore it with a steady mind '.repeat(8)}`.trim();

const SAMPLE = [
  'The Project Gutenberg eBook header',
  '*** START OF THE PROJECT GUTENBERG EBOOK THE MAHABHARATA ***',
  'BOOK 5',
  'UDYOGA PARVA',
  '',
  'SECTION XXXIII',
  '',
  long('Vidura said, "Grief destroyeth beauty; grief destroyeth strength;'),
  'grief destroyeth understanding.',
  '',
  'Too short to keep.',
  '',
  'BOOK 11',
  'Stri-parva',
  '1',
  '',
  long('Vidura said, "All that is gathered is lost; the end of union is separation; why then grieve?'),
  '',
  '*** END OF THE PROJECT GUTENBERG EBOOK ***',
  long('After the end marker: never a passage.'),
].join('\r\n');

test('roman section numbers', () => {
  assert.equal(romanToInt('XXXIII'), 33);
  assert.equal(romanToInt('CCCXIII'), 313);
  assert.equal(romanToInt('XL'), 40);
});

test('the Mahabharata is split into passages with book, section and paragraph, wording kept', () => {
  const ps = splitMahabharata(SAMPLE);
  assert.deepEqual(ps.map((p) => p.ref), ['MBh 5.33.1', 'MBh 11.1.1']);
  assert.equal(ps[0].location, 'Udyoga Parva, section 33');
  assert.equal(ps[1].location, 'Stri Parva, section 1');
  assert.ok(ps[0].text.startsWith('Vidura said, "Grief destroyeth beauty; grief destroyeth strength;'));
  assert.ok(ps[0].text.endsWith('grief destroyeth understanding.'), 'lines of one paragraph are joined');
  assert.ok(!/\s{2,}|\r|\n/.test(ps[0].text), 'only whitespace is normalised');
  assert.ok(ps.every((p) => p.work === 'Mahabharata' && p.translator === 'Kisari Mohan Ganguli'));
});

test('prefilter keeps passages that speak to pain, and ranks the consoling books first', () => {
  const ps = splitMahabharata(SAMPLE);
  const battle = { ...ps[0], ref: 'MBh 7.1.1', location: 'Drona Parva, section 1', text: long('The warriors struck with arrows and maces on the field.') };
  const kept = prefilter([battle, ...ps], 10);
  assert.deepEqual(kept.map((p) => p.ref), ['MBh 11.1.1', 'MBh 5.33.1']);
  assert.ok(kept[0].themes.includes('grief') && kept[0].themes.includes('separation'));
});

test('a long paragraph is cut at sentence ends into parts a, b, c…, none over 260 words, nothing lost', () => {
  const sentence = 'The wise one, O king, never grieveth for what is gone, for all that is gathered endeth in loss. ';
  const para = sentence.repeat(30).trim(); // 30 sentences of 19 words = 570 words
  const raw = ['*** START OF X ***', 'BOOK 11', '', 'SECTION II', '', para, '', '*** END OF X ***'].join('\n');
  const ps = splitMahabharata(raw);
  assert.deepEqual(ps.map((p) => p.ref), ['MBh 11.2.1a', 'MBh 11.2.1b', 'MBh 11.2.1c']);
  assert.ok(ps.every((p) => p.text.split(' ').length <= 260 && /\.$/.test(p.text)));
  assert.equal(ps.map((p) => p.text).join(' '), para);
});

test('picks from the model: only ids it was given, only known themes, score 1-5', async () => {
  const { parsePicks } = await import('./passages.ts');
  const given = ['MBh 11.2.1a', 'MBh 5.33.4'];
  const out = parsePicks('{"picks": [{"id": "MBh 11.2.1a", "score": 5, "themes": ["grief", "made-up"]}, {"id": "MBh 9.9.9", "score": 5, "themes": ["grief"]}, {"id": "MBh 5.33.4", "score": 9, "themes": ["anger"]}]}', given);
  assert.deepEqual(out, [{ id: 'MBh 11.2.1a', score: 5, themes: ['grief'] }]);
  assert.deepEqual(parsePicks('not json', given), []);
});

test('Ramayana: cantos after the contents, verse lines kept, footnote marks dropped, ~200-word passages', async () => {
  const { splitRamayana } = await import('./passages.ts');
  const lines = (n: number, w: string) => Array.from({ length: n }, (_, i) => `${w} line ${i} of sorrow and of hope,${i % 4 === 3 ? '.' : ''}`);
  const raw = [
    '*** START OF X ***', 'BOOK I.', 'Canto I. Contents only.', '', 'BOOK II.(3)', 'Canto XL. Ráma’s Departure.(9)', '', '',
    ...lines(40, 'Then Ráma(4)'), '', 'Canto XLI. The Women’s Lament.', '', ...lines(12, 'They wept'), '*** END OF X ***',
  ].join('\n');
  const ps = splitRamayana(raw);
  assert.deepEqual(ps.map((p) => p.ref), ['Ram 2.40.1', 'Ram 2.40.2', 'Ram 2.41.1']);
  assert.equal(ps[0].location, 'Ayodhya Kanda, canto 40: Ráma’s Departure');
  assert.ok(ps[0].text.startsWith('Then Ráma line 0 of sorrow and of hope,\nThen Ráma line 1'), 'line breaks kept, marks gone');
  assert.ok(ps.every((p) => p.work === 'Ramayana' && p.translator === 'Ralph T. H. Griffith' && p.text.split(/\s+/).length <= 260));
});

test('Upanishads (Paramananda): each verse with its commentary, by Upanishad, part and verse', async () => {
  const { splitUpanishads } = await import('./passages.ts');
  const verse = 'The Self is not born, nor does It die. It did not spring from anything, nor did anything spring from It. This Ancient One is unborn, eternal, everlasting.';
  const note = 'When the body is destroyed, the Self is not destroyed. '.repeat(6).trim();
  const raw = ['*** START OF X ***', '            Katha-Upanishad', '', '              Part Second', '', 'XVIII', '', verse, '', note, '', '', 'XIX', '', 'Too short.', '*** END OF X ***'].join('\n');
  const ps = splitUpanishads(raw);
  assert.deepEqual(ps.map((p) => p.ref), ['Up Katha.2.18']);
  assert.equal(ps[0].location, 'Katha Upanishad, part 2, verse 18');
  assert.equal(ps[0].text, `${verse}\n\n${note}`);
  assert.equal(ps[0].translator, 'Swami Paramananda');
});

test('Yoga Vasishtha: numbered verses grouped by chapter; page numbers and running heads dropped', async () => {
  const { splitYogaVasishtha } = await import('./passages.ts');
  const v = (n: number) => `${n}. He who knoweth the soul grieveth not for the body, as the wise man mourneth not for a cloud that is passing away from the sky.`;
  const raw = ['CHAPTER VI.', '', 'Argument:--The wise grieve not.', '', ...[1, 2, 3, 4, 5].flatMap((n) => [v(n), '']), '40', '', 'YOGA VAsrsnTiiA.', '', v(6), '', 'CHAPTER VII.', '', v(1)].join('\n');
  const ps = splitYogaVasishtha(raw, '3b');
  assert.deepEqual(ps.map((p) => p.ref), ['YV 3b.6.1']);
  assert.equal(ps[0].location, 'Yoga Vasishtha, vol. 3b, chapter 6, verses 1–6');
  assert.ok(!/YOGA|\b40\b/.test(ps[0].text));
});

test('scanned text: a passage with misspelt words is dropped; names and archaic words are fine', async () => {
  const { readable } = await import('./passages.ts');
  const dict = new Set(['the', 'and', 'of', 'to', 'well', 'point', 'more', 'clearly', 'we', 'will', 'cite', 'argument', 'serve', 'prove', 'illustrate', 'this', 'yogi', 'thou', 'art']);
  assert.ok(readable('Thou art the yogi, and we will cite the argument of Plotinus to prove this point more clearly.', dict));
  assert.ok(!readable('But to illustiate this point moie cleaily we will cite the argument to piove the ele-', dict));
  assert.ok(!readable('the  argument  of  Ya^lavalkya  Brahma;/as', dict));
});

test('scanned text: no unknown word, stray letter or broken verse number is let through', async () => {
  const { readable } = await import('./passages.ts');
  const dict = new Set(['the', 'mind', 'by', 'its', 'restless', 'desires', 'hastens', 'itself', 'to', 'painful', 'death', 'that', 'is', 'purified', 'reason']);
  assert.ok(!readable('The mind by its restless desires hastens itself to o painful death', dict), 'stray "o"');
  assert.ok(!readable('The mind by its restless desires. 38, The mind that is purified by reason', dict), '"38," is a broken verse number');
  assert.ok(!readable('The mind by its restless desires hastens itself to painfull death', dict), 'one unknown word');
});

test('Yoga Vasishtha scans: chapter headings with doubled spaces are found', async () => {
  const { splitYogaVasishtha } = await import('./passages.ts');
  const v = (n: number) => `${n}.  He  who  knoweth  the  soul  grieveth  not  for  the  body,  as  the  wise  man  mourneth  not  for  a  cloud  passing  away  from  the  sky.`;
  const ps = splitYogaVasishtha(['CHAPTER  XXIV.', '', ...[1, 2, 3, 4, 5, 6].flatMap((n) => [v(n), ''])].join('\n'), '4');
  assert.deepEqual(ps.map((p) => p.ref), ['YV 4.24.1']);
});

test('Upanishads: a short verse with a short note is kept from 30 words', async () => {
  const { splitUpanishads } = await import('./passages.ts');
  const verse = 'He who sees all beings in the Self and the Self in all beings, he never turns away from It.';
  const note = 'Such a one fears nothing and hates no one, for he sees only God.';
  const ps = splitUpanishads(['Isa-Upanishad', '', 'VI', '', verse, '', note].join('\n'));
  assert.deepEqual(ps.map((p) => p.ref), ['Up Isa.6']);
});

test('vocabulary: every lowercase word of the clean texts joins the dictionary', async () => {
  const { vocabulary, readable } = await import('./passages.ts');
  const dict = vocabulary(['the', 'mind'], ['Thou hast seen the bodies of men; colours fade.']);
  assert.ok(readable('the bodies fade, thou hast seen the colours of the mind', dict));
  assert.ok(!readable('the bodies fade inorder', dict));
});

test('scans: words split at line ends are joined; garbled capitals are caught', async () => {
  const { readable, splitYogaVasishtha } = await import('./passages.ts');
  const dict = new Set(['the', 'needle', 'hurts', 'no', 'body', 'but', 'does', 'good', 'in', 'clothing', 'remorse']);
  assert.ok(!readable('Remorse or SUcui. the needle', dict));
  assert.ok(!readable('ASISHTHA CONTINUED the needle', dict));
  const raw = ['CHAPTER II.', '', `1. The needle hurts no body but does good in cloth-`, `ing ${'and the wise man bore it with a steady mind '.repeat(6)}.`].join('\n');
  assert.match(splitYogaVasishtha(raw, '2')[0].text, /good in clothing and/);
});

test('prefilter can keep passages with fewer themes (short Upanishad verses)', () => {
  const p = { ref: 'Up Isa.6', work: 'Upanishads', location: 'Isa Upanishad, verse 6', text: 'He who sees all beings in the Self never turns away; such a one has no fear.', translator: 'Swami Paramananda' };
  assert.equal(prefilter([p], 10).length, 0);
  assert.equal(prefilter([p], 10, 0).length, 1);
});
