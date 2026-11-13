/**
 * Layer 1: questions Kosmik can answer without any AI. Pure parsing: returns what was asked
 * for, and the pipeline fetches the answer from the libraries.
 */
import { GRAHAS, NAKSHATRAS, RASHIS, TAROT } from './catalog.ts';
import { normalizeQuestion } from './text.ts';

export type Intent =
  | { type: 'verse'; chapter: number; verse: number }
  | { type: 'verse-of-the-day' }
  | { type: 'tarot-draw'; count: 1 | 3 }
  | { type: 'meaning'; kind: string; key: string }
  | { type: 'needs-chart' }
  | { type: 'palm' }
  | { type: 'daily-horoscope' };

const ORDINAL_WORDS: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12,
  pehla: 1, pehle: 1, doosra: 2, dusra: 2, teesra: 3, tisra: 3, chautha: 4, panchva: 5, panchwa: 5, chhatha: 6, satva: 7, satwa: 7,
  athva: 8, aathva: 8, nauva: 9, dasva: 10, daswa: 10, gyarahva: 11, barahva: 12,
};

/** Finds the first alias of any item mentioned as a whole word. */
function findAlias<T extends { aliases: string[] }>(items: T[], text: string): T | undefined {
  let best: { item: T; at: number } | undefined;
  for (const item of items)
    for (const alias of item.aliases) {
      const re = new RegExp(`(^|[^\\p{L}\\p{M}])${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{M}])`, 'u');
      const m = re.exec(text);
      if (m && (!best || m.index < best.at)) best = { item, at: m.index };
    }
  return best?.item;
}

function houseNumber(text: string): number | undefined {
  const digit = /\b(1[0-2]|[1-9])\s*(st|nd|rd|th|va|wa|vaan|wan)?\s*(house|bhava|bhav|ghar)\b|(?:house|bhava|bhav|ghar)\s*(?:no\.?\s*|number\s*)?(1[0-2]|[1-9])\b|([१-९]|१[०-२])\s*(?:वें|वां|वा)?\s*(?:भाव|घर)/u.exec(text);
  if (digit) {
    const raw = digit[1] ?? digit[4] ?? digit[5];
    const n = Number(raw.replace(/[०-९]/g, (d) => String('०१२३४५६७८९'.indexOf(d))));
    return n >= 1 && n <= 12 ? n : undefined;
  }
  const word = /\b([a-z]+)\s+(house|bhava|bhav|ghar)\b/.exec(text);
  return word ? ORDINAL_WORDS[word[1]] : undefined;
}

function tarotCard(text: string): { key: string; reversed: boolean } | undefined {
  const reversed = /\breversed?\b|\bulta\b|\bupside down\b/.test(text);
  // Longest names first so "king of cups" wins over "the king".
  const cards = [...TAROT].sort((a, b) => b.name.length - a.name.length);
  for (const c of cards) {
    const name = c.name.toLowerCase();
    const bare = name.replace(/^the /, '');
    if (text.includes(name) || (c.arcana === 'major' && new RegExp(`\\b${bare}\\b`).test(text) && /\btarot|card\b/.test(text))) {
      return { key: c.key, reversed };
    }
  }
  return undefined;
}

/** Needs the asker's own birth chart: kundli readings, timing predictions, "my future". */
/** Palmistry: read from the person's saved palm photos. */
const PALM = /\b(palm|palms|palmistry|hast ?rekha|hastrekha|life ?line|heart ?line|head ?line|fate ?line|marriage ?line|(haath|hath|hatheli) ki (rekha|rekhayen|lakeer|lakeeren))\b|हस्तरेखा|हथेली|हाथ की रेखा/;

const PERSONAL = /\b(my|meri|mera|mere|mujhe|mujhko)\b.*\b(kundli|kundali|janam kundli|birth chart|chart|horoscope|lagna|ascendant|dasha|mahadasha|future|bhavishya|rashi|raashi|nakshatra|moon sign|sun sign|zodiac|planets|grah|graha|grahon|houses)\b|\bwhen will (i|my)\b|\bkab (hogi|hoga|milegi|milega)\b|मेरी कुंडली|मेरा भविष्य/;

