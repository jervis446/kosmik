import type { Lang } from './lib/text.ts';

/** What an answer is made of. The app renders each block type with its own card. */
export type Block =
  | { type: 'text'; text: string }
  | { type: 'verse'; ref: string; sanskrit: string; iast: string; translation: string; translator: string }
  | { type: 'meaning'; kind: string; key: string; title: string; body: string; reviewed: boolean }
  | { type: 'tarot'; cards: { key: string; name: string; reversed: boolean; position: string; meaning: string }[] }
  | { type: 'notice'; kind: 'helpline' | 'needs-chart' | 'coming-soon' | 'limit' | 'sign-in' | 'busy'; text: string };

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

export type CacheEntry = { id: number; blocks: Block[] };

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
  /** Local development only: data/scripts/ai-relay.ts. Never set in production. */
  GEMINI_BASE_URL?: string;
  /** Comma-separated origins allowed to call the API from another origin (local development). */
  ALLOWED_ORIGINS?: string;
}
