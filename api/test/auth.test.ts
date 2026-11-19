import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { signedInUser, userFromRequest } from '../src/auth.ts';
import type { Env } from '../src/types.ts';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const env = { SUPABASE_URL: 'https://supabase.test', SUPABASE_ANON_KEY: 'anon' } as Env;
const req = (token: string) => new Request('https://api.test/api/coupon', { headers: { authorization: `Bearer ${token}` } });
const supabaseSays = (user: Record<string, unknown>) => {
  globalThis.fetch = (async () => Response.json(user)) as unknown as typeof fetch;
};

test('signed-in user: the email comes back only once Supabase has confirmed it', async () => {
  supabaseSays({ id: 'u1', email: 'Student@iimidr.ac.in', email_confirmed_at: '2026-11-01T00:00:00Z' });
  assert.deepEqual(await signedInUser(req('tok-confirmed'), env), { id: 'u1', email: 'student@iimidr.ac.in' });
  supabaseSays({ id: 'u2', email: 'someone@iimidr.ac.in', email_confirmed_at: null });
  assert.deepEqual(await signedInUser(req('tok-unconfirmed'), env), { id: 'u2', email: null });
  assert.equal(await userFromRequest(req('tok-confirmed'), env), 'u1', 'the id-only check still works, from the cache');
  assert.equal(await signedInUser(new Request('https://api.test/'), env), null, 'no token');
});
