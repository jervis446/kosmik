/** Question text helpers: normalising for the exact-match cache, language, hashing. */

export type Lang = 'en' | 'hi' | 'hinglish';
export const LANGS: Lang[] = ['en', 'hi', 'hinglish'];

const FILLER_START = /^(please|pls|plz|kindly|hey|hi|hello|namaste|can you|could you|tell me|explain|batao|bataiye|bataye)\b\s*/;
const FILLER_END = /\s*\b(please|pls|plz|batao|bataiye|bataye)$/;

/** Lowercase, Unicode-normalised, punctuation-free, single-spaced, without polite filler. */
export function normalizeQuestion(text: string): string {
  let t = text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[^\p{L}\p{N}\p{M}\s']/gu, ' ')
    .replace(/'/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  for (let i = 0; i < 3; i++) t = t.replace(FILLER_START, '').replace(FILLER_END, '').trim();
  return t;
}

const HINGLISH_WORDS = new Set([
  'kya', 'hai', 'hain', 'mera', 'meri', 'mere', 'mujhe', 'kaise', 'kaisa', 'kyu', 'kyun', 'kab', 'aaj', 'ka', 'ki', 'ke', 'nahi', 'nahin',
  'hota', 'hoti', 'karna', 'karu', 'karoon', 'kar', 'batao', 'acha', 'accha', 'bhi', 'aur', 'ko', 'se', 'mein', 'liye', 'wala', 'wali', 'konsa', 'kaunsa',
]);

/** Devanagari → Hindi; Latin with several common Hindi words → Hinglish; otherwise English. */
export function detectLang(text: string): Lang {
  const letters = [...text].filter((c) => /\p{L}/u.test(c));
  const deva = letters.filter((c) => /[ऀ-ॿ]/.test(c)).length;
  if (letters.length && deva / letters.length > 0.3) return 'hi';
  const words = normalizeQuestion(text).split(' ');
  const hits = words.filter((w) => HINGLISH_WORDS.has(w)).length;
  return hits >= 2 || (words.length <= 4 && hits >= 1) ? 'hinglish' : 'en';
}

export async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const truncate = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`);
