-- Reports: deep one-time readings, unlocked with report credits bought as UPI packs.

-- Payments now also sell report packs (r1, r3, r10). SQLite can't change a CHECK, so the table
-- is rebuilt with the wider plan list and a credits column (days stays 0 for packs).
CREATE TABLE payments_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  plan TEXT NOT NULL CHECK (plan IN ('week', 'month', 'r1', 'r3', 'r10')),
  amount_paise INTEGER NOT NULL,
  days INTEGER NOT NULL,
  credits INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'expired', 'cancelled')),
  gateway_payment_id TEXT,
  utr TEXT,
  note TEXT,
  created_at INTEGER NOT NULL,
  paid_at INTEGER
);
INSERT INTO payments_new (id, user_id, plan, amount_paise, days, status, gateway_payment_id, utr, note, created_at, paid_at)
  SELECT id, user_id, plan, amount_paise, days, status, gateway_payment_id, utr, note, created_at, paid_at FROM payments;
DROP TABLE payments;
ALTER TABLE payments_new RENAME TO payments;
CREATE INDEX payments_user ON payments (user_id, created_at);

-- Credits left to unlock reports.
CREATE TABLE report_credits (
  user_id TEXT PRIMARY KEY,
  credits INTEGER NOT NULL DEFAULT 0 CHECK (credits >= 0)
);

-- A report, once written, is kept for its owner (and deleted with their details).
CREATE TABLE reports (
  user_id TEXT NOT NULL,
  report_key TEXT NOT NULL,
  lang TEXT NOT NULL,
  content TEXT NOT NULL,                -- JSON: the written report
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, report_key)
);
