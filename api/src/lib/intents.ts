/**
 * Layer 1: questions Kosmik can answer without any AI. Pure parsing: returns what was asked
 * for, and the pipeline fetches the answer from the libraries.
 */
import { GRAHAS, NAKSHATRAS, RASHIS, TAROT } from './catalog.ts';
import { normalizeQuestion } from './text.ts';
import { HERB_INDEX } from './herb-index.ts';

type Dosha = 'vata' | 'pitta' | 'kapha';

export type Intent =
  | { type: 'verse'; chapter: number; verse: number }
  | { type: 'verse-of-the-day' }
  | { type: 'tarot-draw'; count: 1 | 3 }
  | { type: 'meaning'; kind: string; key: string }
  | { type: 'needs-chart' }
  | { type: 'palm' }
  | { type: 'daily-horoscope' }
  | { type: 'herb'; key: string }
  | { type: 'herb-list'; dosha?: Dosha; effect: 'pacify' | 'aggravate'; virya?: 'Ushna' | 'Sheeta'; rasa?: string[]; guna?: string[]; vipaka?: string }
  | { type: 'herb-compare'; keys: string[] }
  /** The person's Western (tropical) signs, the Sun on their birthday and their solar return. */
  | { type: 'zodiac' }
  /** The ritu (Ayurvedic season) running now, with its guidance. */
  | { type: 'ritu' }
  /** The person's current state: show it, or (quiz) open the check. */
  | { type: 'vikriti'; quiz: boolean }
  /** The person's own prakriti: show it, or (quiz) open the quiz. */
  | { type: 'prakriti'; quiz: boolean }
  /** A health complaint or wellness question: an Ayurveda consultation (intake questions, then a plan). */
  | { type: 'ayur-consult'; herb?: string }
  /** Diet, routine or herbs for the person's own prakriti: an AI answer from their quiz result. */
  | { type: 'prakriti-advice' };

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

const DOSHA: [Dosha, RegExp][] = [
  ['vata', /\b(vata|vaata|vaat|vat dosha|vayu dosha)\b|वात/],
  ['pitta', /\b(pitta|pitt|pith|pita dosha)\b|पित्त/],
  ['kapha', /\b(kapha|kaph|cough dosha)\b|कफ/],
];
const doshaIn = (text: string) => DOSHA.find(([, re]) => re.test(text))?.[0];

const PRAKRITI_SELF =
  /\b(my|mera|meri|mere|mujhe|mujhko|apna|apni)\b.{0,30}\b(prakriti|prakruti|prakrati|dosha|doshas|dosh|body type|constitution)\b|\b(which|what) dosha (am i|do i have|i have)\b|\b(prakriti|prakruti|dosha|body type) (quiz|test|analysis|assessment)\b|मेरी प्रकृति|मेरा दोष/;
const QUIZ = /\b(quiz|test|retake|redo|take|find out)\b/;
export const VIKRITI_SELF =
  /\b(my|mera|meri|mere|mujhe|check|test|quiz)\b.{0,30}\b(vikriti|vikruti|imbalance|current dosha|dosha imbalance|agni|digestive fire|digestion type)\b|\b(vikriti|vikruti) (quiz|test|check|analysis)\b|मेरी विकृति/;
const RITU = /\b(ritu|rutu|ritus|season|seasonal|mausam)\b|ऋतु/;
const NOW = /\b(now|current|currently|this|abhi|aaj|today|kaunsa|kaun sa|which|chal raha|running|routine|ritucharya|diet|eat|food|khana)\b/;
const DEFINE = /\b(what is|whats|what are|meaning|mean|means|define|explain|about|kya hai|kya hota|kise kehte|samjhao)\b/;

const RASAS: [string, RegExp][] = [
  ['Madhura', /\b(madhura|madhur|sweet)\b/],
  ['Amla', /\b(amla rasa|amla taste|sour)\b/],
  ['Lavana', /\b(lavana|lavan|salty)\b/],
  ['Katu', /\b(katu|pungent)\b/],
  ['Tikta', /\b(tikta|tikt|bitter)\b/],
  ['Kashaya', /\b(kashaya|kasaya|kashay|astringent)\b/],
];
const GUNAS: [string, RegExp][] = [
  ['Laghu', /\b(laghu|light)\b/],
  ['Guru', /\b(guru guna|heavy)\b/],
  ['Snigdha', /\b(snigdha|unctuous|oily)\b/],
  ['Ruksha', /\b(ruksha|ruksh|dry)\b/],
  ['Tikshna', /\b(tikshna|teekshna|sharp)\b/],
];

