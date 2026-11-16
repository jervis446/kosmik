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

/** A language the person asks for by name ("hindi mein samjhao", "in English please"), if any. */
export function requestedLang(text: string): Lang | undefined {
  const t = text.toLowerCase();
  if (/\bhinglish\b/.test(t)) return 'hinglish';
  if (/\b(in|into)\s+(simple\s+|easy\s+)?hindi\b|\bhindi\s+(mein|me|mai|main)\b|हिंदी में|हिन्दी में/.test(t)) return 'hi';
  if (/\b(in|into)\s+(simple\s+|easy\s+|plain\s+)?english\b|\benglish\s+(mein|me|mai|main)\b/.test(t)) return 'en';
  return undefined;
}

/** Devanagari → Hindi; Latin with several common Hindi words → Hinglish; otherwise English. */
export function detectLang(text: string): Lang {
  const letters = [...text].filter((c) => /\p{L}/u.test(c));
  const deva = letters.filter((c) => /[ऀ-ॿ]/.test(c)).length;
  if (letters.length && deva / letters.length > 0.3) return 'hi';
  const words = normalizeQuestion(text).split(' ');
  const hits = words.filter((w) => HINGLISH_WORDS.has(w)).length;
  return hits >= 2 || (words.length <= 4 && hits >= 1) ? 'hinglish' : 'en';
}

/**
 * Whether a reply is written in the language asked for. Hindi needs mostly Devanagari; English and
 * Hinglish need mostly Latin letters, and Hinglish also needs a few everyday Hindi words.
 * Short texts always pass: there is too little to judge.
 */
export function inLang(text: string, lang: Lang): boolean {
  const letters = [...text].filter((c) => /[\p{L}\p{M}]/u.test(c));
  if (letters.length < 30) return true;
  const deva = letters.filter((c) => /[ऀ-ॿ]/.test(c)).length / letters.length;
  if (lang === 'hi') return deva >= 0.5;
  if (deva > 0.2) return false;
  if (lang === 'en') return true;
  const words = normalizeQuestion(text).split(' ');
  return words.filter((w) => HINGLISH_WORDS.has(w)).length >= Math.min(4, Math.ceil(words.length / 40));
}

export async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const truncate = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`);
