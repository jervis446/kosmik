/**
 * The fixed vocabulary of Vedic astrology and tarot that Kosmik's meaning library covers,
 * with the names people actually type (English, Sanskrit/Hindi in Latin script, Devanagari).
 * Used to build the library and to recognise questions that need no AI.
 */

export type Graha = { key: string; name: string; english: string; aliases: string[] };
export type Rashi = { key: string; name: string; english: string; ruler: string; aliases: string[] };
export type Nakshatra = { key: string; name: string; aliases: string[] };
export type TarotCard = { key: string; name: string; arcana: 'major' | 'minor'; number?: number; suit?: string };

export const GRAHAS: Graha[] = [
  { key: 'sun', name: 'Surya', english: 'Sun', aliases: ['sun', 'surya', 'suraj', 'sury', 'सूर्य'] },
  { key: 'moon', name: 'Chandra', english: 'Moon', aliases: ['moon', 'chandra', 'chand', 'चंद्र', 'चन्द्र', 'चंद्रमा'] },
  { key: 'mars', name: 'Mangal', english: 'Mars', aliases: ['mars', 'mangal', 'kuja', 'मंगल'] },
  { key: 'mercury', name: 'Budh', english: 'Mercury', aliases: ['mercury', 'budh', 'budha', 'बुध'] },
  { key: 'jupiter', name: 'Guru', english: 'Jupiter', aliases: ['jupiter', 'guru', 'brihaspati', 'गुरु', 'बृहस्पति'] },
  { key: 'venus', name: 'Shukra', english: 'Venus', aliases: ['venus', 'shukra', 'sukra', 'शुक्र'] },
  { key: 'saturn', name: 'Shani', english: 'Saturn', aliases: ['saturn', 'shani', 'sani', 'शनि'] },
  { key: 'rahu', name: 'Rahu', english: 'North node', aliases: ['rahu', 'राहु', 'north node'] },
  { key: 'ketu', name: 'Ketu', english: 'South node', aliases: ['ketu', 'केतु', 'south node'] },
];

export const RASHIS: Rashi[] = [
  { key: 'mesh', name: 'Mesh', english: 'Aries', ruler: 'mars', aliases: ['mesh', 'mesha', 'aries', 'मेष'] },
  { key: 'vrishabh', name: 'Vrishabh', english: 'Taurus', ruler: 'venus', aliases: ['vrishabh', 'vrishabha', 'vrishab', 'taurus', 'वृषभ'] },
  { key: 'mithun', name: 'Mithun', english: 'Gemini', ruler: 'mercury', aliases: ['mithun', 'mithuna', 'gemini', 'मिथुन'] },
  { key: 'kark', name: 'Kark', english: 'Cancer', ruler: 'moon', aliases: ['kark', 'karka', 'cancer', 'कर्क'] },
  { key: 'simha', name: 'Simha', english: 'Leo', ruler: 'sun', aliases: ['simha', 'singh', 'leo', 'सिंह'] },
  { key: 'kanya', name: 'Kanya', english: 'Virgo', ruler: 'mercury', aliases: ['kanya', 'virgo', 'कन्या'] },
  { key: 'tula', name: 'Tula', english: 'Libra', ruler: 'venus', aliases: ['tula', 'libra', 'तुला'] },
  { key: 'vrishchik', name: 'Vrishchik', english: 'Scorpio', ruler: 'mars', aliases: ['vrishchik', 'vrishchika', 'scorpio', 'वृश्चिक'] },
  { key: 'dhanu', name: 'Dhanu', english: 'Sagittarius', ruler: 'jupiter', aliases: ['dhanu', 'dhanus', 'sagittarius', 'धनु'] },
  { key: 'makar', name: 'Makar', english: 'Capricorn', ruler: 'saturn', aliases: ['makar', 'makara', 'capricorn', 'मकर'] },
  { key: 'kumbh', name: 'Kumbh', english: 'Aquarius', ruler: 'saturn', aliases: ['kumbh', 'kumbha', 'aquarius', 'कुंभ', 'कुम्भ'] },
  { key: 'meen', name: 'Meen', english: 'Pisces', ruler: 'jupiter', aliases: ['meen', 'meena', 'pisces', 'मीन'] },
];