/** Ayurveda terms with their own library entry. */
const CONCEPTS: [string, RegExp][] = [
  ['rasa-madhura', /\b(madhura|madhur) rasa\b|\bsweet taste\b/],
  ['rasa-amla', /\bamla rasa\b|\bsour taste\b/],
  ['rasa-lavana', /\b(lavana|lavan) rasa\b|\bsalty taste\b/],
  ['rasa-katu', /\bkatu rasa\b|\bpungent taste\b/],
  ['rasa-tikta', /\b(tikta|tikt) rasa\b|\bbitter taste\b/],
  ['rasa-kashaya', /\b(kashaya|kasaya) rasa\b|\bastringent taste\b/],
  ['vipaka', /\b(vipaka|vipak|post digestive)\b/],
  ['virya', /\b(virya|veerya|viryam)\b/],
  ['prabhava', /\b(prabhava|prabhav)\b/],
  ['guna', /\b(gurvadi|guna|gunas)\b(?! of)/],
  ['agni', /\b(agni|jatharagni|digestive fire)\b/],
  ['ama', /\b(ama|aam|aama)\b/],
  ['ojas', /\b(ojas|oja)\b/],
  ['dhatu', /\b(dhatu|dhatus|sapta dhatu)\b/],
  ['mala', /\b(mala|malas)\b/],
  ['srotas', /\b(srotas|srota|strotas)\b/],
  ['dinacharya', /\b(dinacharya|dincharya)\b/],
  ['ritucharya', /\b(ritucharya|rituchariya)\b/],
  ['panchakarma', /\b(panchakarma|panch karma|panchkarma)\b/],
  ['tridosha', /\b(tridosha|three doshas|tridosh)\b/],
  ['manas-prakriti', /\b(sattva|satva|rajas|tamas|triguna|manas prakriti)\b/],
  ['vikriti', /\b(vikriti|vikruti)\b/],
  ['prakriti', /\b(prakriti|prakruti)\b/],
  ['rasa', /\b(rasa|six tastes|shad rasa)\b/],
];
const ADVICE = /\b(eat|eating|food|foods|diet|khana|khaana|meal|meals|routine|dinacharya|lifestyle|exercise|yoga|sleep|herbs?|jadi ?buti|avoid|should i|tips|balance|season|ritucharya|drink)\b/;
const HERB_WORD = /\b(herbs?|herbal|jadi ?butis?|jadibuti|jadiyan|plants?|dravyas?|aushadhi|aushadh)\b|जड़ी/;
const HERB_CONTEXT =
  /\b(herbs?|herbal|jadi|buti|ayurved|ayurveda|ayurvedic|rasa|virya|vipaka|guna|dosha|properties|plant|what is|whats|kya hai|kya hota|uses|used|benefits|fayde|about|tell me|meaning)\b|आयुर्वेद/;

/** Health problems, cures and doses: never answered with herb advice. */
const HEALTH =
  /\b(cures?|curing|treat|treats|treatment|heal|heals|healing|remedy|remedies|medicine|medicines|dose|doses|dosage|how much|how many|mg|tablet|tablets|capsule|capsules|disease|diseases|diabetes|diabetic|sugar|bp|blood pressure|cancer|thyroid|pcos|pcod|cholesterol|infection|fever|cold|cough|asthma|arthritis|pain|piles|acidity|constipation|migraine|obesity|weight loss|hair fall|acne|pregnan\w*|ilaj|ilaaj|dawa|dawai|davai|bimari|beemari|rog)\b|इलाज|दवा|बीमारी|रोग/;

/** Herb names, longest first within each phrase length, so "shigru patra" wins over "shigru". */
const HERB_NAMES = new Map<string, string>();
const HERB_SYNONYMS = new Map<string, string>();
const tokens = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
for (const [key, names] of HERB_INDEX) for (const n of names) if (!HERB_NAMES.has(tokens(n))) HERB_NAMES.set(tokens(n), key);
for (const [key, , synonyms] of HERB_INDEX) for (const n of synonyms) if (!HERB_NAMES.has(tokens(n)) && !HERB_SYNONYMS.has(tokens(n))) HERB_SYNONYMS.set(tokens(n), key);

