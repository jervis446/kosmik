-- Premium bought through Noha Pay (UPI). One row per checkout; the id is the gateway order id.
-- Money goes straight to the merchant's UPI account; the gateway tells us once a payment is
-- confirmed (src/payments.ts), and only then is premium.until extended.
CREATE TABLE payments (
  id TEXT PRIMARY KEY,                  -- uuid, sent to the gateway as orderId
  user_id TEXT NOT NULL,
  plan TEXT NOT NULL CHECK (plan IN ('week', 'month')),
  amount_paise INTEGER NOT NULL,
  days INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'expired', 'cancelled')),
  gateway_payment_id TEXT,
  utr TEXT,                             -- UPI reference, to match against the bank statement
  note TEXT,                            -- why a payment was not applied (e.g. amount mismatch)
  created_at INTEGER NOT NULL,
  paid_at INTEGER
);
CREATE INDEX payments_user ON payments (user_id, created_at);
