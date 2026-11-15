-- Errors from the app and the server, for fixing bugs. Technical details only (no questions,
-- birth details or photos). Similar errors are grouped by fingerprint. Deleted after 30 days.
CREATE TABLE errors (
  fingerprint TEXT NOT NULL,            -- hash of source + kind + message
  day TEXT NOT NULL,                    -- India date
  source TEXT NOT NULL CHECK (source IN ('client', 'server')),
  kind TEXT NOT NULL,                   -- e.g. 'window', 'promise', 'render', 'api', 'ai', 'relay', 'worker'
  message TEXT NOT NULL,
  detail TEXT,                          -- stack or request path, trimmed
  path TEXT,                            -- page or API path
  release TEXT,
  user_id TEXT,                         -- last account that hit it, if signed in
  count INTEGER NOT NULL DEFAULT 1,
  first_at INTEGER NOT NULL,
  last_at INTEGER NOT NULL,
  PRIMARY KEY (fingerprint, day)
);
CREATE INDEX errors_recent ON errors (last_at DESC);
