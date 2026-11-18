-- Chats started from a report: the conversation keeps the report it came from, so every answer in
-- it can read that report. Nullable and additive; existing chats have none.
ALTER TABLE conversations ADD COLUMN report_key TEXT;
