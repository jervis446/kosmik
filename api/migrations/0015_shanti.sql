-- Shanti chats: a third kind of conversation, for comfort from the scriptures.
-- SQLite can't change a CHECK constraint, and rebuilding `conversations` would cascade-delete every
-- message, so the column is replaced in place: add the wider one, copy, drop the old, rename.
ALTER TABLE conversations ADD COLUMN kind_new TEXT NOT NULL DEFAULT 'kosmik' CHECK (kind_new IN ('kosmik', 'ayurveda', 'shanti'));
UPDATE conversations SET kind_new = kind;
ALTER TABLE conversations DROP COLUMN kind;
ALTER TABLE conversations RENAME COLUMN kind_new TO kind;

-- Shanti answers are cached apart from Kosmik's (their question hashes also carry a 'shanti|' prefix).
ALTER TABLE answer_cache ADD COLUMN kind TEXT NOT NULL DEFAULT 'kosmik' CHECK (kind IN ('kosmik', 'shanti'));
