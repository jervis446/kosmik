import assert from 'node:assert/strict';
import { test } from 'node:test';

import { errorSummary, recordError, scrub } from '../src/errors.ts';
import { purgeExpired } from '../src/retention.ts';
import { d1 } from './d1.ts';

test('errors: personal data is scrubbed', () => {
  assert.equal(scrub('failed for asha@example.com on +91 98765 43210 with bearer abc.def'), 'failed for [email] on [number] with bearer [hidden]');
  assert.equal(scrub('jwt eyJhbGciOi.eyJzdWIiOi.sig123 bad'), 'jwt [token] bad');
});

test('errors: the same bug is grouped per day, summarised for the owner, and deleted after 30 days', async () => {
  const { db } = d1();
  const now = Date.parse('2026-11-15T06:00:00Z');
  await recordError(db, { source: 'client', kind: 'window', message: 'TypeError: x is undefined at 123', path: '/chat', userId: 'u1' }, now);
  await recordError(db, { source: 'client', kind: 'window', message: 'TypeError: x is undefined at 456', path: '/chat', userId: 'u2' }, now + 1000);
  await recordError(db, { source: 'server', kind: 'ai', message: 'Gemini failed (503)' }, now + 2000);
  await recordError(db, { source: 'client', kind: 'nonsense', message: 'odd' }, now + 3000);
  const { groups, days } = await errorSummary(db, now + 5000);
  assert.equal(groups.length, 3);
  const win = groups.find((g) => g.kind === 'window') as { count: number };
  assert.equal(win.count, 2, 'the same bug with different numbers is one row');
  assert.ok(groups.some((g) => g.kind === 'other'), 'unknown kinds are stored as other');
  assert.equal(days.length, 2);
  const purged = await purgeExpired(db, now + 31 * 86_400_000);
  assert.equal(purged.errors, 3);
});
