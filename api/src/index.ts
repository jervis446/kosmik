/**
 * Kosmik API and web app host (Cloudflare Worker).
 *   POST /api/ask                 ask a question (signed in)
 *   GET/PUT/DELETE /api/profile   your birth details (and which palm photos are saved, and your prakriti)
 *   PUT/DELETE /api/prakriti      your dosha quiz answers → your saved prakriti
 *   GET/PUT/DELETE /api/palm-photo/:hand   a saved palm photo (left or right)
 *   GET  /api/places?q=           birth place search
 *   GET  /api/conversations       your conversations
 *   GET  /api/conversations/:id   messages in one of your conversations
 *   DELETE /api/conversations/:id delete one of your conversations
 *   POST /api/feedback            👍 / 👎 on an answer
 *   GET  /api/verse-of-the-day    the day's verse
 *   GET  /api/me                  your plan: Premium end date, plans on sale, your WhatsApp number
 *   POST /api/phone/start         send a WhatsApp code to your number
 *   POST /api/phone/verify        check the code; the number is then linked to your account
 *   POST /api/pay                 start a Premium payment (Noha Pay, UPI); see payments.ts
 *   GET  /api/pay/:id             a payment's status
 *   POST /api/pay/webhook         Noha Pay confirms a payment
 *   POST /api/log                 an error report from the app (technical details only)
 *   GET  /api/admin/errors        the error log, for the owner
 *   GET  /api/health
 * / is the landing page; everything else is the web app (static files, single-page fallback).
 */
import { GeminiAi } from './ai.ts';
import { isPremium, Unauthorized, userFromRequest } from './auth.ts';
import { planFor } from './lib/limits.ts';
import { approvePayment, declinePayment, handleWebhook, PaymentError, paymentsEnabled, paymentStatus, paymentsForReview, PLANS, premiumUntil, startPayment, unblockPayer } from './payments.ts';
import { ask, BadQuestion, verseOfTheDay } from './pipeline.ts';
import { D1Profiles, MAX_PHOTO_BASE64, ProfileError, searchPlaces } from './profiles.ts';
import { getReport, listReports, reportContext, reportCredits, ReportError, unlockReport } from './reports.ts';
import { aggravated, AGNI_LABEL, D1Ayurveda, PrakritiError, prakritiLabel } from './ayurveda.ts';
import { purgeExpired } from './retention.ts';
import { errorSummary, logError } from './errors.ts';
import { snapshot } from './lib/snapshot.ts';
import { CALCULATORS, type Calculator, meBirth, parseBirth, runCalculator } from './calculators.ts';
import { calculateChart } from './lib/chart.ts';
import { toBirth } from './profiles.ts';
import { maskPhone, PhoneError, phoneCheckOn, relayReady, relaySender, startPhone, verifiedPhone, verifyPhone } from './phones.ts';
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
    'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
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

const astroMode = (env: Env) => (env.ASTRO_MODE === 'open' ? 'open' : 'safe');
const gemini = (env: Env) =>
  new GeminiAi({ apiKey: env.GEMINI_API_KEY, model: env.CHAT_MODEL, reportModel: env.REPORT_MODEL, baseUrl: env.GEMINI_BASE_URL, reasoningEffort: env.REASONING_EFFORT, astroMode: astroMode(env) });

async function requireUser(req: Request, env: Env): Promise<string> {
  const id = await userFromRequest(req, env);
  if (!id) throw new Unauthorized('Please sign in.');
  return id;
}

