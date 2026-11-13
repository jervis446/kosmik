-- Kosmik on Cloudflare D1.
-- Libraries (verses, meanings) are shared reference data; the answer cache holds only
-- generic answers; conversations, messages and feedback are private to each person and are
-- only reachable through the API after the person's sign-in has been verified.

CREATE TABLE verses (
  ref TEXT PRIMARY KEY,                 -- 'BG 2.47'
  work TEXT NOT NULL,
  chapter INTEGER NOT NULL,
  verse INTEGER NOT NULL,
  sanskrit TEXT NOT NULL,
  iast TEXT NOT NULL,
  translation TEXT NOT NULL,
  translator TEXT NOT NULL,
  translation_alt TEXT,
  translator_alt TEXT,
  source TEXT NOT NULL,                 -- where the text came from and its licence
  embedding BLOB NOT NULL,              -- float32[768], gemini-embedding-2 (see EMBED_MODEL in src/ai.ts)
  UNIQUE (chapter, verse)
);

CREATE TABLE meanings (
  kind TEXT NOT NULL,                   -- graha, rashi, nakshatra, house, graha-house, graha-rashi, tarot-upright, tarot-reversed
  key TEXT NOT NULL,
  lang TEXT NOT NULL DEFAULT 'en',
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  reviewed INTEGER NOT NULL DEFAULT 0,  -- 1 once an astrologer has checked the text
  version INTEGER NOT NULL DEFAULT 1,
  embedding BLOB,
  PRIMARY KEY (kind, key, lang)
);

CREATE TABLE answer_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lang TEXT NOT NULL CHECK (lang IN ('en', 'hi', 'hinglish')),
  question TEXT NOT NULL,               -- normalised question, never personal
  question_hash TEXT NOT NULL,
  answer TEXT NOT NULL,                 -- JSON blocks
  sources TEXT NOT NULL DEFAULT '[]',   -- cited verse refs and meaning ids
  model TEXT NOT NULL,
  embedding BLOB NOT NULL,
  hits INTEGER NOT NULL DEFAULT 0,
  up INTEGER NOT NULL DEFAULT 0,
  down INTEGER NOT NULL DEFAULT 0,
  disabled INTEGER NOT NULL DEFAULT 0,  -- 1 after repeated 👎, until reviewed
  reviewed INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  last_hit_at INTEGER,
  UNIQUE (lang, question_hash)
);
CREATE INDEX answer_cache_scan ON answer_cache (lang, disabled, id DESC);

CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,                -- Asanoha account (Supabase Auth) user id
  title TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX conversations_user ON conversations (user_id, updated_at DESC);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  blocks TEXT,
  layer TEXT,
  cache_id INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX messages_conversation ON messages (conversation_id, created_at);

CREATE TABLE feedback (
  message_id TEXT PRIMARY KEY REFERENCES messages (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  value INTEGER NOT NULL CHECK (value IN (-1, 1)),
  created_at INTEGER NOT NULL
);

CREATE TABLE usage (
  subject TEXT NOT NULL,                -- 'user:<id>' or 'guest:<salted hash>'
  period TEXT NOT NULL,                 -- 'w:<monday>' or 'd:<date>', India time
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (subject, period)
);

CREATE TABLE premium (
  user_id TEXT PRIMARY KEY,
  until INTEGER NOT NULL
);
