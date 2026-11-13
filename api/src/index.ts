/**
 * Kosmik API and web app host (Cloudflare Worker).
 *   POST /api/ask                 ask a question (signed in)
 *   GET/PUT/DELETE /api/profile   your birth details (and which palm photos are saved)
 *   GET/PUT/DELETE /api/palm-photo/:hand   a saved palm photo (left or right)
 *   GET  /api/places?q=           birth place search
 *   GET  /api/conversations       your conversations
 *   GET  /api/conversations/:id   messages in one of your conversations
 *   DELETE /api/conversations/:id delete one of your conversations
 *   POST /api/feedback            👍 / 👎 on an answer
 *   GET  /api/verse-of-the-day    the day's verse
 *   GET  /api/me                  your plan: Premium end date, plans on sale
 *   POST /api/pay                 start a Premium payment (Noha Pay, UPI); see payments.ts
 *   GET  /api/pay/:id             a payment's status
 *   POST /api/pay/webhook         Noha Pay confirms a payment
 *   GET  /api/health
 * / is the landing page; everything else is the web app (static files, single-page fallback).
 */
import { GeminiAi } from './ai.ts';
import { isPremium, Unauthorized, userFromRequest } from './auth.ts';
import { planFor } from './lib/limits.ts';
import { handleWebhook, PaymentError, paymentsEnabled, paymentStatus, PLANS, premiumUntil, startPayment } from './payments.ts';
import { ask, BadQuestion, verseOfTheDay } from './pipeline.ts';
import { D1Profiles, MAX_PHOTO_BASE64, ProfileError, searchPlaces } from './profiles.ts';
import { purgeExpired } from './retention.ts';
import { D1AnswerCache, D1History, D1Library, D1Usage, MemoryVectorSearch, VectorizeSearch } from './store.ts';
import type { Env } from './types.ts';

const MAX_BODY = 4096;

const SECURITY_HEADERS: Record<string, string> = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'cache-control': 'no-store',
};

function corsHeaders(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get('origin');
  const allowed = (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!origin || !allowed.includes(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-max-age': '600',
    vary: 'Origin',
  };
}

const json = (req: Request, env: Env, data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...SECURITY_HEADERS, ...corsHeaders(req, env) } });

const error = (req: Request, env: Env, message: string, status: number) => json(req, env, { error: message }, status);

async function readJson(req: Request, max = MAX_BODY): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (text.length > max) throw new BadQuestion('Request too large.');
  try {
    const body = JSON.parse(text);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body as Record<string, unknown>;
  } catch {
    throw new BadQuestion('Request body must be JSON.');
  }
}

const gemini = (env: Env) => new GeminiAi({ apiKey: env.GEMINI_API_KEY, model: env.CHAT_MODEL, baseUrl: env.GEMINI_BASE_URL, reasoningEffort: env.REASONING_EFFORT });

async function requireUser(req: Request, env: Env): Promise<string> {
  const id = await userFromRequest(req, env);
  if (!id) throw new Unauthorized('Please sign in.');
  return id;
}

