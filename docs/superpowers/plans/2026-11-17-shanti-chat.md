# Shanti Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Shanti chats (comfort from Hindu scripture, with alerts and caching), keep Kosmik chats to palm, tarot and kundli, and show the Western lines only when someone asks for their kundli itself.

**Architecture:** Shanti is a third `ChatKind` in the existing ask pipeline (`api/src/pipeline.ts`). It has its own model call (`AiClient.shanti`), its own cache space (an `answer_cache.kind` column, a hash prefix and the vector namespace `cache:shanti:<lang>`), and it never reaches the chart. The passages library is step 2 (Task 6), after the owner approves the source downloads.

**Tech Stack:** Cloudflare Worker (TypeScript, D1, `node --test`), Expo Router app (TypeScript), Gemini through its OpenAI-compatible API.

**Spec:** `docs/superpowers/specs/2026-11-17-shanti-chat-design.md`

## Global Constraints

- Commit or push only when the owner asks. Commit steps below are skipped unless asked.
- npm installs use `--ignore-scripts`.
- UI is plain and minimal, and works at 375px in light and dark.
- Languages are en, hi and hinglish. Every new screen string gets a Hindi entry in `app/src/lib/i18n-hi.ts`.
- Helpline: Tele-MANAS 14416 (`HELPLINE` in `api/src/lib/safety.ts`). Use 112 when danger comes from another person.
- Answers quote and cite only library sources. No astrology in Shanti.
- Migrations never rebuild `conversations`: rebuilding it would cascade-delete every message. Widen the CHECK by adding a column, copying, dropping and renaming (tested on SQLite 3.54).

## Review Focus

1. "my boyfriend left me" in a Shanti chat, with birth details saved, must not return a chart reading (`PERSONAL_CONTEXT` → `chartOutcome`). Test in Task 3.
2. A Shanti answer cached for "how to let go" must not be served in a Kosmik chat, and the other way round. Test in Task 3.
3. A crisis message in a Shanti chat gets the helpline, free and before the model. Test in Task 3.
4. "when will my money improve" with a profile saved: no Western lines and no "Vedic astrology (your kundli):" label. "show my kundli" keeps both. Test in Task 1.
5. Old clients sending no `mode`, and guests, behave as before. A Gita question in a chat with no mode is still answered. Test in Task 2.

---

### Task 1: Western lines only for kundli asks

**Files:** Modify `api/src/pipeline.ts` (`chartAnswer`, around line 737). Test: `api/test/pipeline.test.ts`.

**Interfaces:** Produces `export const KUNDLI_ITSELF: RegExp` in `pipeline.ts`.

- [ ] Tests: `chart answer for a topic question has no Western lines or label`: profile set, ask "when will my finances improve" → blocks[0] is text not matching `/Western astrology|Vedic astrology \(your kundli\)/`. `asking for the kundli itself shows the Western lines`: "show my kundli" → blocks[0] matches `/^Western astrology:/`, and blocks[1] starts with "Vedic astrology (your kundli):".
- [ ] Run `cd api && npm test` and see them fail.
- [ ] Implement: `showWestern = KUNDLI_ITSELF.test(question) && !/Western astrology:|पश्चिमी ज्योतिष:/.test(conversation ?? '')`. `KUNDLI_ITSELF` matches: (read|show|analy[sz]e|tell me about|explain|see) my (kundli|kundali|chart|birth chart|horoscope); "my kundli/kundali/birth chart" on its own (up to 4 words); "meri kundli"; "कुंडली"; plus the Western words in `intents.ts` WESTERN. When it's not shown, the facts line tells the model to start with the person's first name and the verdict.
- [ ] Tests pass.

### Task 2: Kosmik chats send Gita and life questions to Shanti

**Files:** Modify `api/src/pipeline.ts` (T strings, the mode guard near line 347, and the RAG layer). Modify `api/src/types.ts` (notice kind `use-shanti`). Test: `api/test/pipeline.test.ts`.

**Interfaces:** Produces notice `{ type: 'notice', kind: 'use-shanti', text, question }` and `T.useShanti`.

- [ ] Tests: in a Kosmik chat (`mode: 'kosmik'`, conversationId set), "Gita 2.47" and "how do I stop worrying about results" → a single `use-shanti` notice, not counted. "Saturn in 7th house" and tarot or palm questions are unchanged. With no mode, "how do I stop worrying" still gets a Gita RAG answer.
- [ ] Implement:
  - In `mode === 'kosmik' && input.conversationId`, a `verse` or `verse-of-day` intent → `use-shanti`.
  - Before layer 2, if the question isn't about the person's chart (no `PERSONAL_CONTEXT`/`LIFE_DECISION` match with a saved profile) → `use-shanti`.
  - en, hi and hinglish texts: "Gita and life questions have their own space now: Shanti. Open a Shanti chat to talk it through." (and Hindi/Hinglish versions).
