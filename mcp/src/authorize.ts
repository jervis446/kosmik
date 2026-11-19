/**
 * Signing in from Claude or ChatGPT with the Asanoha account.
 *
 * 1. GET /authorize: the OAuth library checks the request and starts a consent transaction bound to
 *    this browser (a cookie on this Worker). The person is sent to Kosmik's /connect page.
 * 2. Kosmik's /connect page (where they're signed in) shows which app is asking. On Allow it calls
 *    POST /connect/code with their Asanoha session token; we check it with Supabase, as the API does,
 *    and hand back a one-time code (two minutes) tied to that account and transaction.
 * 3. The page opens GET /authorize/finish?code=…; with the browser cookie from step 1 the consent is
 *    approved and the app gets its authorization code. Cancel opens GET /authorize/deny instead.
 */
// Types only: the library itself loads a Workers-only module, so its errors are recognised by name.
import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider';

import { Unauthorized, userFromRequest } from '../../api/src/auth.ts';
import type { Env as ApiEnv } from '../../api/src/types.ts';

export type AuthEnv = {
  OAUTH_KV: KVNamespace;
  OAUTH_PROVIDER: OAuthHelpers;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  /** Kosmik's website, where /connect lives. */
  SITE_URL: string;
  /** Sites allowed to ask for a connect code (comma-separated). */
  ALLOWED_ORIGINS: string;
};

const CODE_TTL_SECONDS = 120;
const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const page = (message: string, status = 400) =>
  new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Kosmik</title><body style="font-family:system-ui;padding:24px;max-width:520px;margin:auto"><h1>Kosmik</h1><p>${escape(message)}</p>`, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });

/** OAuth errors: back to the app when its redirect is trusted, otherwise shown here. */
function oauthError(e: unknown): Response {
  const err = e as { name?: string; redirectTo?: string; description?: string };
  if (err?.name === 'AuthorizationError') {
    if (err.redirectTo) return Response.redirect(err.redirectTo, 302);
    return page(err.description || 'This sign-in link has expired or was already used. Start again from Claude or ChatGPT.');
  }
  if (err?.name === 'CimdFetchError') return page('This app could not be verified.');
  throw e;
}

export async function handleAuthorize(req: Request, env: AuthEnv): Promise<Response> {
  try {
    const oauth = env.OAUTH_PROVIDER;
    const request = await oauth.parseAuthRequest(req);
    const details = await oauth.describeConsent(request);
    const consent = await oauth.beginConsent(request);
    const to = new URL('/connect', env.SITE_URL);
    to.searchParams.set('handle', consent.handle);
    to.searchParams.set('app', details.clientName.slice(0, 80));
    to.searchParams.set('host', details.redirectHost);
    if (details.redirectIsLoopback) to.searchParams.set('local', '1');
    const headers = new Headers(consent.headers);
    headers.set('Location', to.toString());
    return new Response(null, { status: 302, headers });
  } catch (e) {
    return oauthError(e);
  }
}

function cors(req: Request, env: AuthEnv): Record<string, string> | null {
  const origin = req.headers.get('origin') ?? '';
  const allowed = env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
  if (!allowed.includes(origin)) return null;
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-max-age': '600',
    vary: 'Origin',
  };
}

export async function handleConnectCode(req: Request, env: AuthEnv): Promise<Response> {
  const h = cors(req, env);
  if (!h) return new Response('Not allowed from this site.', { status: 403 });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { ...h, 'cache-control': 'no-store' } });
  let userId: string | null;
  try {
    userId = await userFromRequest(req, { SUPABASE_URL: env.SUPABASE_URL, SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY } as ApiEnv);
  } catch (e) {
    if (e instanceof Unauthorized) return json({ error: 'Please sign in again.' }, 401);
    throw e;
  }
  if (!userId) return json({ error: 'Please sign in first.' }, 401);
  const body = (await req.json().catch(() => ({}))) as { handle?: unknown };
  const handle = typeof body.handle === 'string' && body.handle.length <= 200 ? body.handle : '';
  if (!handle) return json({ error: 'This sign-in link is incomplete. Start again from Claude or ChatGPT.' }, 400);
  const code = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  await env.OAUTH_KV.put(`connect:${code}`, JSON.stringify({ userId, handle }), { expirationTtl: CODE_TTL_SECONDS });
  return json({ code });
}

export async function handleFinish(req: Request, env: AuthEnv): Promise<Response> {
  const code = new URL(req.url).searchParams.get('code') ?? '';
  const key = `connect:${code}`;
  const raw = code ? await env.OAUTH_KV.get(key) : null;
  if (!raw) return page('This sign-in link has expired or was already used. Start again from Claude or ChatGPT.');
  await env.OAUTH_KV.delete(key);
  const { userId, handle } = JSON.parse(raw) as { userId: string; handle: string };
  try {
    const oauth = env.OAUTH_PROVIDER;
    const approved = await oauth.approveConsent(req, handle);
    const { redirectTo } = await oauth.completeAuthorization({
      request: approved.request,
      userId,
      metadata: {},
      scope: approved.request.scope,
      props: { userId },
    });
    const headers = new Headers(approved.headers);
    headers.set('Location', redirectTo);
    return new Response(null, { status: 302, headers });
  } catch (e) {
    return oauthError(e);
  }
}

export async function handleDeny(req: Request, env: AuthEnv): Promise<Response> {
  const handle = new URL(req.url).searchParams.get('handle') ?? '';
  try {
    const denied = await env.OAUTH_PROVIDER.denyConsent(req, handle);
    return new Response(null, { status: 302, headers: denied.headers });
  } catch (e) {
    return oauthError(e);
  }
}
