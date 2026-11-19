import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { handleAuthorize, handleConnectCode, handleDeny, handleFinish, type AuthEnv } from '../src/authorize.ts';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const MCP = 'https://kosmik-mcp.test';
const SITE = 'https://kosmik.asanoha.co.in';

function fakeEnv() {
  const kv = new Map<string, string>();
  const calls: { approved?: { handle: string }; completed?: { userId: string; props: unknown }; denied?: string } = {};
  const authRequest = { clientId: 'c1', redirectUri: 'https://claude.ai/api/mcp/auth_callback', scope: ['kosmik'], state: 's' };
  const env = {
    SUPABASE_URL: 'https://supabase.test',
    SUPABASE_ANON_KEY: 'anon',
    SITE_URL: SITE,
    ALLOWED_ORIGINS: `${SITE},http://localhost:8081`,
    OAUTH_KV: {
      get: async (k: string) => kv.get(k) ?? null,
      put: async (k: string, v: string) => void kv.set(k, v),
      delete: async (k: string) => void kv.delete(k),
    },
    OAUTH_PROVIDER: {
      parseAuthRequest: async () => authRequest,
      describeConsent: async () => ({ clientId: 'c1', clientName: 'Claude <b>', redirectUri: authRequest.redirectUri, redirectHost: 'claude.ai', redirectIsLoopback: false, scope: ['kosmik'] }),
      beginConsent: async () => ({ handle: 'h1', headers: new Headers({ 'Set-Cookie': '__Host-oauth-consent-x=y; Path=/; Secure; HttpOnly; SameSite=Lax' }) }),
      approveConsent: async (_req: Request, handle: string) => {
        calls.approved = { handle };
        return { request: authRequest, headers: new Headers({ 'Cache-Control': 'no-store' }) };
      },
      completeAuthorization: async (o: { userId: string; props: unknown }) => {
        calls.completed = o;
        return { redirectTo: 'https://claude.ai/api/mcp/auth_callback?code=abc&state=s' };
      },
      denyConsent: async (_req: Request, handle: string) => {
        calls.denied = handle;
        return { headers: new Headers({ Location: 'https://claude.ai/api/mcp/auth_callback?error=access_denied&state=s' }) };
      },
    },
  } as unknown as AuthEnv;
  return { env, kv, calls };
}

const supabaseSays = (user: { id?: string } | null) => {
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    assert.match(String(url), /\/auth\/v1\/user$/);
    const auth = new Headers(init.headers).get('authorization');
    if (!user || auth !== 'Bearer good-token') return new Response('{}', { status: 401 });
    return Response.json(user);
  }) as typeof fetch;
};

test('authorize: starts consent and sends the person to Kosmik’s connect page, keeping the browser cookie', async () => {
  const { env } = fakeEnv();
  const res = await handleAuthorize(new Request(`${MCP}/authorize?response_type=code`), env);
  assert.equal(res.status, 302);
  const to = new URL(res.headers.get('location')!);
  assert.equal(`${to.origin}${to.pathname}`, `${SITE}/connect`);
  assert.equal(to.searchParams.get('handle'), 'h1');
  assert.equal(to.searchParams.get('app'), 'Claude <b>', 'the app escapes it when showing it');
  assert.equal(to.searchParams.get('host'), 'claude.ai');
  assert.equal(to.searchParams.get('mcp'), null, 'the app knows the MCP address itself; a link can’t change where the token goes');
  assert.match(res.headers.get('set-cookie') ?? '', /__Host-oauth-consent/);
});

test('connect code: only for a real Asanoha sign-in, from Kosmik’s own site', async () => {
  const { env, kv } = fakeEnv();
  supabaseSays({ id: 'user-1' });
  const post = (token: string | null, origin = SITE) =>
    handleConnectCode(
      new Request(`${MCP}/connect/code`, {
        method: 'POST',
        headers: { origin, 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ handle: 'h1' }),
      }),
      env,
    );
  assert.equal((await post(null)).status, 401);
  assert.equal((await post('bad-token')).status, 401);
  assert.equal((await post('good-token', 'https://evil.test')).status, 403);
  const ok = await post('good-token');
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('access-control-allow-origin'), SITE);
  const { code } = (await ok.json()) as { code: string };
  assert.match(code, /^[A-Za-z0-9_-]{32,}$/);
  assert.deepEqual(JSON.parse(kv.get(`connect:${code}`)!), { userId: 'user-1', handle: 'h1' });
  // The browser's preflight is answered for Kosmik's site.
  const pre = await handleConnectCode(new Request(`${MCP}/connect/code`, { method: 'OPTIONS', headers: { origin: SITE } }), env);
  assert.equal(pre.status, 204);
  assert.match(pre.headers.get('access-control-allow-headers') ?? '', /authorization/i);
});

test('finish: a connect code completes the sign-in once, for that account', async () => {
  const { env, kv, calls } = fakeEnv();
  kv.set('connect:CODE', JSON.stringify({ userId: 'user-1', handle: 'h1' }));
  const res = await handleFinish(new Request(`${MCP}/authorize/finish?code=CODE`), env);
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), 'https://claude.ai/api/mcp/auth_callback?code=abc&state=s');
  assert.deepEqual(calls.approved, { handle: 'h1' });
  assert.equal(calls.completed?.userId, 'user-1');
  assert.deepEqual(calls.completed?.props, { userId: 'user-1' });
  const again = await handleFinish(new Request(`${MCP}/authorize/finish?code=CODE`), env);
  assert.equal(again.status, 400, 'a code works only once');
});

test('deny: the person said no, and the app is told so', async () => {
  const { env, calls } = fakeEnv();
  const res = await handleDeny(new Request(`${MCP}/authorize/deny?handle=h1`), env);
  assert.equal(res.status, 302);
  assert.match(res.headers.get('location') ?? '', /error=access_denied/);
  assert.equal(calls.denied, 'h1');
});
