import assert from 'node:assert/strict';
import { test } from 'node:test';

import { COUPON_TRIES_PER_DAY, couponEligible, couponStatus, CouponError, redeemCoupon } from '../src/coupons.ts';
import { d1 } from './d1.ts';

const NOW = Date.parse('2026-11-19T06:00:00Z');
const CODE = 'TestCode42';
const env = { COUPON_IIMIDR: CODE };
const IIM = { id: 'u1', email: 'student@iimidr.ac.in' };

const credits = (raw: ReturnType<typeof d1>['raw'], user = 'u1') =>
  (raw.prepare('SELECT credits FROM report_credits WHERE user_id = ?').get(user) as { credits: number } | undefined)?.credits ?? 0;

const fails = async (p: Promise<unknown>, status: number, message: RegExp) => {
  await assert.rejects(p, (e: unknown) => {
    assert.ok(e instanceof CouponError, String(e));
    assert.equal(e.status, status);
    assert.match(e.message, message);
    return true;
  });
};

test('eligible: only a confirmed @iimidr.ac.in sign-in, whatever the case', () => {
  assert.equal(couponEligible('student@iimidr.ac.in'), true);
  assert.equal(couponEligible('Student@IIMIDR.AC.IN'), true);
  assert.equal(couponEligible('student@gmail.com'), false);
  assert.equal(couponEligible('student@iimidr.ac.in.evil.com'), false);
  assert.equal(couponEligible('student@notiimidr.ac.in'), false);
  assert.equal(couponEligible(null), false);
});

test('status: shown only to eligible accounts while a coupon is running, and says when it’s used', async () => {
  const { db } = d1();
  assert.deepEqual(await couponStatus(db, env, IIM), { eligible: true, used: false });
  assert.deepEqual(await couponStatus(db, env, { id: 'u2', email: 'a@gmail.com' }), { eligible: false, used: false });
  assert.deepEqual(await couponStatus(db, {}, IIM), { eligible: false, used: false }, 'no coupon set on the server');
  await redeemCoupon(db, env, IIM, CODE, NOW);
  assert.deepEqual(await couponStatus(db, env, IIM), { eligible: true, used: true });
});

test('redeem: the right code gives one report credit, once per account; capitals don’t matter', async () => {
  const { db, raw } = d1();
  assert.deepEqual(await redeemCoupon(db, env, IIM, '  testcode42 ', NOW), { credits: 1 });
  assert.equal(credits(raw), 1);
  await fails(redeemCoupon(db, env, IIM, CODE, NOW), 409, /already used/);
  assert.equal(credits(raw), 1, 'no second credit');
  // Adds to credits already bought.
  raw.prepare("INSERT INTO report_credits (user_id, credits) VALUES ('u3', 2)").run();
  assert.deepEqual(await redeemCoupon(db, env, { id: 'u3', email: 'x@iimidr.ac.in' }, CODE, NOW), { credits: 3 });
});

test('redeem: other accounts and missing coupons get nothing', async () => {
  const { db, raw } = d1();
  await fails(redeemCoupon(db, env, { id: 'u2', email: 'a@gmail.com' }, CODE, NOW), 403, /isn’t available/);
  await fails(redeemCoupon(db, {}, IIM, CODE, NOW), 403, /isn’t available/);
  assert.equal(credits(raw, 'u2'), 0);
  assert.equal(credits(raw), 0);
});

test('redeem: wrong codes are refused, and after 5 tries in a day even the right one waits until tomorrow', async () => {
  const { db, raw } = d1();
  assert.equal(COUPON_TRIES_PER_DAY, 5);
  for (let i = 0; i < 5; i++) await fails(redeemCoupon(db, env, IIM, `nope${i}`, NOW), 400, /isn’t right/);
  await fails(redeemCoupon(db, env, IIM, CODE, NOW), 429, /tomorrow/);
  assert.equal(credits(raw), 0);
  assert.deepEqual(await redeemCoupon(db, env, IIM, CODE, NOW + 86_400_000), { credits: 1 }, 'a new day');
});

test('redeem: an empty or odd code is just a wrong code', async () => {
  const { db } = d1();
  await fails(redeemCoupon(db, env, IIM, '', NOW), 400, /isn’t right/);
  await fails(redeemCoupon(db, env, IIM, 42, NOW), 400, /isn’t right/);
});
