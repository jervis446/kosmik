-- Hindi library: a Hindi rendering of each Gita verse and each herb's Devanagari name.
-- Hindi meaning cards go in the existing meanings table with lang = 'hi'.
ALTER TABLE verses ADD COLUMN translation_hi TEXT;
ALTER TABLE herbs ADD COLUMN name_hi TEXT;
