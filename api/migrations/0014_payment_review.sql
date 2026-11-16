-- Manual UPI: access is given as soon as the payer submits a UTR ("provisional"), and the owner
-- approves or declines it after checking the bank statement. Five declines block an account.
ALTER TABLE payments ADD COLUMN provisional_at INTEGER;   -- when access was given on the payer's UTR
ALTER TABLE payments ADD COLUMN reviewed TEXT;            -- 'approved' | 'declined', by the owner
ALTER TABLE payments ADD COLUMN reviewed_at INTEGER;
CREATE INDEX payments_utr ON payments (utr);

-- Accounts that may not buy: added after five declined payments, lifted by the owner.
CREATE TABLE payment_blocks (
  user_id TEXT PRIMARY KEY,
  blocked_at INTEGER NOT NULL,
  unblocked_at INTEGER,                 -- set when the owner lifts the block; declines count again from here
  reason TEXT
);