/** Every herb named in the question, in order (for comparisons). */
export function findHerbs(text: string): string[] {
  const words = tokens(text).split(' ');
  const out: string[] = [];
  for (let i = 0; i < words.length; ) {
    let hit: { key: string; n: number } | undefined;
    for (let n = 4; n >= 1 && !hit; n--) {
      const key = HERB_NAMES.get(words.slice(i, i + n).join(' '));
      if (key) hit = { key, n };
    }
    if (hit) {
      if (!out.includes(hit.key)) out.push(hit.key);
      i += hit.n;
    } else i++;
  }
  return out;
}

/** The herb named in the question, by name, English or botanical name, or a Sanskrit synonym. */
export function findHerb(text: string, synonyms: boolean): string | undefined {
  const words = tokens(text).split(' ');
  for (let n = 4; n >= 1; n--)
    for (let i = 0; i + n <= words.length; i++) {
      const phrase = words.slice(i, i + n).join(' ');
      const key = HERB_NAMES.get(phrase) ?? (synonyms ? HERB_SYNONYMS.get(phrase) : undefined);
      if (key) return key;
    }
  return undefined;
}

/** Ayurveda questions Kosmik can answer from the herb and dosha libraries. */
function ayurvedaIntent(text: string): Intent | undefined {
  if (VIKRITI_SELF.test(text) && !DEFINE.test(text.replace(/\b(my|mera|meri)\b.*/, ''))) return { type: 'vikriti', quiz: QUIZ.test(text) };
  if (PRAKRITI_SELF.test(text)) {
    if (ADVICE.test(text)) return { type: 'prakriti-advice' };
    return { type: 'prakriti', quiz: QUIZ.test(text) };
  }
  if ((RITU.test(text) && NOW.test(text)) || (/\britucharya\b/.test(text) && !DEFINE.test(text))) return { type: 'ritu' };
  const named = findHerb(text, true);
  if (HEALTH.test(text) && (named || HERB_WORD.test(text) || /\b(ayurved\w*)\b|आयुर्वेद/.test(text))) return named ? { type: 'ayur-consult', herb: named } : { type: 'ayur-consult' };
  const both = findHerbs(text);
  if (both.length >= 2 && /\b(compare|comparison|vs|versus|difference|differ|better|or|ya|aur|and|between|kaun)\b/.test(text)) return { type: 'herb-compare', keys: both.slice(0, 3) };
  const dosha = doshaIn(text);
  const virya = /\b(cooling|cool|thanda|thandi|sheeta|sheet)\b/.test(text) ? 'Sheeta' : /\b(warming|heating|hot|garam|ushna)\b/.test(text) ? 'Ushna' : undefined;
  const vipakaM = /\b(madhura|madhur|amla|katu) vipaka?\b/.exec(text);
  const vipaka = vipakaM ? { madhura: 'Madhura', madhur: 'Madhura', amla: 'Amla', katu: 'Katu' }[vipakaM[1]] : undefined;
  const rest = vipakaM ? text.replace(vipakaM[0], ' ') : text;
  const rasa = RASAS.filter(([, re]) => re.test(rest)).map(([r]) => r);
  const guna = GUNAS.filter(([, re]) => re.test(rest)).map(([g]) => g);
  if (HERB_WORD.test(text) && (dosha || virya || vipaka || rasa.length || guna.length)) {
    const effect = /\b(increase|increases|increasing|aggravate|aggravates|aggravating|worsen|worsens|raise|raises|badhate|badhati|badhata|badhaye|badhane)\b/.test(text) ? 'aggravate' : 'pacify';
    const props = { ...(vipaka ? { vipaka } : {}), ...(rasa.length ? { rasa } : {}), ...(guna.length ? { guna } : {}) };
    return { type: 'herb-list', dosha, effect, virya, ...props };
  }
  const concept = CONCEPTS.find(([, re]) => re.test(text));
  if (concept && (DEFINE.test(text) || text.split(' ').length <= 3) && !(concept[0] === 'ama' && findHerb(text, false))) {
    return { type: 'meaning', kind: 'ayurveda', key: concept[0] };
  }
  const words = text.split(' ').length;
  if (dosha && (words <= 3 || /\b(what is|whats|meaning|mean|means|about|explain|kya hai|kya hota|kise kehte)\b/.test(text)) && !findHerb(text, false)) {
    return { type: 'meaning', kind: 'dosha', key: dosha };
  }
  const context = HERB_CONTEXT.test(text);
  const herb = findHerb(text, context);
  if (herb && (context || words <= 3)) return { type: 'herb', key: herb };
  return undefined;
}