async function handleApi(req: Request, env: Env, url: URL, ctx?: ExecutionContext): Promise<Response> {
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
    const question = body.question;
    // Kosmik is for signed-in people: limits, history and personal details all hang off the account.
    const userId = await requireUser(req, env);
    // One free allowance per person: a verified WhatsApp number is needed first (when switched on).
    if (phoneCheckOn(env) && !(await verifiedPhone(env.DB, userId))) throw new PhoneError('Please verify your WhatsApp number to continue.', 403);
    const identity = { kind: 'user' as const, id: userId, premium: await isPremium(env.DB, userId, now) };
    const ai = gemini(env);
    const run = () => ask(
      {
        library: new D1Library(env.DB),
        cache: new D1AnswerCache(env.DB),
        vectors: env.VECTORS ? new VectorizeSearch(env.VECTORS) : new MemoryVectorSearch(env.DB),
        usage: new D1Usage(env.DB),
        history: new D1History(env.DB),
        ai,
        profiles: new D1Profiles(env.DB),
        ayurveda: new D1Ayurveda(env.DB),
        reports: { context: (uid, key) => reportContext(env.DB, uid, key) },
        astroMode: astroMode(env),
        report: (kind, message) => logError(env.DB, { source: 'server', kind, message, path: '/api/ask', userId }, now, ctx),
      },
      {
        question,
        lang: typeof body.lang === 'string' ? body.lang : undefined,
        identity,
        conversationId: typeof body.conversationId === 'string' ? body.conversationId : null,
        // The person picked tarot card(s) from the face-down fan.
        tarot: body.tarot && typeof body.tarot === 'object' ? { count: (body.tarot as { count?: unknown }).count === 3 ? 3 : 1 } : undefined,
        mode: body.mode === 'ayurveda' || body.mode === 'kosmik' || body.mode === 'shanti' ? body.mode : undefined,
        // A new chat started from one of the person's reports ("Ask about this report").
        reportKey: typeof body.reportKey === 'string' && /^[a-z-]{2,40}$/.test(body.reportKey) ? body.reportKey : null,
      },
    );
    if (body.stream !== true) return json(req, env, await run());
    // Streamed: one JSON object per line. {"text"} as the answer is written, then {"result"} (or {"error"}).
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();
    const send = (o: unknown) => writer.write(encoder.encode(`${JSON.stringify(o)}\n`)).catch(() => {});
    let last = 0;
    ai.onText = (text) => {
      // About eight updates a second is plenty to read along.
      if (Date.now() - last < 120) return;
      last = Date.now();
      void send({ text });
    };
    const work = (async () => {
        try {
          await send({ result: await run() });
        } catch (err) {
          const known = err instanceof BadQuestion;
          if (!known) console.error('streamed ask failed', err instanceof Error ? err.message : err);
          await send({ error: known ? err.message : 'Something went wrong. Please try again.', status: known ? 400 : 500 });
        } finally {
          await writer.close().catch(() => {});
        }
      })();
    ctx?.waitUntil(work);
    return new Response(readable, { headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store', ...SECURITY_HEADERS, ...corsHeaders(req, env) } });
  }

  // My details: the current state (vikriti) from its short check.
  if (path === '/api/vikriti' && req.method === 'PUT') {
    const userId = await requireUser(req, env);
    const v = await new D1Ayurveda(env.DB).saveVikriti(userId, (await readJson(req)).answers, now);
    return json(req, env, { vikriti: { ...v, aggravated: aggravated(v), agniLabel: AGNI_LABEL[v.agni] } });
  }

  // My details: the prakriti from the dosha quiz.
  if (path === '/api/prakriti') {
    const userId = await requireUser(req, env);
    const ayurveda = new D1Ayurveda(env.DB);
    if (req.method === 'PUT') {
      const p = await ayurveda.savePrakriti(userId, (await readJson(req)).answers, now);
      return json(req, env, { prakriti: { ...p, label: prakritiLabel(p) } });
    }
    if (req.method === 'DELETE') {
      await ayurveda.deletePrakriti(userId);
      return json(req, env, { deleted: true });
    }
  }

  // Free calculators: for "me" (saved details) or details typed in for someone else (not stored).
  if (path === '/api/calc' && req.method === 'POST') {
    const userId = await requireUser(req, env);
    const body = await readJson(req);
    const kind = body.kind as Calculator;
    if (!CALCULATORS.includes(kind)) return error(req, env, 'Unknown calculator.', 400);
    const who = async (x: unknown) => {
      if (x === 'me') {
        const p = await new D1Profiles(env.DB).get(userId);
        if (!p) throw new ProfileError('Add your birth details in Account → My details first.');
        return meBirth(p);
      }
      return parseBirth(x);
    };
    const a = await who(body.a ?? 'me');
    const b = kind === 'milan' ? await who(body.b) : null;
    return json(req, env, { blocks: runCalculator(kind, a, b, new Date(now)) });
  }

  // The cosmic snapshot from the saved birth details (end of onboarding).
  if (path === '/api/snapshot' && req.method === 'GET') {
    const userId = await requireUser(req, env);
    const p = await new D1Profiles(env.DB).get(userId);
    if (!p) return error(req, env, 'Add your birth details first.', 404);
    return json(req, env, snapshot(calculateChart(toBirth(p)), new Date(now), p.name));
  }

  // My details: birth details for the kundli and photos of both palms.
  if (path === '/api/profile') {
    const userId = await requireUser(req, env);
    const profiles = new D1Profiles(env.DB);
    if (req.method === 'GET') {
      const ay = new D1Ayurveda(env.DB);
      const [prakriti, vikriti] = await Promise.all([ay.prakriti(userId), ay.vikriti(userId)]);
      return json(req, env, {
        details: await profiles.get(userId),
        palms: await profiles.palmStatus(userId),
        prakriti: prakriti && { ...prakriti, label: prakritiLabel(prakriti) },
        vikriti: vikriti && { ...vikriti, aggravated: aggravated(vikriti), agniLabel: AGNI_LABEL[vikriti.agni] },
      });
    }
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
    const { results } = await env.DB.prepare('SELECT id, title, kind, updated_at AS updatedAt FROM conversations WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50')
      .bind(userId)
      .all();
    return json(req, env, { conversations: results });
  }

  const conv = /^\/api\/conversations\/([0-9a-f-]{36})$/.exec(path);
  if (conv) {
    const userId = await requireUser(req, env);
    const own = await env.DB.prepare('SELECT id, title, kind FROM conversations WHERE id = ? AND user_id = ?').bind(conv[1], userId).first<{ id: string; title: string; kind: string }>();
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
      return json(req, env, { id: own.id, title: own.title, kind: own.kind, messages: results.map((m) => ({ ...m, blocks: m.blocks ? JSON.parse(m.blocks) : null })) });
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

  // Reports: the catalog and your credits, one report, or unlocking one with a credit.
  if (path === '/api/reports' && req.method === 'GET') {
    const userId = await requireUser(req, env);
    return json(req, env, await listReports(env.DB, userId));
  }
  const rep = /^\/api\/reports\/([a-z-]{2,40})$/.exec(path);
  if (rep) {
    const userId = await requireUser(req, env);
    try {
      if (req.method === 'GET') return json(req, env, await getReport(env.DB, userId, rep[1]));
      if (req.method === 'POST') {
        const body = await readJson(req);
        const lang = body.lang === 'hi' || body.lang === 'hinglish' ? body.lang : 'en';
        return json(req, env, await unlockReport({ db: env.DB, ai: gemini(env), profiles: new D1Profiles(env.DB), ayurveda: new D1Ayurveda(env.DB) }, userId, rep[1], lang, now));
      }
    } catch (err) {
      if (err instanceof ReportError) return json(req, env, { error: err.message, code: err.code }, err.status);
      throw err;
    }
  }

  // Your purchases, newest first: Premium days paid by UPI, with the reference to match a bank statement.
  if (path === '/api/payments' && req.method === 'GET') {
    const userId = await requireUser(req, env);
    const { results } = await env.DB.prepare(
      `SELECT id, plan, amount_paise AS amountPaise, days, credits, status, utr, created_at AS createdAt, paid_at AS paidAt
       FROM payments WHERE user_id = ? AND status IN ('paid', 'pending', 'failed') ORDER BY created_at DESC LIMIT 100`,
    )
      .bind(userId)
      .all();
    return json(req, env, { payments: results });
  }

  if (path === '/api/me' && req.method === 'GET') {
    const userId = await requireUser(req, env);
    const until = await premiumUntil(env.DB, userId, now);
    const plan = planFor(until ? 'premium' : 'starter', now);
    const used = plan.limit === null ? 0 : await new D1Usage(env.DB).count(`user:${userId}`, plan.period);
    const phone = await verifiedPhone(env.DB, userId);
    const profile = await new D1Profiles(env.DB).get(userId);
    return json(req, env, {
      name: profile?.name ?? null,
      details: profile
        ? { name: profile.name, gender: profile.gender, birthDate: profile.birthDate, birthTime: profile.birthTime, place: profile.place, lat: profile.lat, lon: profile.lon, tzOffsetMin: profile.tzOffsetMin }
        : null,
      reportCredits: await reportCredits(env.DB, userId),
      phone: phone ? maskPhone(phone) : null,
      phoneRequired: phoneCheckOn(env) && !phone,
      phoneAvailable: relayReady(env),
      admin: (env.ADMIN_USER_IDS ?? '').split(',').map((x) => x.trim()).includes(userId),
      premiumUntil: until,
      usage: { used, limit: plan.limit },
      paymentsEnabled: paymentsEnabled(env),
      plans: Object.entries(PLANS).map(([id, p]) => ({ id, ...p })),
    });
  }

  // Error reports from the app. Signed-in or not; the rate limiter above applies.
  if (path === '/api/log' && req.method === 'POST') {
    const body = await readJson(req);
    const userId = await userFromRequest(req, env).catch(() => null);
    logError(env.DB, { source: 'client', kind: String(body.kind ?? 'other'), message: String(body.message ?? ''), detail: body.detail as string, path: body.path as string, release: body.release as string, userId }, now, ctx);
    return new Response(null, { status: 204, headers: corsHeaders(req, env) });
  }
  // The owner's payment review: what to check, approve or decline, and blocked accounts.
  if (path.startsWith('/api/admin/payments')) {
    const userId = await requireUser(req, env);
    const admins = (env.ADMIN_USER_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    if (!admins.includes(userId)) return error(req, env, 'Not found', 404);
    if (path === '/api/admin/payments' && req.method === 'GET') return json(req, env, await paymentsForReview(env.DB));
    const act = /^\/api\/admin\/payments\/(KM-[A-Z0-9]{12})\/(approve|decline)$/.exec(path);
    if (act && req.method === 'POST') {
      if (act[2] === 'approve') return json(req, env, { approved: await approvePayment(env.DB, act[1], now) });
      return json(req, env, await declinePayment(env.DB, act[1], now));
    }
    const unblock = /^\/api\/admin\/payments\/unblock\/([A-Za-z0-9-]{8,64})$/.exec(path);
    if (unblock && req.method === 'POST') return json(req, env, { unblocked: await unblockPayer(env.DB, unblock[1], now) });
    return error(req, env, 'Not found', 404);
  }

  if (path === '/api/admin/errors' && req.method === 'GET') {
    const userId = await requireUser(req, env);
    const admins = (env.ADMIN_USER_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    if (!admins.includes(userId)) return error(req, env, 'Not found', 404);
    return json(req, env, await errorSummary(env.DB, now));
  }

  if (path === '/api/phone/start' && req.method === 'POST') {
    const userId = await requireUser(req, env);
    if (!relayReady(env)) throw new PhoneError('Number checks are not switched on yet.', 503);
    return json(req, env, await startPhone(env.DB, userId, (await readJson(req)).phone, env.GUEST_SALT ?? 'kosmik', relaySender(env), now));
  }
  if (path === '/api/phone/verify' && req.method === 'POST') {
    const userId = await requireUser(req, env);
    return json(req, env, await verifyPhone(env.DB, userId, (await readJson(req)).code, env.GUEST_SALT ?? 'kosmik', now));
  }

  if (path === '/api/pay' && req.method === 'POST') {
    const userId = await requireUser(req, env);
    const body = await readJson(req);
    // Send people back to the site they paid from (the app may be served from another origin).
    const origin = req.headers.get('origin');
    const site = origin && Object.keys(corsHeaders(req, env)).length ? origin : url.origin;
    const admin = (env.ADMIN_USER_IDS ?? '').split(',').map((x) => x.trim()).includes(userId);
    return json(req, env, await startPayment(env, env.DB, userId, body.plan, site, now, { test: admin && body.test === true }));
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
  async fetch(req: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
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
      return await handleApi(req, env, url, ctx);
    } catch (e) {
      const report = (kind: string) =>
        logError(env.DB, { source: 'server', kind, message: (e as Error).message ?? String(e), detail: (e as Error).stack ?? null, path: `${req.method} ${url.pathname}` }, Date.now(), ctx);
      if (e instanceof BadQuestion) return error(req, env, e.message, 400);
      if (e instanceof Unauthorized) return error(req, env, e.message, 401);
      if (e instanceof PaymentError) {
        if (e.status >= 500) report('payment');
        return error(req, env, e.message, e.status);
      }
      if (e instanceof ProfileError || e instanceof PrakritiError) return error(req, env, e.message, 400);
      if (e instanceof PhoneError && e.status === 503) report('relay');
      if (e instanceof PhoneError) return json(req, env, { error: e.message, code: e.status === 403 ? 'phone-required' : undefined }, e.status);
      console.error('api error', (e as Error).message);
      report('worker');
      return error(req, env, 'Something went wrong. Please try again.', 500);
    }
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      purgeExpired(env.DB, Date.now())
        .then((purged) => console.log('retention', JSON.stringify(purged)))
        .catch((e) => logError(env.DB, { source: 'server', kind: 'worker', message: `retention: ${(e as Error).message}`, path: 'cron' }, Date.now(), ctx)),
    );
  },
} satisfies ExportedHandler<Env>;
