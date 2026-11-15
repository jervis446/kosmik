import type { Lang } from './lib/text.ts';

/** What an answer is made of. The app renders each block type with its own card. */
export type Block =
  | { type: 'text'; text: string }
  | { type: 'verse'; ref: string; sanskrit: string; iast: string; translation: string; translator: string }
  | { type: 'meaning'; kind: string; key: string; title: string; body: string; reviewed: boolean }
  | { type: 'tarot'; cards: { key: string; name: string; reversed: boolean; position: string; meaning: string; reading?: string; arcana?: 'major' | 'minor'; number?: number; suit?: string }[]; advice?: string }
  /** Face-down cards to pick from; picking one draws and reads it for the question. */
  | { type: 'tarot-pick'; count: 1 | 3; question: string }
  | { type: 'palm'; lines: { name: string; reading: string }[] }
  | { type: 'chart'; lagna: string | null; moon: string; nakshatra: string; /** Running mahadasha–antardasha, e.g. "Rahu–Ketu until 19 April 2027". */ dasha?: string | null; rows: { graha: string; rashi: string; house: string | null; retrograde: boolean }[] }
  | {
      type: 'herb';
      key: string;
      name: string;
      english: string;
      botanical: string;
      rasa: string[];
      guna: string[];
      virya: string;
      vipaka: string;
      pacify: string[];
      aggravate: string[];
      description: string;
      /** Classed as poisonous in classical texts. */
      caution: boolean;
      link: string;
      synonyms?: string[];
      parts?: string[];
    }
  | { type: 'herb-compare'; herbs: { key: string; name: string; english: string; botanical: string; rasa: string[]; guna: string[]; virya: string; vipaka: string; pacify: string[]; aggravate: string[]; parts: string[] }[] }
  | {
      type: 'ritu';
      ritu: string;
      sanskrit: string;
      months: string;
      ayana: string;
      strength: string;
      rasa: string;
      doshas: string;
      favour: string[];
      avoid: string[];
      routine: string[];
      next: string;
    }
  | { type: 'vikriti'; vata: number; pitta: number; kapha: number; aggravated: string[]; agni: string; takenAt: number; prakriti: string | null }
  | { type: 'herb-list'; title: string; total: number; herbs: { key: string; name: string; english: string; virya: string }[] }
  | {
      type: 'zodiac';
      sun: { sign: string; glyph: string; degree: string; vibe: string };
      moon: { sign: string; glyph: string; degree: string; vibe: string };
      rising: { sign: string; glyph: string; degree: string; vibe: string } | null;
      planets: { graha: string; sign: string; glyph: string; degree: string }[];
      siderealSun: string;
      cusp: string | null;
      solarReturn: string;
    }
  /** Intake questions from the Ayurveda consultation; the person answers in the chat. */
  | { type: 'ayur-intake'; questions: string[] }
  /** The Ayurveda consultation's assessment and plan. */
  | {
      type: 'ayur-plan';
      assessment: { doshas: string; agni: string; nidana: string[]; notes: string } | null;
      favour: string[];
      avoid: string[];
      lifestyle: string[];
      remedies: { name: string; how: string }[];
      formulations: { name: string; dose: string; anupana: string; when: string }[];
      yoga: string[];
      redFlags: string[];
      shloka?: { sanskrit: string; source: string; meaning: string } | null;
    }
  /** A calculator result: a titled table. */
  | { type: 'facts'; title: string; rows: [string, string][]; note?: string }
  | { type: 'milan'; boy: string; girl: string; total: number; verdict: string; simplified: string; kootas: { name: string; got: number; max: number; boy: string; girl: string; note: string }[] }
  /** The chart (or prakriti) factors an answer rests on, shown folded under it. */
  | { type: 'behind'; points: string[] }
  /** Questions to ask next; tapping one asks it. */
  | { type: 'followups'; questions: string[] }
  | { type: 'prakriti'; vata: number; pitta: number; kapha: number; label: string; takenAt: number }
  | {
      type: 'notice';
      kind: 'helpline' | 'needs-chart' | 'needs-details' | 'needs-palm' | 'needs-prakriti' | 'needs-vikriti' | 'coming-soon' | 'limit' | 'sign-in' | 'busy' | 'retake';
      text: string;
    };

/** Which layer answered: no AI, exact repeat, same meaning, or a new AI answer. */
export type Layer = 'direct' | 'exact' | 'semantic' | 'ai' | 'safety' | 'limit';

export type AskResult = {
  conversationId: string | null;
  messageId: string | null;
  layer: Layer;
  lang: Lang;
  blocks: Block[];
  /** Questions left in the current period; null means unlimited. */
  remaining: number | null;
};

export type Verse = {
  ref: string;
  chapter: number;
  verse: number;
  sanskrit: string;
  iast: string;
  translation: string;
  translator: string;
};

export type Meaning = { kind: string; key: string; title: string; body: string; reviewed: boolean };

/** A cached answer, with the library entries it cites and a fingerprint of their text when cached. */
export type CacheEntry = { id: number; blocks: Block[]; sources: string[]; sourcesHash: string | null };

export interface Env {
  DB: D1Database;
  ASSETS?: Fetcher;
  /** Vectorize index for production; without it vectors are searched in memory from D1. */
  VECTORS?: VectorizeIndex;
  RATE_LIMITER?: { limit(opts: { key: string }): Promise<{ success: boolean }> };
  /** The Asanoha account (Supabase Auth) that signs people in. Public values. */
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  /** Secret used to hash guest IP addresses for the daily guest allowance. */
  GUEST_SALT?: string;
  /** Google Gemini API key (secret). */
  GEMINI_API_KEY?: string;
  /** Gemini chat model; defaults to DEFAULT_CHAT_MODEL in ai.ts. */
  CHAT_MODEL?: string;
  /** Gemini reasoning effort for answers; defaults to 'none' (fastest). */
  REASONING_EFFORT?: string;
  /** 'open' while testing: chart readings give specific, dated predictions. 'safe' (default) after launch. */
  ASTRO_MODE?: string;
  /** Comma-separated account ids that can read the error log at /admin. */
  ADMIN_USER_IDS?: string;
  /** "1" to require a verified WhatsApp number before asking (needs the relay below). */
  PHONE_REQUIRED?: string;
  /** WhatsApp relay that sends the codes (POST {to, text}); its bearer token is a secret. */
  WA_RELAY_URL?: string;
  WA_RELAY_TOKEN?: string;
  /** Local development only: data/scripts/ai-relay.ts. Never set in production. */
  GEMINI_BASE_URL?: string;
  /** Noha Pay (UPI gateway). Payments stay off until URL, merchant id and merchant key are set. */
  NOHA_GATEWAY_URL?: string;
  NOHA_MERCHANT_ID?: string;
  /** Authenticates checkout requests and, unless NOHA_WEBHOOK_SECRET is set, signs webhooks. */
  NOHA_MERCHANT_KEY?: string;
  NOHA_WEBHOOK_SECRET?: string;
  /** Birth place search; local development can point this at the relay. */
  NOMINATIM_URL?: string;
  /** Comma-separated origins allowed to call the API from another origin (local development). */
  ALLOWED_ORIGINS?: string;
}
