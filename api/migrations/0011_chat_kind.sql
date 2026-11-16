-- Kosmik chats and Ayurveda chats are kept apart: each conversation is one or the other.
ALTER TABLE conversations ADD COLUMN kind TEXT NOT NULL DEFAULT 'kosmik' CHECK (kind IN ('kosmik', 'ayurveda'));
