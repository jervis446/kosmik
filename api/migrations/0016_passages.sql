-- Shanti's passages library: passages from other Hindu scriptures (Mahabharata first), chosen from
-- public-domain translations and kept word for word (data/scripts/build-passages.ts).
CREATE TABLE passages (
  ref TEXT PRIMARY KEY,                 -- 'MBh 11.2.1a': book.section.paragraph (a, b… when a paragraph was cut)
  work TEXT NOT NULL,                   -- 'Mahabharata'
  location TEXT NOT NULL,               -- 'Stri Parva, section 2'
  text TEXT NOT NULL,                   -- the translator's words, unedited
  sanskrit TEXT,
  translator TEXT NOT NULL,
  source TEXT NOT NULL,                 -- where the text came from and its licence
  themes TEXT NOT NULL DEFAULT '[]',    -- JSON list: grief, separation, letting go…
  reviewed INTEGER NOT NULL DEFAULT 0,  -- 1 once a person has checked it fits
  embedding BLOB NOT NULL               -- float32[768], gemini-embedding-2
);
