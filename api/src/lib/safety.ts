/**
 * Kosmik's safety rules in code: spotting a person in crisis, and checking that generated
 * text keeps to the content rules (no fear, no health or death predictions, no cures).
 */

/** Tele-MANAS, India's free 24×7 mental health helpline. */
export const HELPLINE = { name: 'Tele-MANAS', number: '14416' };

const CRISIS = [
  /\b(kill|hurt|harm)\s+(myself|me)\b/i,
  /\bsuicid/i,
  /\bend\s+(my|it)\s+(life|all)\b/i,
  /\b(want|wanna)\s+to\s+die\b/i,
  /\bno\s+reason\s+to\s+live\b/i,
  /\bself[-\s]?harm\b/i,
  /\b(don'?t|do\s+not|no\s+longer)\s+want\s+to\s+(live|be\s+alive|exist)\b/i,
  /\bbetter\s+off\s+dead\b|\btake\s+my\s+(own\s+)?life\b/i,
  /\bmar\s+jaana\b|\bmar\s+jaun\b|\bmarna\s+chaht[ai]\b|\bjeena\s+nahi\b/i,
  /\bjeen?e\s+k[ai]\s+(mann?|ichh?a|iccha|wajah)\s+nahi\b/i,
  /\b(khud|apne\s+aap)\s+ko\s+(khatam|maar|mar|nuksan|nuksaan|hurt)\b|\bzindagi\s+khatam\b/i,
  /आत्महत्या|मरना\s+चाहत|जीना\s+नहीं|जीने\s+(का|की)\s+(मन|इच्छा)\s+नहीं|(खुद|ख़ुद)\s+को\s+(खत्म|ख़त्म)/,
];

export function isCrisis(text: string): boolean {
  return CRISIS.some((re) => re.test(text));
}

/** Phrases generated text must never contain (fear, health, death, guarantees, cures). */
const BANNED: [RegExp, string][] = [
  [/\b(you|they|he|she)\s+will\s+(die|pass away)\b|\bdeath\s+of\b|\bearly death\b|\bshort life\b|\blifespan\b/i, 'predicts death'],
  [/\b(disease|illness|cancer|surgery|hospital|accident)s?\b/i, 'mentions illness or accidents'],
  [/\bdivorce\b|\bwidow/i, 'mentions divorce or widowhood'],
  [/\bguarantee(d|s)?\b|\bdefinitely will\b|\bcertainly will\b/i, 'promises an outcome'],
  [/\bcures?\b|\bheals?\s+(your|the)\s+(body|disease)\b|\btreats?\b.*\b(disease|condition)\b/i, 'makes a health claim'],
  [/\bcurse[sd]?\b|\bdoom(ed)?\b|\bruin(ed|s)?\s+your\b/i, 'uses fear'],
  [/\b(buy|purchase|wear)\s+(a|an|this)?\s*(gemstone|stone|rudraksha|yantra)\b/i, 'pushes a product'],
];

export function contentProblems(text: string, allowWords: string[] = []): string[] {
  let t = text;
  for (const w of allowWords) t = t.split(w).join('');
  return BANNED.filter(([re]) => re.test(t)).map(([, why]) => why);
}

/** Checks a meaning-library entry: rules plus a sensible length. */
export function meaningProblems(body: string, entry: { kind: string; title: string }): string[] {
  const words = body.trim().split(/\s+/).length;
  const problems = contentProblems(body, entry.title.includes('Death') ? ['Death card', 'The Death', 'Death'] : []);
  if (words < 30) problems.push('too short');
  if (words > 120) problems.push('too long');
  return problems;
}
