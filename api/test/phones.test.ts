import assert from 'node:assert/strict';
import { test } from 'node:test';

import { maskPhone, normalizePhone, PhoneError, startPhone, verifiedPhone, verifyPhone } from '../src/phones.ts';
import { d1 } from './d1.ts';

test('phone numbers: Indian mobiles in any common format; others refused', () => {
  for (const n of ['9876543210', '+91 98765 43210', '09876543210', '919876543210', '+91-98765-43210']) assert.equal(normalizePhone(n), '+919876543210', n);
  for (const n of ['12345', '5876543210', '+1 415 555 0100', '98765432101', 42]) assert.equal(normalizePhone(n), null, String(n));
  assert.equal(maskPhone('+919876543210'), '+91 98••••3210');
});

test('phone check: code sent on WhatsApp, verified once, number then belongs to one account', async () => {
  const { db, raw } = d1();
  const sent: { to: string; text: string }[] = [];
  const send = async (to: string, text: string) => void sent.push({ to, text });
  let now = 1_000_000;

  await startPhone(db, 'u1', '98765 43210', 'salt', send, now);
  assert.equal(sent[0].to, '+919876543210');
  const code = /\b(\d{6})\b/.exec(sent[0].text)![1];
  assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM phone_codes WHERE code_hash = ?').get(code)?.n, 0, 'the code itself is never stored');

  await assert.rejects(startPhone(db, 'u1', '9876543210', 'salt', send, now + 10_000), /wait a minute/);
  await assert.rejects(verifyPhone(db, 'u1', '000000' === code ? '111111' : '000000', 'salt', now), /isn’t right/);
  assert.deepEqual(await verifyPhone(db, 'u1', code, 'salt', now + 5000), { phone: '+91 98••••3210' });
  assert.equal(await verifiedPhone(db, 'u1'), '+919876543210');

  // Another account can't take the same number.
  await assert.rejects(startPhone(db, 'u2', '+91 9876543210', 'salt', send, now), (e: PhoneError) => e.status === 409);

  // Codes expire, and wrong guesses run out.
  now += 100_000;
  await startPhone(db, 'u3', '9123456780', 'salt', send, now);
  await assert.rejects(verifyPhone(db, 'u3', '123456', 'salt', now + 11 * 60_000), /expired/);
  now += 120_000;
  await startPhone(db, 'u3', '9123456780', 'salt', send, now);
  for (let i = 0; i < 5; i++) await assert.rejects(verifyPhone(db, 'u3', 'x', 'salt', now));
  await assert.rejects(verifyPhone(db, 'u3', /\b(\d{6})\b/.exec(sent.at(-1)!.text)![1], 'salt', now), /Too many wrong codes/);
});

test('phone check: five codes a day per account', async () => {
  const { db } = d1();
  const send = async () => {};
  let now = Date.parse('2026-11-15T04:00:00Z');
  for (let i = 0; i < 5; i++, now += 61_000) await startPhone(db, 'u1', '9876543210', 'salt', send, now);
  await assert.rejects(startPhone(db, 'u1', '9876543210', 'salt', send, now), /tomorrow/);
});
