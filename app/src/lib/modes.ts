/** The four things Kosmik does, with ready-made questions that the library answers directly. */
export const MODES = [
  {
    key: "gita",
    glyph: "ॐ",
    label: "Bhagavad Gita",
    blurb: "Verses with Sanskrit, transliteration and meaning.",
    starters: [
      "Verse of the day",
      "Gita 2.47",
      "What does the Gita say about anxiety?",
      "गीता 6.5",
    ],
  },
  {
    key: "tarot",
    glyph: "✦",
    label: "Tarot",
    blurb: "Draw cards and read what they traditionally mean.",
    starters: [
      "Pull 1 tarot card",
      "Pull 3 tarot cards: past, present, future",
      "What does The Star mean?",
      "The Tower reversed",
    ],
  },
  {
    key: "jyotish",
    glyph: "☉",
    label: "Jyotish",
    blurb: "Grahas, rashis, nakshatras and houses in Vedic astrology.",
    starters: [
      "Saturn in 7th house",
      "Moon in Taurus",
      "What is Rohini nakshatra?",
      "What does Rahu mean?",
    ],
  },
  {
    key: "palm",
    glyph: "✋",
    label: "Palm reading",
    blurb: "Upload a photo of your palm and read its lines.",
    starters: [],
  },
] as const;

export type ModeKey = (typeof MODES)[number]["key"];