- [ ] Tests pass.

### Task 3: Shanti chat kind (api)

**Files:**
- Create `api/migrations/0015_shanti.sql`.
- Modify `api/src/types.ts`, `api/src/store.ts` (cache `kind`, the namespace loader), `api/src/index.ts:139` (accept `mode: 'shanti'`), `api/src/ai.ts` (`SHANTI_PROMPT`, `ShantiReply`, `parseShanti`, `GeminiAi.shanti`), `api/src/lib/safety.ts` (Shanti banned phrases) and `api/src/pipeline.ts` (routing and `shantiAnswer`).
- Test: `api/test/pipeline.test.ts`, `api/test/ai.test.ts`, `api/test/sql.test.ts`.

**Interfaces:**
- `ChatKind = 'kosmik' | 'ayurveda' | 'shanti'`.
- `type ShantiReply = { answer: string; cited: string[]; concern: 'none' | 'low' | 'high'; followUps: string[] }`.
- `AiClient.shanti?(question: string, lang: Lang, sources: { verses: Verse[]; passages: Passage[] }, stricter?: boolean, conversation?: string): Promise<ShantiReply>`. Until Task 6, `passages` is always `[]`. Add `type Passage = { ref: string; work: string; text: string; sanskrit: string | null; translator: string; reviewed: boolean }` to `types.ts` now.
- `AnswerCache.exact(lang, hash)` stays as it is. Shanti hashes are `sha256('shanti|' + normalized)`. `put` gains `kind?: ChatKind` (default 'kosmik'). Vector namespace: `cache:shanti:${lang}`. `MemoryVectors.load` reads `cache:<kind>:<lang>` or `cache:<lang>` (kind 'kosmik'), filtered `WHERE lang = ? AND kind = ?`, where 'kosmik' also covers rows from Ayurveda chats as today.
- Migration 0015:
  1. `ALTER TABLE conversations ADD COLUMN kind_new TEXT NOT NULL DEFAULT 'kosmik' CHECK (kind_new IN ('kosmik','ayurveda','shanti'))`
  2. `UPDATE conversations SET kind_new = kind`
  3. `ALTER TABLE conversations DROP COLUMN kind`
  4. `ALTER TABLE conversations RENAME COLUMN kind_new TO kind`
  5. `ALTER TABLE answer_cache ADD COLUMN kind TEXT NOT NULL DEFAULT 'kosmik'`

- [ ] Tests (pipeline, `mode: 'shanti'`):
  - `shanti never reads the chart`: profile saved, "my boyfriend left me, I can't sleep" → no `chart` block, `fakes.shantiCalls === 1`, `result.kind === 'shanti'`.
  - `shanti crisis goes to helpline first`: "I want to die" → helpline notice, no model call, not counted.
  - `shanti concern high adds helpline`: reply concern 'high' → last notice is helpline with the text including 14416.
  - `shanti concern low adds a soft line`: concern 'low' → a `text` block mentioning "someone you trust".
  - `shanti general answers are cached apart`: ask "how to let go of attachment" in Shanti twice → the second is layer 'exact'. Then in a Kosmik chat with no mode, the same question isn't layer 'exact'.
  - `personal shanti questions are not cached`: "my ex cheated on me" twice → both layer 'ai'.
  - `shanti banned phrases retry`: first answer "He will come back to you", second clean → the clean one is shown.
  - Palm, tarot or chart intents in Shanti → a `use-kosmik` notice, not counted. Ayurveda intents → `use-ayurveda`.
  - In ai.test: `parseShanti` keeps concern only if it is one of the three values (default 'none') and drops a non-string answer.
  - In sql.test: migration 0015 applied on the test D1 keeps the messages and allows `'shanti'`.
