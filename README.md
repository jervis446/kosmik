# Kosmik

Ask about the Bhagavad Gita, Vedic astrology and tarot. An Asanoha product.

Most answers come from a curated library, not from an AI model. The model only writes an answer when the library and the answer cache can't, and even then it works only from library passages and has to cite them.

```
api/    Cloudflare Worker: the ask pipeline and D1 database; calls Google Gemini. Also serves the web app.
app/    Expo Router app (web now; iOS and Android later from the same code).
data/   Library build scripts and the generated library (verses, meanings, embeddings).
```

## How a question is answered

Each question goes through four layers, in order. The first that can answer wins.

| Layer | What it does | Typical time | AI cost |
|---|---|---|---|
| 1. Direct | Recognises verse references ("Gita 2.47", "गीता 2.47"), verse of the day, tarot draws, and meaning look-ups ("Saturn in 7th house", "Rohini nakshatra", "The Tower reversed"). | ~50 ms | none |
| 2. Exact cache | Same question as before, after normalising case, punctuation and filler words. | ~20 ms | none |
| 3. Semantic cache | Same meaning, different words (embedding similarity ≥ 0.93, per language). | ~0.4 s | one embedding |
| 4. RAG + LLM | Finds the closest verses and meanings, then asks Gemini 3.5 Flash to answer from those only, with citations. Citations that weren't in the sources are dropped. | ~3 s | embedding + one chat call |

Before any of that, a crisis check shows the Tele-MANAS helpline (14416) for messages about self-harm, in English, Hindi and Hinglish. That doesn't count against any limit.

The LLM answer is checked for things Kosmik must never say: predictions of death, illness or divorce, guarantees, cures, curses, or pushing products. If one slips through it retries once with stricter instructions, then gives up politely rather than show it.

Answers are only cached when the question is general. Questions with personal context ("my marriage", "meri kundli") or private data (dates, times, phone numbers, emails) are answered but never stored in the shared cache.

Feedback: three or more 👎 (and more 👎 than 👍) takes a cached answer out of service.

Cached answers store a fingerprint of the library text they cite. When a cited verse or meaning is edited, or a meaning is marked reviewed, the next request for that answer retires it and writes a fresh one, so corrections reach users without clearing the cache by hand.

## Data kept, and for how long

Everything is in D1. Supabase is only the sign-in.

