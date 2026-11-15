-- The person's current state (vikriti) from a short check of the last few weeks, with their agni.
-- Kept until they delete it (or their account), like their prakriti.
CREATE TABLE vikriti (
  user_id TEXT PRIMARY KEY,
  vata INTEGER NOT NULL,                -- how many answers pointed to each dosha (0-10)
  pitta INTEGER NOT NULL,
  kapha INTEGER NOT NULL,
  agni TEXT NOT NULL CHECK (agni IN ('sama', 'vishama', 'tikshna', 'manda')),
  answers TEXT NOT NULL,                -- JSON array of 'v' | 'p' | 'k' | 'n'
  taken_at INTEGER NOT NULL
);
