-- How the person likes to be addressed (and, for chart questions about partners, their gender).
ALTER TABLE profiles ADD COLUMN gender TEXT CHECK (gender IN ('female', 'male', 'other'));