async function handleApi(req: Request, env: Env, url: URL): Promise<Response> {
  const path = url.pathname;
  const now = Date.now();

  if (path === '/api/health') return json(req, env, { ok: true });

  // The gateway signs its notifications; they are not rate limited per IP like people are.
  if (path === '/api/pay/webhook' && req.method === 'POST') {
    const body = await req.text();
    if (body.length > MAX_BODY) return error(req, env, 'Request too large.', 413);
    const result = await handleWebhook(env, env.DB, req.headers, body, now);
    return json(req, env, result.body, result.status);
  }

  if (env.RATE_LIMITER && req.method !== 'GET') {
    const ip = req.headers.get('cf-connecting-ip') ?? 'unknown';
    if (!(await env.RATE_LIMITER.limit({ key: ip })).success) return error(req, env, 'Too many requests. Please wait a minute.', 429);
  }

  if (path === '/api/ask' && req.method === 'POST') {
    const body = await readJson(req);
    if (typeof body.question !== 'string') throw new BadQuestion('Ask a question to get started.');
    // Kosmik is for signed-in people: limits, history and personal details all hang off the account.
    const userId = await requireUser(req, env);
    const identity = { kind: 'user' as const, id: userId, premium: await isPremium(env.DB, userId, now) };
    const result = await ask(
      {
        library: new D1Library(env.DB),
        cache: new D1AnswerCache(env.DB),
        vectors: env.VECTORS ? new VectorizeSearch(env.VECTORS) : new MemoryVectorSearch(env.DB),
        usage: new D1Usage(env.DB),
        history: new D1History(env.DB),
        ai: gemini(env),
        profiles: new D1Profiles(env.DB),
      },
      {
        question: body.question,
        lang: typeof body.lang === 'string' ? body.lang : undefined,
        identity,
        conversationId: typeof body.conversationId === 'string' ? body.conversationId : null,
      },
    );
    return json(req, env, result);
  }

  // My details: birth details for the kundli and photos of both palms.
  if (path === '/api/profile') {
    const userId = await requireUser(req, env);
    const profiles = new D1Profiles(env.DB);
    if (req.method === 'GET') return json(req, env, { details: await profiles.get(userId), palms: await profiles.palmStatus(userId) });
    if (req.method === 'PUT') return json(req, env, { details: await profiles.save(userId, await readJson(req), now) });
    if (req.method === 'DELETE') {
      await profiles.deleteAll(userId);
      return json(req, env, { deleted: true });
    }
  }

  const palmMatch = /^\/api\/palm-photo\/(left|right)$/.exec(path);
  if (palmMatch) {
    const userId = await requireUser(req, env);
    const profiles = new D1Profiles(env.DB);
    if (req.method === 'GET') {
      const photo = await profiles.palm(userId, palmMatch[1] as 'left' | 'right');
      return photo ? json(req, env, photo) : error(req, env, 'No photo saved for this hand.', 404);
    }
    if (req.method === 'PUT') {
      await profiles.savePalm(userId, palmMatch[1], await readJson(req, MAX_PHOTO_BASE64 + 1000), now);
      return json(req, env, { saved: true });
    }
    if (req.method === 'DELETE') {
      await profiles.deletePalm(userId, palmMatch[1]);
      return json(req, env, { deleted: true });
    }
  }

  if (path === '/api/places' && req.method === 'GET') {
    await requireUser(req, env);
    if (env.RATE_LIMITER && !(await env.RATE_LIMITER.limit({ key: `places:${req.headers.get('cf-connecting-ip') ?? 'unknown'}` })).success) {
      return error(req, env, 'Too many searches. Please wait a minute.', 429);
    }
    try {
      return json(req, env, { places: await searchPlaces(url.searchParams.get('q') ?? '', env.NOMINATIM_URL) });
    } catch (e) {
      console.error('place search failed', (e as Error).message);
      return error(req, env, 'Place search isn’t working right now. Please try again shortly.', 502);
    }
  }

  if (path === '/api/conversations' && req.method === 'GET') {
    const userId = await requireUser(req, env);
    const { results } = await env.DB.prepare('SELECT id, title, updated_at AS updatedAt FROM conversations WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50')
      .bind(userId)
      .all();
    return json(req, env, { conversations: results });
  }

  const conv = /^\/api\/conversations\/([0-9a-f-]{36})$/.exec(path);
  if (conv) {
    const userId = await requireUser(req, env);
    const own = await env.DB.prepare('SELECT id, title FROM conversations WHERE id = ? AND user_id = ?').bind(conv[1], userId).first<{ id: string; title: string }>();
    if (!own) return error(req, env, 'Conversation not found.', 404);
    if (req.method === 'DELETE') {
      await env.DB.batch([
        env.DB.prepare('DELETE FROM feedback WHERE message_id IN (SELECT id FROM messages WHERE conversation_id = ?)').bind(own.id),
        env.DB.prepare('DELETE FROM messages WHERE conversation_id = ?').bind(own.id),
        env.DB.prepare('DELETE FROM conversations WHERE id = ?').bind(own.id),
      ]);
      return json(req, env, { deleted: true });
    }
    if (req.method === 'GET') {
      const { results } = await env.DB.prepare(
        `SELECT m.id, m.role, m.content, m.blocks, m.layer, m.created_at AS createdAt, f.value AS feedback
         FROM messages m LEFT JOIN feedback f ON f.message_id = m.id WHERE m.conversation_id = ? ORDER BY m.created_at`,
      )
        .bind(own.id)
        .all<{ blocks: string | null }>();
      return json(req, env, { id: own.id, title: own.title, messages: results.map((m) => ({ ...m, blocks: m.blocks ? JSON.parse(m.blocks) : null })) });
    }
  }

  if (path === '/api/feedback' && req.method === 'POST') {
    const userId = await requireUser(req, env);
    const body = await readJson(req);
    const value = body.value === 1 || body.value === -1 ? body.value : null;
    if (typeof body.messageId !== 'string' || value === null) throw new BadQuestion('Send a message and a value of 1 or -1.');
    const msg = await env.DB.prepare(
      "SELECT m.id, m.cache_id AS cacheId FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE m.id = ? AND c.user_id = ? AND m.role = 'assistant'",
    )
      .bind(body.messageId, userId)
      .first<{ id: string; cacheId: number | null }>();
    if (!msg) return error(req, env, 'Message not found.', 404);
    const prev = await env.DB.prepare('SELECT value FROM feedback WHERE message_id = ?').bind(msg.id).first<{ value: number }>();
    const stmts = [
      env.DB.prepare('INSERT INTO feedback (message_id, user_id, value, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (message_id) DO UPDATE SET value = excluded.value, created_at = excluded.created_at')
        .bind(msg.id, userId, value, now),
    ];
    if (msg.cacheId !== null && prev?.value !== value) {
      const up = (value === 1 ? 1 : 0) - (prev?.value === 1 ? 1 : 0);
      const down = (value === -1 ? 1 : 0) - (prev?.value === -1 ? 1 : 0);
      // A cached answer that keeps getting 👎 stops being served until someone reviews it.
      stmts.push(
        env.DB.prepare('UPDATE answer_cache SET up = up + ?, down = down + ?, disabled = CASE WHEN down + ? >= 3 AND down + ? > up + ? THEN 1 ELSE disabled END WHERE id = ?')
          .bind(up, down, down, down, up, msg.cacheId),
      );
    }
    await env.DB.batch(stmts);
    return json(req, env, { saved: true });
  }

  if (path === '/api/me' && req.method === 'GET') {
    const userId = await requireUser(req, env);
    const until = await premiumUntil(env.DB, userId, now);
    const plan = planFor(until ? 'premium' : 'starter', now);
    const used = plan.limit === null ? 0 : await new D1Usage(env.DB).count(`user:${userId}`, plan.period);
    return json(req, env, {
      premiumUntil: until,
      usage: { used, limit: plan.limit },
      paymentsEnabled: paymentsEnabled(env),
      plans: Object.entries(PLANS).map(([id, p]) => ({ id, ...p })),
    });
  }

  if (path === '/api/pay' && req.method === 'POST') {
    const userId = await requireUser(req, env);
    const body = await readJson(req);
    return json(req, env, await startPayment(env, env.DB, userId, body.plan, url.origin, now));
  }

  const payMatch = /^\/api\/pay\/(KM-[A-Z0-9]{12})$/.exec(path);
  if (payMatch && req.method === 'GET') {
    const userId = await requireUser(req, env);
    const status = await paymentStatus(env.DB, userId, payMatch[1], now);
    return status ? json(req, env, status) : error(req, env, 'Payment not found.', 404);
  }

  if (path === '/api/verse-of-the-day' && req.method === 'GET') {
    const verse = await verseOfTheDay(new D1Library(env.DB), now);
    return verse ? json(req, env, { verse }) : error(req, env, 'No verses loaded.', 503);
  }

  return error(req, env, 'Not found.', 404);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    // The landing page; the app is at /chat.
    if (url.pathname === '/' && (req.method === 'GET' || req.method === 'HEAD') && env.ASSETS) {
      return env.ASSETS.fetch(new Request(new URL('/landing', url), req));
    }
    if (!url.pathname.startsWith('/api/')) {
      return env.ASSETS ? env.ASSETS.fetch(req) : new Response('Not found', { status: 404 });
    }
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req, env) });
    try {
      return await handleApi(req, env, url);
    } catch (e) {
      if (e instanceof BadQuestion) return error(req, env, e.message, 400);
      if (e instanceof Unauthorized) return error(req, env, e.message, 401);
      if (e instanceof PaymentError) return error(req, env, e.message, e.status);
      if (e instanceof ProfileError) return error(req, env, e.message, 400);
      console.error('api error', (e as Error).message);
      return error(req, env, 'Something went wrong. Please try again.', 500);
    }
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(purgeExpired(env.DB, Date.now()).then((purged) => console.log('retention', JSON.stringify(purged))));
  },
} satisfies ExportedHandler<Env>;