/** Body and health words: an Ayurveda consultation, unless the question is about the chart. */
const SYMPTOMS =
  /\b(gut\w*|stomach\w*|tummy|belly|abdomen\w*|digest\w*|indigest\w*|gas|gassy|flatulen\w*|burp\w*|bloat\w*|acidity|acid reflux|reflux|heartburn|constipat\w*|loose motion\w*|diarrh\w*|ibs|appetite|nausea\w*|vomit\w*|piles|hemorrhoid\w*|fissure\w*|ulcer\w*|liver|fatty liver|sleep\w*|insomnia|neend|fatigue\w*|tired\w*|weak\w*|thakan|low energy|skin|acne|pimple\w*|eczema|psoriasis|rash\w*|itch\w*|hair ?fall|hair loss|dandruff|grey hair\w*|cold|cough\w*|khansi|zukam|sinus\w*|allerg\w*|fever\w*|bukhar|head ?ache\w*|migraine\w*|joint\w*|knee\w*|back ?pain|neck pain|arthrit\w*|\w*ache\w*|pain\w*|dard|weight|obes\w*|thyroid|pcos|pcod|period\w*|menstru\w*|cramp\w*|diabet\w*|sugar level|blood pressure|bp|cholesterol|urine|urinat\w*|uti|kidney\w*|eyes?|immunity|health\w*|sehat|body heat|pet|kabz|mouth ulcer\w*|bad breath|sweat\w*|swell\w*|ayurved\w*|dosha|remed\w*|ilaj|ilaaj|dawa\w*|desi nuskh\w*|nuskh\w*)\b|पेट|कब्ज|गैस|एसिडिटी|नींद|खांसी|बुखार|दर्द|सेहत|इलाज|नुस्खा/;
const ASTRO_WORDS = /\b(spiritual\w*|soul|mind|karma|dharma|kundli|kundali|chart|horoscope|dasha|mahadasha|planet\w*|graha|house|bhava|rashi|nakshatra|lagna|ascendant|saturn|shani|rahu|ketu|jupiter|guru|transit|zodiac|sun sign|tarot|card|palm|hast ?rekha|gita|geeta|krishna)\b|कुंडली|ग्रह/;

/** Western astrology words: answered with the tropical zodiac card. */
const WESTERN = /\b(sun sign|star sign|zodiac sign|zodiac|western|tropical|big three|big 3|rising sign|ascendant sign|sun moon (and )?rising|solar return|birthday sun|sun on my birthday|cusp|what sign am i|my sign)\b/;

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

  if (PRAKRITI_SELF.test(text) || VIKRITI_SELF.test(text)) return ayurvedaIntent(text);
  if (SYMPTOMS.test(text) && !ASTRO_WORDS.test(text) && !/\b(what is|whats|kya hai|meaning of)\b/.test(text.replace(/\b(my|mera|meri|mere)\b.*/, ''))) {
    const herb = findHerb(text, true);
    return herb ? { type: 'ayur-consult', herb } : { type: 'ayur-consult' };
  }
  if (WESTERN.test(text) && /\b(my|mera|meri|mere|am i|i am|im|me)\b/.test(text)) return { type: 'zodiac' };
  if (PALM.test(text)) return { type: 'palm' };
  if (PERSONAL.test(text)) return { type: 'needs-chart' };

  const words = text.split(' ').length;
  const nakshatra = findAlias(NAKSHATRAS, text);
  if (nakshatra && (/\b(nakshatra|nakshatram|star)\b|नक्षत्र/.test(text) || words <= 3)) return { type: 'meaning', kind: 'nakshatra', key: nakshatra.key };
  if (rashi && (/\b(rashi|raashi|sign|zodiac)\b|राशि/.test(text) || words <= 3)) return { type: 'meaning', kind: 'rashi', key: rashi.key };
  if (house && !graha && words <= 8) return { type: 'meaning', kind: 'house', key: String(house) };
  if (graha && words <= 6 && /\b(planet|graha|meaning|mean|means|signify|represent|kya hai|about)\b|ग्रह/.test(text)) return { type: 'meaning', kind: 'graha', key: graha.key };
  return ayurvedaIntent(text);
}
