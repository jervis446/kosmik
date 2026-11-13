-- Birth details for kundli readings and photos of both palms, saved by the person in
-- Account → My details with their consent. Sensitive personal data: kept until they delete it
-- (or their account), never shared between people, and only sent to the AI model when they ask.
CREATE TABLE profiles (
  user_id TEXT PRIMARY KEY,
  name TEXT,
  birth_date TEXT NOT NULL,             -- YYYY-MM-DD, local date at the birth place
  birth_time TEXT,                      -- HH:MM local, NULL when unknown
  place TEXT NOT NULL,                  -- as chosen from the place search
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  tz_offset_min INTEGER NOT NULL,       -- minutes east of UTC at the birth place (India: 330)
  consent_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE palm_photos (
  user_id TEXT NOT NULL,
  hand TEXT NOT NULL CHECK (hand IN ('left', 'right')),
  mime TEXT NOT NULL,
  data BLOB NOT NULL,                   -- JPEG, at most 1280 px on the long side
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, hand)
);
