-- Cached answers remember a fingerprint of the library text they were built from, so an answer
-- whose cited verse or meaning has since been edited (or reviewed) is retired, not served.
-- NULL (answers cached before this migration) counts as out of date.
ALTER TABLE answer_cache ADD COLUMN sources_hash TEXT;

-- For the daily clean-up (src/retention.ts).
CREATE INDEX conversations_updated ON conversations (updated_at);
CREATE INDEX answer_cache_last_used ON answer_cache (reviewed, last_hit_at, created_at);