const NAKSHATRA_NAMES: [string, string[]][] = [
  ['Ashwini', ['ashwini', 'aswini', 'अश्विनी']], ['Bharani', ['bharani', 'भरणी']], ['Krittika', ['krittika', 'kritika', 'कृत्तिका']],
  ['Rohini', ['rohini', 'रोहिणी']], ['Mrigashira', ['mrigashira', 'mrigashirsha', 'mrigasira', 'मृगशिरा']], ['Ardra', ['ardra', 'aardra', 'आर्द्रा']],
  ['Punarvasu', ['punarvasu', 'पुनर्वसु']], ['Pushya', ['pushya', 'pushyami', 'पुष्य']], ['Ashlesha', ['ashlesha', 'aslesha', 'आश्लेषा']],
  ['Magha', ['magha', 'मघा']], ['Purva Phalguni', ['purva phalguni', 'poorva phalguni', 'पूर्वा फाल्गुनी']], ['Uttara Phalguni', ['uttara phalguni', 'उत्तरा फाल्गुनी']],
  ['Hasta', ['hasta', 'हस्त']], ['Chitra', ['chitra', 'चित्रा']], ['Swati', ['swati', 'svati', 'स्वाति']],
  ['Vishakha', ['vishakha', 'visakha', 'विशाखा']], ['Anuradha', ['anuradha', 'अनुराधा']], ['Jyeshtha', ['jyeshtha', 'jyestha', 'ज्येष्ठा']],
  ['Mula', ['mula', 'moola', 'मूल']], ['Purva Ashadha', ['purva ashadha', 'poorvashada', 'पूर्वाषाढ़ा']], ['Uttara Ashadha', ['uttara ashadha', 'uttarashada', 'उत्तराषाढ़ा']],
  ['Shravana', ['shravana', 'sravana', 'श्रवण']], ['Dhanishta', ['dhanishta', 'dhanishtha', 'धनिष्ठा']], ['Shatabhisha', ['shatabhisha', 'satabhisha', 'शतभिषा']],
  ['Purva Bhadrapada', ['purva bhadrapada', 'poorva bhadrapada', 'पूर्वा भाद्रपद']], ['Uttara Bhadrapada', ['uttara bhadrapada', 'उत्तरा भाद्रपद']], ['Revati', ['revati', 'रेवती']],
];

export const NAKSHATRAS: Nakshatra[] = NAKSHATRA_NAMES.map(([name, aliases]) => ({
  key: name.toLowerCase().replace(/\s+/g, '-'),
  name,
  aliases,
}));

export const HOUSES = Array.from({ length: 12 }, (_, i) => i + 1);

const MAJOR = [
  'The Fool', 'The Magician', 'The High Priestess', 'The Empress', 'The Emperor', 'The Hierophant', 'The Lovers', 'The Chariot',
  'Strength', 'The Hermit', 'Wheel of Fortune', 'Justice', 'The Hanged Man', 'Death', 'Temperance', 'The Devil', 'The Tower',
  'The Star', 'The Moon', 'The Sun', 'Judgement', 'The World',
];
const RANKS = ['Ace', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Page', 'Knight', 'Queen', 'King'];
const SUITS = ['Wands', 'Cups', 'Swords', 'Pentacles'];

const slug = (s: string) => s.toLowerCase().replace(/^the\s+/, '').replace(/\s+/g, '-');

export const TAROT: TarotCard[] = [
  ...MAJOR.map((name, number) => ({ key: slug(name), name, arcana: 'major' as const, number })),
  ...SUITS.flatMap((suit) => RANKS.map((rank) => ({ key: slug(`${rank} of ${suit}`), name: `${rank} of ${suit}`, arcana: 'minor' as const, suit }))),
];

export const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;

/** Every entry the meaning library should contain: kind, key and a human title. */
export function libraryEntries(): { kind: string; key: string; title: string }[] {
  const out: { kind: string; key: string; title: string }[] = [];
  for (const g of GRAHAS) out.push({ kind: 'graha', key: g.key, title: `${g.name} (${g.english})` });
  for (const r of RASHIS) out.push({ kind: 'rashi', key: r.key, title: `${r.name} rashi (${r.english})` });
  for (const n of NAKSHATRAS) out.push({ kind: 'nakshatra', key: n.key, title: `${n.name} nakshatra` });
  for (const h of HOUSES) out.push({ kind: 'house', key: String(h), title: `The ${ordinal(h)} house (bhava)` });
  for (const g of GRAHAS)
    for (const h of HOUSES) out.push({ kind: 'graha-house', key: `${g.key}:${h}`, title: `${g.name} (${g.english}) in the ${ordinal(h)} house` });
  for (const g of GRAHAS)
    for (const r of RASHIS) out.push({ kind: 'graha-rashi', key: `${g.key}:${r.key}`, title: `${g.name} (${g.english}) in ${r.name} (${r.english})` });
  for (const c of TAROT) {
    out.push({ kind: 'tarot-upright', key: c.key, title: `${c.name} (upright)` });
    out.push({ kind: 'tarot-reversed', key: c.key, title: `${c.name} (reversed)` });
  }
  return out;
}
