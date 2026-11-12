# Kosmik

Ask about the Bhagavad Gita, Vedic astrology and tarot. An Asanoha product.

Most answers come from a curated library, not from an AI model. The model only writes an answer when the library and the answer cache can't, and even then it works only from library passages and has to cite them.

```
api/    Cloudflare Worker: the ask pipeline, D1 database, Workers AI. Also serves the web app.
app/    Expo Router app (web now; iOS and Android later from the same code).
data/   Library build scripts and the generated library (verses, meanings, embeddings).
```

## How a question is answered

Each question goes through four layers, in order. The first that can answer wins.

| Layer | What it does | Typical time | AI cost |
|---|---|---|---|
| 1. Direct | Recognises verse references ("Gita 2.47", "गीता 2.47"), verse of the day, tarot draws, and meaning look-ups ("Saturn in 7th house", "Rohini nakshatra", "The Tower reversed"). | ~50 ms | none |
| 2. Exact cache | Same question as before, after normalising case, punctuation and filler words. | ~20 ms | none |
| 3. Semantic cache | Same meaning, different words (embedding similarity ≥ 0.90, per language). | ~0.6 s | one embedding |
| 4. RAG + LLM | Finds the closest verses and meanings, then asks Llama 3.3 70B to answer from those only, with citations. Citations that weren't in the sources are dropped. | ~4–5 s | embedding + one chat call |

Before any of that, a crisis check shows the Tele-MANAS helpline (14416) for messages about self-harm, in English, Hindi and Hinglish. That doesn't count against any limit.

The LLM answer is checked for things Kosmik must never say: predictions of death, illness or divorce, guarantees, cures, curses, or pushing products. If one slips through it retries once with stricter instructions, then gives up politely rather than show it.

Answers are only cached when the question is general. Questions with personal context ("my marriage", "meri kundli") or private data (dates, times, phone numbers, emails) are answered but never stored in the shared cache.

Feedback: three or more 👎 (and more 👎 than 👍) takes a cached answer out of service.

## Limits

| Who | Allowance |
|---|---|
| Guest | 3 questions a day |
| Starter (free Asanoha account) | 11 questions a week, refills Monday 00:00 India time |
| Premium | Unlimited (₹51/week or ₹101/month; payments not built yet, the `premium` table is ready) |

Helpline and "coming soon" notices don't count. Guests are identified by a daily-salted one-way hash of their IP address, never the address itself.

## Library

- **Verses**: all 701 verses of the Bhagavad Gita. Sanskrit is public domain. English translations by Swami Sivananda (d. 1963) and Shri Purohit Swami (d. 1941), public domain in India. Transliteration (IAST) is generated in code from the Devanagari (`api/src/lib/iast.ts`), not copied.
- **Meanings**: 432 entries: 9 grahas, 12 rashis, 27 nakshatras, 12 houses, 108 graha-in-house, 108 graha-in-rashi, 78 tarot cards upright and 78 reversed. Drafted with Llama 3.3 70B to a fixed style guide and checked by the same safety rules as live answers. **All are marked `reviewed = 0` and show a "Draft" badge until a person reviews them.**
- Embeddings: `@cf/baai/bge-m3` (1024 dimensions, multilingual), so Hindi and Hinglish questions find English passages.

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

Workers AI always runs on Cloudflare, even in local dev, so `wrangler dev` needs `CLOUDFLARE_ACCOUNT_ID` and a `CLOUDFLARE_API_TOKEN` with Workers AI access. If your network blocks the Worker runtime from reaching Cloudflare directly, run `node data/scripts/ai-relay.ts` and set `AI_RELAY_URL=http://127.0.0.1:8788` in `.dev.vars` (local dev only; the Worker ignores it without that variable).

## Checks

```bash
cd api && npm run typecheck && npm test
```

```bash
cd app && npm run typecheck && npm run lint && npm run build:web
```

## Deploying (not done yet)

Nothing has been deployed. **Before launch, move the Cloudflare account to Workers Paid ($5/month).** The free Workers AI allowance is 10,000 neurons a day; building the library and testing used it up in one evening, which would mean a few hundred AI answers a day at most. When the allowance runs out, Kosmik keeps serving library and cached answers and tells people it is busy for new questions (not counted against their limit).

When ready:

1. Create the database and put its id into `api/wrangler.jsonc` (replace `local-development`):
   ```bash
   cd api && npx wrangler d1 create kosmik
   ```
2. Apply the schema and load the library:
   ```bash
   npx wrangler d1 migrations apply kosmik --remote
   ```
   ```bash
   npx wrangler d1 execute kosmik --remote --file seed/library.sql
   ```
3. Secrets (production Supabase project: the same one as the Asanoha store and Wearday):
   ```bash
   npx wrangler secret put SUPABASE_URL
   ```
   ```bash
   npx wrangler secret put SUPABASE_ANON_KEY
   ```
   ```bash
   npx wrangler secret put GUEST_SALT
   ```
   `GUEST_SALT` should be a long random string.
4. Build the app with the production Supabase URL and anon key in `app/.env.production`, then deploy:
   ```bash
   cd app && npm run build:web
   ```
   ```bash
   cd api && npx wrangler deploy
   ```
5. Domain: add `kosmik.asanoha.co.in` as a Custom Domain on the Worker in the Cloudflare dashboard (Workers & Pages → kosmik → Settings → Domains & Routes). If asanoha.co.in's DNS isn't on Cloudflare, use the Worker's `workers.dev` URL or move DNS first.
6. In Supabase Auth → URL Configuration, add `https://kosmik.asanoha.co.in` to the redirect URLs.

**Optional, for scale:** the semantic cache and library search run in memory inside each Worker isolate (fine up to a few thousand cached answers). For more, create a Vectorize index (`npx wrangler vectorize create kosmik --dimensions=1024 --metric=cosine`), uncomment the `vectorize` block in `wrangler.jsonc`, and upload the library vectors. The code switches automatically when the `VECTORS` binding exists.

## Not built yet

- Personal kundli readings (birth details → chart). Kosmik says "coming soon" for these and doesn't count them.
- Premium payments and Noha Money referral credit.
- Human review of the 432 meaning drafts.
- Hindi and Hinglish versions of the meanings (answers are already given in the asker's language by the AI layer).
- iOS and Android builds.
