-- Coupons: who used which coupon. The code itself is a server secret, never stored here.
-- One row per account and coupon, so each account can use a coupon only once.
CREATE TABLE coupon_redemptions (
  user_id TEXT NOT NULL,
  coupon TEXT NOT NULL,
  redeemed_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, coupon)
);
