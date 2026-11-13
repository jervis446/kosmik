-- Ayurveda: the herb library and each person's prakriti (dosha) self-assessment.

-- From the Amidha Ayurveda Herb Database v2.0 (Sparsh Varshney, CC BY 4.0), descriptions
-- rewritten by Kosmik as traditional use only (data/scripts/build-herbs.ts). Each herb also has
-- a row in meanings (kind 'herb', same key) so questions find it by meaning.
CREATE TABLE herbs (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  english TEXT NOT NULL,
  botanical TEXT NOT NULL,
  family TEXT NOT NULL,
  synonyms TEXT NOT NULL,               -- JSON array of Sanskrit synonyms
  parts TEXT NOT NULL,                  -- JSON array of parts used
  rasa TEXT NOT NULL,                   -- JSON arrays of classical properties
  guna TEXT NOT NULL,
  virya TEXT NOT NULL,
  vipaka TEXT NOT NULL,
  pacify TEXT NOT NULL,                 -- JSON array of 'vata' | 'pitta' | 'kapha'
  aggravate TEXT NOT NULL,
  description TEXT NOT NULL,
  caution INTEGER NOT NULL DEFAULT 0,   -- 1 for plants classical texts class as poisonous
  link TEXT NOT NULL
);

-- Saved by the person after the quiz; kept until they delete it (or their account).
CREATE TABLE prakriti (
  user_id TEXT PRIMARY KEY,
  vata INTEGER NOT NULL,                -- percentages, adding up to 100
  pitta INTEGER NOT NULL,
  kapha INTEGER NOT NULL,
  answers TEXT NOT NULL,                -- JSON array of 'v' | 'p' | 'k', one per question
  taken_at INTEGER NOT NULL
);
