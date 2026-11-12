/**
 * Builds data/verses.json from the public-domain gita/gita dataset (github.com/gita/gita).
 *
 * Kept: the Sanskrit text, and two English translations that are public domain in India
 * (author's life + 60 years): Swami Sivananda (d. 1963) and Shri Purohit Swami (d. 1941).
 * Not kept: the dataset's transliteration and word meanings (they look copied from a
 * copyrighted site) and every other translation (still in copyright). IAST is generated here.
 *
 * Usage: node data/scripts/build-verses.ts <path-to-gita/data>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { toIAST } from '../../api/src/lib/iast.ts';

type RawVerse = { id: number; chapter_number: number; verse_number: number; text: string };
type RawTranslation = { authorName: string; verse_id: number; description: string };

export type Verse = {
  ref: string;
  work: 'Bhagavad Gita';
  chapter: number;
  verse: number;
  sanskrit: string;
  iast: string;
  translation: string;
  translator: string;
  translationAlt: string;
  translatorAlt: string;
};

const PRIMARY = 'Swami Sivananda';
const SECONDARY = 'Shri Purohit Swami';

export function cleanSanskrit(text: string): string {
  return text
    .replace(/।।\s*\d+\.\d+\s*।।/g, ' ॥')
    .replace(/।।/g, '॥')
    .replace(/\s*([।॥])/g, ' $1')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n');
}

function main() {
  const dir = process.argv[2];
  if (!dir) throw new Error('Pass the path to the gita/gita data folder');
  const verses: RawVerse[] = JSON.parse(readFileSync(join(dir, 'verse.json'), 'utf8'));
  const translations: RawTranslation[] = JSON.parse(readFileSync(join(dir, 'translation.json'), 'utf8'));
  const byVerse = new Map<number, Record<string, string>>();
  for (const t of translations) {
    if (t.authorName !== PRIMARY && t.authorName !== SECONDARY) continue;
    const entry = byVerse.get(t.verse_id) ?? {};
    entry[t.authorName] = t.description.trim();
    byVerse.set(t.verse_id, entry);
  }

  const out: Verse[] = verses
    .sort((a, b) => a.chapter_number - b.chapter_number || a.verse_number - b.verse_number)
    .map((v) => {
      const sanskrit = cleanSanskrit(v.text);
      const t = byVerse.get(v.id) ?? {};
      if (!t[PRIMARY] || !t[SECONDARY]) throw new Error(`Missing translation for ${v.chapter_number}.${v.verse_number}`);
      return {
        ref: `BG ${v.chapter_number}.${v.verse_number}`,
        work: 'Bhagavad Gita',
        chapter: v.chapter_number,
        verse: v.verse_number,
        sanskrit,
        iast: toIAST(sanskrit),
        translation: t[PRIMARY],
        translator: PRIMARY,
        translationAlt: t[SECONDARY],
        translatorAlt: SECONDARY,
      };
    });

  writeFileSync(new URL('../verses.json', import.meta.url), JSON.stringify(out, null, 1) + '\n');
  console.log(`Wrote ${out.length} verses`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