- [ ] Run and see them fail.
- [ ] Implement:
  - `shantiAnswer(deps, q, lang, userId, conversation, now)` in `pipeline.ts`, doing layer 2 (exact) and layer 3 (semantic, namespace `cache:shanti:${lang}`), skipped when `conversation` is set. Layer 4: 5 verses from `verses` (`VERSE_MIN`), the model call, `contentProblems` plus `shantiProblems`, retry once, then `T.unsure`.
  - Blocks: text, cited verse cards (at most 3), the concern block, then followups.
  - Cache only when `!conversation && cacheable(q, false) && !SHANTI_PERSONAL.test(q)`.
  - `SHANTI_PERSONAL` matches: breakup, broke up, ex, divorce, cheated, died, passed away, lost my, alone, lonely, my (boyfriend|girlfriend|husband|wife|partner|mother|father|friend), dhokha, chhod diya, akela, अकेला, धोखा, तलाक.
  - For a user with a conversationId, every turn after the first gets `conversation` from history.
  - Routing in `ask()`: `mode === 'shanti'` goes after the crisis check and limit, and before the Ayurveda guard. It keeps direct verse intents, gives `use-ayurveda` for Ayurveda intents and `use-kosmik` for palm, zodiac, tarot or chart intents, and sends everything else to `shantiAnswer`.
  - `SHANTI_PROMPT`: a warm elder sibling. Acknowledge the feeling first, in their words. Offer one or two teachings from SOURCES, cited by id and never quoted from outside them. Give one small thing to do today, and end with a gentle question. 150–250 words. No astrology, no medical, legal or financial advice. Never say the person will reunite, that it was karma or punishment, or that they should tolerate abuse. `concern`: 'high' for hopelessness, self-harm hints, not eating or sleeping for days, abuse or violence, or threats; 'low' for long, heavy sadness; else 'none'. JSON: `{answer, cited, concern, follow_ups}`. temperature 0.5, `reasoning_effort` 'minimal', max_tokens 1500, with `inLanguage`.
  - `shantiProblems(text): string[]` in `safety.ts`, matching: will come back, (it|this) (is|was) your karma, punishment for, (stay|adjust|tolerate) (with|in) (him|her|them|the marriage), wo wapas aayega/aayegi.
- [ ] Tests pass. Then `npm run typecheck`.

### Task 4: Shanti in the app

**Files:** Modify `app/src/lib/api.ts` (`ChatKind`, notice kinds), `app/src/components/Sidebar.tsx`, `app/src/components/Conversation.tsx`, `app/src/components/Blocks.tsx` (`use-shanti` and `use-kosmik` buttons), `app/src/lib/i18n-hi.ts`, `app/src/app/help.tsx`, `app/src/app/terms.tsx` and `app/public/landing.html`.

- [ ] "Ask Shanti" button under "Ask Ayurveda": glyph 🪷, colour `SHANTI = "#C77DFF"` (checked for contrast on both themes).
  - Filter chips: all, kosmik, ayurveda, shanti.
  - Chat list label "Shanti chat".
  - Empty state: title "SHANTI", the line "Tell me what's on your heart. Nothing you say here is shared.", 4 starters ("I just went through a breakup", "I feel lost after failing", "How do I deal with losing someone?", "Fights at home are wearing me down"), and the placeholder "Say what's on your mind…".
- [ ] Notice buttons: `use-shanti` → `shell.askNew(q, 'shanti')`, and `use-kosmik` → `shell.askNew(q, 'kosmik')`.
- [ ] Help and terms: one line each saying Shanti is spiritual comfort, not therapy, and giving Tele-MANAS 14416 and 112.
- [ ] `cd app && npm run typecheck && npm run lint && npm run build:web` passes.
- [ ] Check visually in the browser pane at 375px, light and dark, against local `wrangler dev`.

### Task 5: Full checks

- [ ] `cd api && npm run typecheck && npm test`, and `cd app && npm run typecheck && npm run lint && npm run build:web`.
- [ ] `npx wrangler d1 migrations apply kosmik --local` succeeds on a local DB that has migrations 0001–0014 applied.
- [ ] Update the README sections on chats, limits and "Not built yet".

### Task 6: Passages library (only after the owner approves the downloads)

- [ ] Ask the owner to approve downloading these Project Gutenberg texts into `data/sources/`, each with a LICENSE note:
  - Griffith's Ramayana
  - Ganguli's Mahabharata (the books with Vidura Niti, Shanti Parva and the Vana Parva Yaksha Prashna)
  - Müller's Upanishads (SBE 1 and 15)
  - Mitra's Yoga Vasistha
- [ ] Migration `0016_passages.sql`: create the `passages` table as in the spec.
- [ ] `data/scripts/build-passages.ts`: split, shortlist with Gemini to about 300 passages, and write `data/passages.json` and `data/vectors/passages.json`. Wording is never changed.
- [ ] `make-seed.ts` includes passages. Add `Library.passages(refs)`, the `passages` namespace, a `passage` block in the app, and fingerprint coverage.
- [ ] Shanti retrieval adds the top 4 passages.
