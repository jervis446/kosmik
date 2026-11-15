-- A verified WhatsApp number per account, so one person can't collect free questions with many
-- email addresses. Each number belongs to one account. Kept while the account exists.
CREATE TABLE phones (
  user_id TEXT PRIMARY KEY,
  phone TEXT NOT NULL UNIQUE,           -- E.164, e.g. +919876543210
  verified_at INTEGER NOT NULL
);

-- One pending code per account. Only a hash of the code is stored; it expires after 10 minutes.
CREATE TABLE phone_codes (
  user_id TEXT PRIMARY KEY,
  phone TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  sent_at INTEGER NOT NULL,
  sends_today INTEGER NOT NULL DEFAULT 1,
  day TEXT NOT NULL                     -- India date of sends_today
);
CREATE INDEX phone_codes_phone ON phone_codes (phone);