| Data | Kept |
|---|---|
| Question counts (users, and guests' daily one-way code) | 30 days |
| Chats (signed-in users only) | 12 months after last use, or until the user deletes them |
| Shared cached answers (general questions only, no user link) | Removed after 6 months unused, unless reviewed |
| Library (verses, meanings) | Permanent |

A daily Cron Trigger (`src/retention.ts`, 03:00 India time) deletes what has expired. The periods are stated on the privacy page; change both together. Test it locally with `npx wrangler dev --test-scheduled`, then open `http://127.0.0.1:8787/cdn-cgi/handler/scheduled`.

## Limits

| Who | Allowance |
|---|---|
| Guest | 3 questions a day |
| Starter (free Asanoha account) | 11 questions a week, refills Monday 00:00 India time |
| Premium | Unlimited for 7 days (₹51) or 30 days (₹101), paid by UPI through Noha Pay |

Helpline and "coming soon" notices don't count. Guests are identified by a daily-salted one-way hash of their IP address, never the address itself.

## Payments (Noha Pay)

Premium is a one-time UPI payment through Noha Pay, Asanoha's UPI gateway (YouPI PG), using the same contract as People Pitchers' live integration (`supabase/functions/create-checkout` and `youpi-webhook` in jervis446/peoplepitchers). Code: `api/src/payments.ts`. Nobody in between holds the money: the customer pays straight into the merchant's UPI account.

1. `POST /api/pay {plan}` (signed in) stores a pending order (`KM-` + 12 characters) and calls `POST {NOHA_GATEWAY_URL}/api/v1/payments` with `x-merchant-id`, `x-merchant-key`, `idempotency-key` and `method: UPI`.
2. The customer pays on the checkout page and returns to `/premium?order=<id>`, which waits for confirmation.
3. The gateway calls `POST /api/pay/webhook`. Kosmik checks the signature (`X-Gateway-Signature-V2` = HMAC-SHA256 of `<timestamp>.<body>`, or V1 = HMAC of the body), accepts deliveries up to 7 days old (the gateway retries with the original timestamp), then:

| Event | Kosmik |
|---|---|
| `OBSERVED_SUCCESS` (bank credit alert matched) or `RECONCILED` (bank-statement line matched), UPI, exact amount | Order paid; Premium extended once, from the current end date if still on |
| Same, wrong amount | Order failed with a note; never applied. The customer is told to email with the UTR |
| `MANUAL_REVIEW` (payer typed a UTR) | Stays pending; UTR saved with a note to check the bank statement |
| `SUCCESS` (cash/counter), non-UPI methods | Ignored with a note |
| `FAILED`, `EXPIRED`, `CANCELLED` | Pending order closed |

People Pitchers waits for an admin to confirm an `OBSERVED_SUCCESS` because it holds escrow; Kosmik grants a ₹51/₹101 pass on it straight away. To require the bank statement instead, only accept `RECONCILED` in `handleWebhook`.

Payments stay off ("Premium payments open soon") until these are set on the Worker:
```bash
cd api && npx wrangler secret put NOHA_GATEWAY_URL
```
```bash
cd api && npx wrangler secret put NOHA_MERCHANT_ID
```
```bash
cd api && npx wrangler secret put NOHA_MERCHANT_KEY
```
`NOHA_GATEWAY_URL` is `https://pay.peoplepitchers.com`. The merchant key also signs webhooks; set `NOHA_WEBHOOK_SECRET` only if the gateway uses a different webhook secret. In the gateway's Merchant Admin, create a Kosmik merchant with the payee UPI ID and the webhook URL `https://<kosmik host>/api/pay/webhook`. The payee is currently the test UPI ID used by People Pitchers and Wearday; switch to a business UPI ID before real customers.

On iOS and Android builds the Premium page doesn't take payment (app store billing rules); it points to the website.

## Library

- **Verses**: all 701 verses of the Bhagavad Gita. Sanskrit is public domain. English translations by Swami Sivananda (d. 1963) and Shri Purohit Swami (d. 1941), public domain in India. Transliteration (IAST) is generated in code from the Devanagari (`api/src/lib/iast.ts`), not copied.
- **Meanings**: 432 entries: 9 grahas, 12 rashis, 27 nakshatras, 12 houses, 108 graha-in-house, 108 graha-in-rashi, 78 tarot cards upright and 78 reversed. Drafted with Llama 3.3 70B (426) and Gemini 3.5 Flash (the last 6) to a fixed style guide and checked by the same safety rules as live answers. **All are marked `reviewed = 0` and show a "Draft" badge until a person reviews them.**
- Embeddings: `gemini-embedding-2` at 768 dimensions (multilingual), so Hindi and Hinglish questions find English passages. The Worker (`api/src/ai.ts`) and `data/scripts/embed.ts` must use the same model and size; changing either means re-embedding the library and clearing `answer_cache`.

## Running locally

Needs Node 22, and local Supabase running for sign-in (the Asanoha account; this repo uses the same Auth project as Wearday and the store).

```bash
cd api && npm install
```

```bash
cd app && npm install
```

1. Create `api/.dev.vars` (never commit it):
   ```
   SUPABASE_URL=http://127.0.0.1:54321
   SUPABASE_ANON_KEY=<local anon key from `npx supabase status`>
   GUEST_SALT=local-development
   GEMINI_API_KEY=<your Gemini API key>
   ALLOWED_ORIGINS=http://localhost:8081
   ```
2. Create `app/.env.local` from `app/.env.example`, with the same Supabase URL and anon key. Leave `EXPO_PUBLIC_API_URL` empty when the Worker serves the app.
3. Database and library:
   ```bash
   cd api && npx wrangler d1 migrations apply kosmik --local
   ```
   ```bash
   node data/scripts/make-seed.ts && cd api && npm run seed:local
   ```
4. Build the web app and serve everything from the Worker on http://127.0.0.1:8787:
   ```bash
   cd app && npm run build:web
   ```
   ```bash
   cd api && npx wrangler dev
   ```
   After rebuilding the app, restart `wrangler dev`: the export replaces `app/dist` and the dev server stops seeing it.
   For live reload while working on screens, run `npm run web` in `app/` with `EXPO_PUBLIC_API_URL=http://127.0.0.1:8787`.

Answers and embeddings come from Google Gemini (`GEMINI_API_KEY` in `.dev.vars`). If your network only reaches the internet through an HTTP proxy, the local Worker runtime can't call Gemini directly: run `NODE_USE_ENV_PROXY=1 node data/scripts/ai-relay.ts` and add `GEMINI_BASE_URL=http://127.0.0.1:8788` to `.dev.vars` (local dev only).

## Checks

```bash
cd api && npm run typecheck && npm test
```

```bash
cd app && npm run typecheck && npm run lint && npm run build:web
```

## Deploying

**Live:** https://kosmik.prime-adarsh108.workers.dev (Worker `kosmik`, D1 database `kosmik` in APAC). AI runs on Google Gemini (paid tier: on the free tier Google may use prompts to improve its products, which our privacy policy doesn't allow). When Gemini is down, rate-limited or not configured, Kosmik keeps serving library and cached answers and tells people it is busy for new questions (not counted against their limit).

The database exists and its id is in `api/wrangler.jsonc`. To update:

1. Schema changes:
   ```bash
   cd api && npx wrangler d1 migrations apply kosmik --remote
   ```
   Library changes (after `node data/scripts/make-seed.ts`):
   ```bash
   cd api && npx wrangler d1 execute kosmik --remote --file seed/library.sql
   ```
2. Secrets (already set: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `GUEST_SALT`). **`GEMINI_API_KEY` must be set before AI answers work:**
   ```bash
   cd api && npx wrangler secret put GEMINI_API_KEY
   ```
   or in the Cloudflare dashboard: Workers & Pages → kosmik → Settings → Variables and Secrets → Add → type Secret.
3. Build the app with the production Supabase URL and anon key (the same project as the Asanoha store and Wearday). Put them in `app/.env.production`, and export them when building, because `.env.local` otherwise takes precedence:
   ```bash
   cd app && set -a && . ./.env.production && set +a && npm run build:web
   ```
4. Deploy:
   ```bash
   cd api && npx wrangler deploy
   ```
   If the static-asset upload fails with 401 (some proxies rewrite the Authorization header the upload uses), ship the app inside the Worker instead:
   ```bash
   cd api && node scripts/embed-web.ts && npx wrangler deploy -c wrangler.embedded.json
   ```
   The current production deploy was made this way.
5. Domain: add `kosmik.asanoha.co.in` as a Custom Domain on the Worker (Workers & Pages → kosmik → Settings → Domains & Routes). asanoha.co.in's DNS must be on this Cloudflare account; it isn't yet.

**Optional, for scale:** the semantic cache and library search run in memory inside each Worker isolate (fine up to a few thousand cached answers). For more, create a Vectorize index (`npx wrangler vectorize create kosmik --dimensions=768 --metric=cosine`), uncomment the `vectorize` block in `wrangler.jsonc`, and upload the library vectors. The code switches automatically when the `VECTORS` binding exists.

## Not built yet

- Personal kundli readings (birth details → chart). Kosmik says "coming soon" for these and doesn't count them.
- Premium payments and Noha Money referral credit.
- Human review of the 432 meaning drafts.
- Hindi and Hinglish versions of the meanings (answers are already given in the asker's language by the AI layer).
- iOS and Android builds.