export function matchIntent(question: string): Intent | undefined {
  const text = normalizeQuestion(question);
  if (!text) return undefined;

  const ref =
    /\b(?:bg|gita|geeta|bhagavad gita|bhagwad geeta|bhagavad geeta|bhagwat geeta)\s*(?:chapter|ch|adhyay|adhyaya)?\s*(\d{1,2})\s*(?:verse|v|shlok|shloka|sloka)?\s*(\d{1,2})\b/.exec(text) ??
    /\bchapter\s*(\d{1,2})\s*(?:verse|shlok|shloka|sloka)\s*(\d{1,2})\b/.exec(text) ??
    /(?:गीता)\s*(?:अध्याय)?\s*(\d{1,2}|[०-९]{1,2})\s*(?:श्लोक)?\s*(\d{1,2}|[०-९]{1,2})/.exec(text);
  if (ref) {
    const num = (s: string) => Number(s.replace(/[०-९]/g, (d) => String('०१२३४५६७८९'.indexOf(d))));
    return { type: 'verse', chapter: num(ref[1]), verse: num(ref[2]) };
  }
  if (/\b(verse|shlok|shloka) (of the day|for today)\b|\baaj ka (shlok|shloka|verse)\b|\btodays? verse\b|आज का श्लोक/.test(text)) return { type: 'verse-of-the-day' };

  if (/\b(tarot|card|cards)\b/.test(text) && /\b(pull|draw|pick|give|do|reading|spread|nikalo|nikaalo)\b/.test(text) && !tarotCard(text)) {
    return { type: 'tarot-draw', count: /\b(3|three|teen|past present future)\b/.test(text) ? 3 : 1 };
  }
  if (/\b(daily card|card of the day|aaj ka card)\b/.test(text)) return { type: 'tarot-draw', count: 1 };

  const card = tarotCard(text);
  if (card) return { type: 'meaning', kind: card.reversed ? 'tarot-reversed' : 'tarot-upright', key: card.key };

  if (/\b(aaj ka|today'?s|daily|weekly|kal ka)\s+(rashifal|horoscope)\b|\brashifal\b|राशिफल/.test(text)) return { type: 'daily-horoscope' };

  // A named placement is answered from the library even when the question is personal
  // ("Saturn in my 7th house"): the meaning is the same for everyone with that placement.
  const graha = findAlias(GRAHAS, text);
  const house = houseNumber(text);
  if (graha && house) return { type: 'meaning', kind: 'graha-house', key: `${graha.key}:${house}` };
  const rashi = findAlias(RASHIS, text);
  if (graha && rashi) return { type: 'meaning', kind: 'graha-rashi', key: `${graha.key}:${rashi.key}` };

  if (PALM.test(text)) return { type: 'palm' };
  if (PERSONAL.test(text)) return { type: 'needs-chart' };

  const words = text.split(' ').length;
  const nakshatra = findAlias(NAKSHATRAS, text);
  if (nakshatra && (/\b(nakshatra|nakshatram|star)\b|नक्षत्र/.test(text) || words <= 3)) return { type: 'meaning', kind: 'nakshatra', key: nakshatra.key };
  if (rashi && (/\b(rashi|raashi|sign|zodiac)\b|राशि/.test(text) || words <= 3)) return { type: 'meaning', kind: 'rashi', key: rashi.key };
  if (house && !graha && words <= 8) return { type: 'meaning', kind: 'house', key: String(house) };
  if (graha && words <= 6 && /\b(planet|graha|meaning|mean|means|signify|represent|kya hai|about)\b|ग्रह/.test(text)) return { type: 'meaning', kind: 'graha', key: graha.key };
  return undefined;
}
