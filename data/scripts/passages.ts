/**
 * Shanti's passages library, step one: split public-domain translations into passages and keep the
 * ones that speak to pain (grief, separation, betrayal, failure, fear, loneliness, anger, letting go).
 * The wording is never changed: only whitespace is normalised. Gemini later picks the best of these
 * (build-passages.ts), and a person reviews them (`reviewed`).
 */

export type Candidate = { ref: string; work: string; location: string; text: string; translator: string };
export type Ranked = Candidate & { themes: string[]; score: number };

/** The eighteen books (parvas) of the Mahabharata, in order. */
export const PARVAS = [
  'Adi', 'Sabha', 'Vana', 'Virata', 'Udyoga', 'Bhishma', 'Drona', 'Karna', 'Shalya', 'Sauptika', 'Stri', 'Shanti', 'Anushasana', 'Ashvamedhika', 'Ashramavasika', 'Mausala', 'Mahaprasthanika', 'Svargarohana',
];

const ROMAN: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };

export function romanToInt(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const v = ROMAN[s[i]];
    const next = ROMAN[s[i + 1]] ?? 0;
    n += v < next ? -v : v;
  }
  return n;
}

const MIN_WORDS = 50;
const MAX_WORDS = 260;

const TARGET_WORDS = 220;

/** A paragraph over 260 words, cut at sentence ends into parts of about 220 words. Wording unchanged. */
function chunks(body: string): string[] {
  if (body.split(' ').length <= MAX_WORDS) return [body];
  const sentences = body.split(/(?<=[.!?]['"\u201d\u2019)]*)\s+/);
  const out: string[] = [];
  let cur: string[] = [];
  let n = 0;
  for (const sentence of sentences) {
    const w = sentence.split(' ').length;
    if (cur.length && n + w > TARGET_WORDS) {
      out.push(cur.join(' '));
      cur = [];
      n = 0;
    }
    cur.push(sentence);
    n += w;
  }
  if (cur.length) {
    const last = cur.join(' ');
    // A short tail joins the part before it when they fit together.
    if (out.length && n < MIN_WORDS && out[out.length - 1].split(' ').length + n <= MAX_WORDS) out[out.length - 1] += ` ${last}`;
    else out.push(last);
  }
  return out;
}

/**
 * Splits Ganguli's Mahabharata (the Project Gutenberg text) into passages: one per paragraph of
 * 50 to 260 words, with the ref "MBh <book>.<section>.<paragraph>" (longer paragraphs are cut at
 * sentence ends into parts a, b, c…). Paragraphs are counted within their section, short ones
 * included, so a ref stays the same whatever is kept.
 */
export function splitMahabharata(raw: string): Candidate[] {
  let text = raw.replace(/\r/g, '');
  const start = text.indexOf('*** START OF');
  if (start >= 0) text = text.slice(text.indexOf('\n', start) + 1);
  const end = text.indexOf('*** END OF');
  if (end >= 0) text = text.slice(0, end);

  const out: Candidate[] = [];
  let book = 0;
  let section = 0;
  let para = 0;
  let lines: string[] = [];
  const flush = () => {
    if (!lines.length) return;
    const body = lines.join(' ').replace(/\s+/g, ' ').trim();
    lines = [];
    if (!book || !section) return;
    para++;
    const parts = chunks(body);
    parts.forEach((part, i) => {
      const words = part.split(' ').length;
      if (words < MIN_WORDS || words > MAX_WORDS) return;
      const suffix = parts.length > 1 ? String.fromCharCode(97 + i) : '';
      out.push({ ref: `MBh ${book}.${section}.${para}${suffix}`, work: 'Mahabharata', location: `${PARVAS[book - 1]} Parva, section ${section}`, text: part, translator: 'Kisari Mohan Ganguli' });
    });
  };
  for (const line of text.split('\n')) {
    const t = line.trim();
    const b = /^BOOK (\d{1,2})$/.exec(t);
    const roman = /^SECTION ([IVXLCDM]+)$/.exec(t);
    const arabic = book >= 8 && book <= 11 ? /^(\d{1,3})$/.exec(t) : null;
    if (b || roman || arabic) {
      flush();
      if (b) {
        book = Number(b[1]);
        section = 0;
      } else {
        section = roman ? romanToInt(roman[1]) : Number(arabic![1]);
      }
      para = 0;
      continue;
    }
    if (!t) flush();
    else if (section) lines.push(t);
  }
  flush();
  return out;
}

/** Words that show a passage speaks to a kind of pain, by theme. */
const THEMES: [string, RegExp][] = [
  ['grief', /\b(grie(f|ve|veth|ving|ved)|sorrow\w*|mourn\w*|lament\w*|weep\w*|tears)\b/gi],
  ['death of a loved one', /\b(death|dead|die(th|s)?|slain|perish\w*|mortal\w*)\b/gi],
  ['separation', /\b(separat\w*|union|parted|parting|gathered|meet(ing)? again)\b/gi],
  ['letting go', /\b(attach\w*|desire\w*|renounc\w*|contentment|content|equanim\w*|tranquil\w*|peace)\b/gi],
  ['anger', /\b(anger|wrath|rage|forgiv\w*|forgiveness)\b/gi],
  ['fear', /\b(fear\w*|anxi\w*|dread)\b/gi],
  ['failure', /\b(adversity|misfortune|calamit\w*|reverse[sd]?|prosperity|exertion|patience)\b/gi],
  ['betrayal', /\b(deceiv\w*|deceit\w*|betray\w*|treacher\w*|false friend\w*)\b/gi],
  ['loneliness', /\b(alone|solitary|friendless|forsaken|abandon\w*)\b/gi],
  ['self-worth', /\b(self-respect|wisdom|wise|virtue|righteous\w*)\b/gi],
];

/** Books that are mostly counsel and consolation, not battle: Vana, Udyoga, Stri, Shanti, Anushasana. */
const CONSOLING = new Set([3, 5, 11, 12, 13]);

/** Keeps the `limit` passages that speak most to pain, with their themes, the consoling books first. */
export function prefilter(candidates: Candidate[], limit: number, minThemes = 2): Ranked[] {
  const ranked: Ranked[] = [];
  for (const c of candidates) {
    const themes: string[] = [];
    let hits = 0;
    for (const [name, re] of THEMES) {
      const n = c.text.match(re)?.length ?? 0;
      if (n) themes.push(name);
      hits += n;
    }
    if (themes.length < minThemes) continue;
    const book = Number(/^MBh (\d+)\./.exec(c.ref)?.[1] ?? 0);
    const score = hits + themes.length * 2 + (CONSOLING.has(book) ? 6 : 0);
    ranked.push({ ...c, themes, score });
  }
  return ranked.sort((a, b) => b.score - a.score || a.ref.localeCompare(b.ref)).slice(0, limit);
}

/** Theme names a passage can carry (shown to the model, and kept with each passage). */
export const THEME_NAMES = THEMES.map(([name]) => name);

export type Pick = { id: string; score: number; themes: string[] };

/** The model's picks, keeping only ids it was given, known themes, and scores from 1 to 5. */
export function parsePicks(raw: string, given: string[]): Pick[] {
  let o: { picks?: unknown };
  try {
    o = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
  } catch {
    return [];
  }
  const ids = new Set(given);
  return (Array.isArray(o.picks) ? o.picks : []).flatMap((p: { id?: unknown; score?: unknown; themes?: unknown }) => {
    if (typeof p?.id !== 'string' || !ids.has(p.id) || typeof p.score !== 'number' || p.score < 1 || p.score > 5) return [];
    const themes = Array.isArray(p.themes) ? p.themes.filter((t): t is string => typeof t === 'string' && THEME_NAMES.includes(t)) : [];
    return [{ id: p.id, score: p.score, themes }];
  });
}

const TARGET_GROUP = 150;
const lines = (raw: string) => {
  let text = raw.replace(/\r/g, '');
  const start = text.indexOf('*** START OF');
  if (start >= 0) text = text.slice(text.indexOf('\n', start) + 1);
  const end = text.indexOf('*** END OF');
  if (end >= 0) text = text.slice(0, end);
  return text.split('\n');
};
const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;

/** Groups units (lines or verses) into passages of about 150 words, ending where a sentence ends. */
function group<T extends { text: string }>(units: T[], join: string, sentenceEnd: (u: T) => boolean): T[][] {
  const out: T[][] = [];
  let cur: T[] = [];
  let n = 0;
  for (const u of units) {
    cur.push(u);
    n += wordCount(u.text);
    if ((n >= TARGET_GROUP && sentenceEnd(u)) || n >= TARGET_WORDS) {
      out.push(cur);
      cur = [];
      n = 0;
    }
  }
  if (cur.length) {
    const prev = out[out.length - 1];
    if (prev && n < MIN_WORDS && wordCount(prev.map((u) => u.text).join(join)) + n <= MAX_WORDS) prev.push(...cur);
    else out.push(cur);
  }
  return out.filter((g) => {
    const w = wordCount(g.map((u) => u.text).join(join));
    return w >= MIN_WORDS && w <= MAX_WORDS;
  });
}

const KANDAS = ['Bala', 'Ayodhya', 'Aranya', 'Kishkindha', 'Sundara', 'Yuddha'];
const SENTENCE_END = /[.!?]["'”’)]*$/;

/** Griffith's Ramayana (verse): passages of whole lines within a canto, line breaks kept. */
export function splitRamayana(raw: string): Candidate[] {
  const out: Candidate[] = [];
  let book = 0;
  let canto = 0;
  let title = '';
  let buf: { text: string }[] = [];
  const flush = () => {
    if (book && canto && buf.length) {
      group(buf, '\n', (u) => SENTENCE_END.test(u.text)).forEach((g, i) => {
        out.push({ ref: `Ram ${book}.${canto}.${i + 1}`, work: 'Ramayana', location: `${KANDAS[book - 1] ?? `Book ${book}`} Kanda, canto ${canto}: ${title}`, text: g.map((u) => u.text).join('\n'), translator: 'Ralph T. H. Griffith' });
      });
    }
    buf = [];
  };
  for (const line of lines(raw)) {
    const t = line.replace(/\(\d+\)/g, '').trimEnd();
    const b = /^BOOK ([IVX]+)\.$/i.exec(t.trim());
    const c = /^Canto ([IVXLC]+)\.\s*(.*)$/.exec(t.trim());
    if (b) {
      flush();
      book = romanToInt(b[1].toUpperCase());
      canto = 0;
    } else if (c) {
      flush();
      canto = romanToInt(c[1]);
      title = c[2].replace(/\.$/, '').trim();
    } else if (canto && t.trim()) buf.push({ text: t.trim() });
  }
  flush();
  return out;
}

const ORDINALS = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth'];

/** Paramananda's Upanishads: each verse with his commentary after it, kept whole while it fits. */
export function splitUpanishads(raw: string): Candidate[] {
  const out: Candidate[] = [];
  let name = '';
  let part = 0;
  let verse = 0;
  let paras: string[] = [];
  let para: string[] = [];
  const endPara = () => {
    if (para.length) paras.push(para.join(' ').replace(/\s+/g, ' ').trim());
    para = [];
  };
  const flush = () => {
    endPara();
    if (name && verse && paras.length) {
      const kept = [paras[0]];
      for (const p of paras.slice(1)) if (wordCount([...kept, p].join(' ')) <= MAX_WORDS) kept.push(p);
      const text = kept.join('\n\n');
      // Paramananda's verses are short: a verse and its note are kept from 30 words.
      if (wordCount(text) >= 30 && wordCount(text) <= MAX_WORDS) {
        out.push({
          ref: `Up ${name}.${part ? `${part}.` : ''}${verse}`,
          work: 'Upanishads',
          location: `${name} Upanishad, ${part ? `part ${part}, ` : ''}verse ${verse}`,
          text,
          translator: 'Swami Paramananda',
        });
      }
    }
    paras = [];
  };
  for (const line of lines(raw)) {
    const t = line.trim();
    const u = /^([A-Z][a-z]+)-Upanishad$/.exec(t);
    const p = /^Part (\w+)$/.exec(t);
    const v = /^([IVXLC]+)$/.exec(t);
    if (u) {
      flush();
      name = u[1];
      part = 0;
      verse = 0;
    } else if (p && ORDINALS.includes(p[1])) {
      flush();
      part = ORDINALS.indexOf(p[1]) + 1;
      verse = 0;
    } else if (v) {
      flush();
      verse = romanToInt(v[1]);
    } else if (/^Here ends/.test(t)) {
      flush();
      verse = 0;
    } else if (!t) endPara();
    else if (verse) para.push(t);
  }
  flush();
  return out;
}

/** A running head or page number in a scanned book: a short line mostly in capitals, or a bare number. */
const isPageFurniture = (t: string) => {
  if (/^\d{1,4}$/.test(t)) return true;
  const letters = t.replace(/[^A-Za-z]/g, '');
  return letters.length >= 4 && t.split(/\s+/).length <= 6 && letters.replace(/[^A-Z]/g, '').length / letters.length > 0.5;
};

/** Mitra's Yoga Vasishtha: numbered verses, grouped within a chapter. `vol` names the volume ("3b"). */
export function splitYogaVasishtha(raw: string, vol: string): Candidate[] {
  const out: Candidate[] = [];
  let chapter = 0;
  let verses: { n: number; text: string }[] = [];
  let cur: { n: number; lines: string[] } | null = null;
  const endVerse = () => {
    // A word the printer split at a line end ("cloth-" / "ing") is joined again.
    if (cur?.lines.length) verses.push({ n: cur.n, text: cur.lines.join('\n').replace(/(\p{Ll})-\n(\p{Ll})/gu, '$1$2').replace(/\s+/g, ' ').trim() });
    cur = null;
  };
  const flush = () => {
    endVerse();
    if (chapter) {
      for (const g of group(verses, '\n', (u) => SENTENCE_END.test(u.text))) {
        const first = g[0].n;
        const last = g[g.length - 1].n;
        out.push({
          ref: `YV ${vol}.${chapter}.${first}`,
          work: 'Yoga Vasishtha',
          location: `Yoga Vasishtha, vol. ${vol}, chapter ${chapter}, verses ${first}${last > first ? `–${last}` : ''}`,
          text: g.map((u) => u.text).join('\n'),
          translator: 'Vihari-Lala Mitra',
        });
      }
    }
    verses = [];
  };
  for (const line of lines(raw)) {
    // Scans double the spaces between words.
    const t = line.replace(/\s+/g, ' ').trim();
    const c = /^CHAPTER ([IVXLC]+)\.?$/.exec(t);
    if (c) {
      flush();
      chapter = romanToInt(c[1]);
      cur = { n: 1, lines: [] };
      continue;
    }
    if (!chapter || !t || /^Argument/.test(t) || isPageFurniture(t)) continue;
    const num = /^(\d{1,3})\.\s+(.*)$/.exec(t);
    if (num) {
      endVerse();
      cur = { n: Number(num[1]), lines: [num[0]] };
    } else if (cur) cur.lines.push(t);
    else cur = { n: 1, lines: [t] };
  }
  flush();
  return out;
}

const STEMS: [RegExp, string][] = [
  [/'s$/, ''], [/s$/, ''], [/es$/, ''], [/ed$/, ''], [/d$/, ''], [/ing$/, ''], [/ing$/, 'e'], [/eth$/, ''], [/eth$/, 'e'], [/est$/, ''], [/est$/, 'e'], [/ly$/, ''], [/st$/, ''], [/th$/, ''],
];

/**
 * Whether scanned (OCR) text reads cleanly enough to quote word for word: no symbols inside words,
 * no stray single letters or broken verse numbers ("38,"), and no lowercase word unknown to the
 * dictionary (capitalised names are not checked).
 */
export function readable(text: string, dict: Set<string>): boolean {
  if (/(^|\s)\d+,\s/.test(text)) return false;
  const tokens = text.split(/\s+/).filter(Boolean);
  let bad = 0;
  for (const tok of tokens) {
    const w = tok.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
    if (!w) continue;
    if (/[^\p{L}'’-]/u.test(w)) {
      bad++;
      continue;
    }
    // Garbled capitals from a scan: "SUcui", "ASISHTHA" (small capitals read badly).
    if (/\p{Lu}{2,}\p{Ll}|\p{Ll}\p{Lu}|^\p{Lu}{4,}$/u.test(w)) {
      bad++;
      continue;
    }
    if (/^\p{Ll}$/u.test(w) && w !== 'a') {
      bad++;
      continue;
    }
    if (!/^\p{Ll}/u.test(w) || w.length < 3) continue;
    const lower = w.toLowerCase().replace(/’/g, "'");
    const known = lower.split('-').every((part) => !part || dict.has(part) || STEMS.some(([re, add]) => re.test(part) && dict.has(part.replace(re, add))));
    if (!known) bad++;
  }
  return bad === 0;
}

/** A dictionary for `readable`: a word list plus every word in texts known to be clean. */
export function vocabulary(words: string[], cleanTexts: string[]): Set<string> {
  const dict = new Set(words.map((w) => w.toLowerCase()));
  for (const t of cleanTexts) for (const m of t.toLowerCase().matchAll(/\p{L}+(?:['’]\p{L}+)?/gu)) dict.add(m[0].replace(/’/g, "'"));
  return dict;
}
