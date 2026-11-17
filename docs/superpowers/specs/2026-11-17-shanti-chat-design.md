# Shanti chats, a narrower Kosmik chat, and kundli answers without Western lines

Date: 2026-11-17. Status: draft for the owner's approval. Not committed.

## Why

After a breakup, a death, a failure or a fight at home, many young Indians type it all out to ChatGPT or Claude at night. Kosmik can be that place, but with something those tools don't give: comfort from the Gita, Ramayana, Mahabharata and Upanishads, quoted and cited, from an AYUSH-licensed Indian company. It should comfort first, and spot real danger and point to a person (Tele-MANAS 14416).

At the same time, Kosmik chats should become clearly about the stars: palm, tarot and kundli. Kundli answers should get to the point, starting with the person's name, and should show the two Western lines only when the person asks for their kundli itself.

## Goals

1. A third kind of chat, **Shanti** (working name, see "Owner's calls"), next to Kosmik and Ayurveda, started from its own sidebar button and filterable like the others.
2. Shanti answers from a scripture library only, citing what it quotes: the Gita (already there) plus a new library of comforting passages from other Hindu texts.
3. Safety. The crisis check runs first, as today. Shanti also notices quieter danger signs and gently suggests talking to someone. It never gives medical or legal advice, and never gives astrology.
4. The same speed and cost layers as today: direct look-ups, the exact cache, the semantic cache, then RAG plus Gemini.
5. Kosmik chats cover palm, tarot, kundli and astrology meanings only. Gita and life questions get an "Open a Shanti chat" notice, the same way health questions get "use Ayurveda" today.
6. Kundli answers: the Western two lines and the "Vedic astrology (your kundli):" label appear only when the question asks for the kundli or chart itself. Every other chart answer starts straight with the reading ("Adarsh, …").

## Non-goals

- A therapist or counsellor. Shanti is spiritual comfort and doesn't diagnose.
- Remembering people across chats beyond what Kosmik already does.
- Human-reviewed passages at launch. They ship marked as drafts, like the meanings today.
- Fixing the "Sign in to Wearday" email in code. It isn't in this repo (see the last section).

## Anti-goals (a failure even if it works)

- Quoting a verse or passage that isn't in the library, or putting words in a scripture's mouth.
- Pushing the kundli, tarot or Ayurveda on someone who is grieving.
- Saying the ex will come back, that it was karma or punishment, or anything that blames the person.
- Telling someone to stay in an abusive relationship "as dharma".
- A breakup message from one person showing up in another person's cache.
- Copyrighted translations in the library.

## Approaches considered

- **A. A new chat kind in the existing pipeline (chosen).** This mirrors how Ayurveda chats work: `ChatKind` gains `'shanti'`, the pipeline routes by mode, it gets its own prompt and library search, and it shares limits, history, cache, crisis check, sign-in and payments. It's the least new code and the same behaviour everywhere.
- **B. A separate Worker or service.** This would duplicate auth, limits, history and caching, and give a second deploy. Rejected.
- **C. Gemini quoting texts from memory.** Rejected in conversation: it breaks the cite-only rule and risks invented verses.

The library comes in two steps (chosen in conversation, option B):
1. Shanti ships on the Gita alone.
2. The new passages library is added, and Shanti searches it alongside the Gita.

## Design

### 1. Chat kind `shanti` (api)
- Migration `0015_shanti.sql`: rebuild the `conversations.kind` CHECK to allow `'shanti'`. SQLite can't alter a CHECK, so this is a table rebuild in the style of the earlier migrations.
- `types.ts`: `ChatKind = 'kosmik' | 'ayurveda' | 'shanti'`. `index.ts:139` accepts `mode: 'shanti'`.
- Pipeline routing when `mode === 'shanti'`:
  - Crisis check first, unchanged, and free.
  - Gita verse references ("Gita 2.47") and verse of the day are answered directly from the library.
  - Everything else goes to `shantiAnswer`. It **never** jumps to the chart: the `PERSONAL_CONTEXT`/`LIFE_DECISION` → `chartOutcome` shortcut and `outcome.personal` → chart are skipped in Shanti chats. Ayurveda, palm, tarot, zodiac and chart intents get a notice offering the right chat, and the notice doesn't count against the limit.
- `shantiAnswer` keeps the four layers:
  - **Cache.** Today's cache keys have no chat kind, so the cache is split by kind: `answer_cache` gains a `kind` column (default `'kosmik'`), it is part of the uniqueness key, and the vector namespace becomes `cache:${kind}:${lang}`. General questions ("how do I let go of someone?") are cached. Personal ones ("my boyfriend left me yesterday") are never cached, by the existing `cacheable()` rules plus a Shanti list (breakup, ex, divorce, cheated, died, passed away, lost my, alone, lonely, and the Hindi/Hinglish equivalents).
  - **Retrieval.** 5 Gita verses plus 4 passages (step 2), with no astrology meanings.
  - **Model.** A new `SHANTI_PROMPT`: the voice of a wise, warm elder sister or brother. It acknowledges the feeling first, then offers one or two teachings with citations, then one small thing to do today, and ends with a gentle question to keep talking. Plain words, in the person's language (en, hi, hinglish), about 150–250 words. It has the same JSON shape as the main answer (`answer`, `cited`, `followups`), plus `concern: 'none' | 'low' | 'high'`.
- **Alerts:**
  - `isCrisis` already catches explicit self-harm words before the model is called.
  - The model's `concern: 'high'` (hopelessness, not eating or sleeping for days, abuse or violence at home, being threatened) adds a helpline notice under the answer: Tele-MANAS 14416, plus 112 when there's danger from another person.
  - `concern: 'low'` adds a soft line: "If this has been heavy for a while, talking to someone you trust or a counsellor helps."
  - A `contentProblems` extension rejects "they will come back", "it was your karma/punishment", "stay and tolerate" and the like, and retries once, as today.
- Limits: the same as other chats. Crisis and notices are free.
- Follow-ups: a Shanti chat is a conversation, so the history-aware rewrite (`isFollowUp`/`standalone`) is used for every turn after the first, not only for detected follow-ups. Answers written with history are never cached, as today.

### 2. Passages library (step 2)
- A new `passages` table: `ref` (for example "Ramayana 2.40.12" or "Mahabharata 12.174"), `work`, `location`, `text` (English), `sanskrit` (nullable), `translator`, `source` (book and licence), `themes` (comma list: grief, separation, betrayal, anger, loneliness, failure, fear, self-worth, family, letting go, death of a loved one), `reviewed` (0), `version`, `embedding`. The `verses` table stays the Gita.
- Sources, public domain in India and the US (author died more than 60 years ago and published before 1930):
  - Valmiki Ramayana, tr. Ralph T. H. Griffith (1870–74).
  - Mahabharata, tr. Kisari Mohan Ganguli (1883–96), including Vidura Niti, Shanti Parva and the Yaksha Prashna.
  - Principal Upanishads, tr. F. Max Müller (Sacred Books of the East, 1879–84).
  - Yoga Vasistha, tr. Vihari-Lala Mitra (1891–99).
- These are fetched once from Project Gutenberg or sacred-texts.com into `data/sources/` with a LICENSE note each. **The owner approves the downloads first.**
- `data/scripts/build-passages.ts` splits each text into passages, uses Gemini to shortlist about 300 passages that speak to the themes, and writes `data/passages.json` plus `data/vectors/passages.json`. The passages' wording is never changed, only selected. Each gets a "Draft" badge until reviewed.
- `make-seed.ts` includes passages. The `sourcesFingerprint`/`stillCurrent` checks cover passage refs, so editing a passage retires cached answers that cite it.
- App: a `passage` block (work and ref, English text, Sanskrit if present, translator).

### 3. Kosmik chats: palm, tarot, kundli only
- In `mode === 'kosmik'`, a question that would go to the Gita/RAG layer gets the notice `use-shanti` with an "Open a Shanti chat" button carrying the question. The test is: no astrology, palm or tarot intent, and either a Gita reference or not about the person's chart. Questions about the person's own life with birth details saved still go to the chart, as today ("will my love life improve?" is a kundli question).
- Meaning look-ups (graha, rashi, nakshatra, house, tarot cards) and the zodiac card stay in Kosmik.
- Chats with no mode (guests and old clients): unchanged.

### 4. Kundli answers
- `chartAnswer` gets `showWestern` only when the question asks for the kundli or chart itself. A new `KUNDLI_ITSELF` regex covers "my kundli/kundali/janam kundli/birth chart/chart", "read/show/analyse my chart", "meri kundli dikhao", "कुंडली", and the Western and zodiac words already in `intents.ts:233`. It also only shows when Western lines haven't appeared earlier in the chat (unchanged).
- Otherwise there are no Western lines and no `vedicIntro` label, and the prompt says to start with the person's first name and the verdict. The model already gets the profile name in `deepChart`.

### 5. App
- `Sidebar.tsx`: an "Ask Shanti" button under "Ask Ayurveda", its own colour and glyph (🪷), and a filter chip. The chat list label is "Shanti chat".
- `Conversation.tsx`: an empty-state prompt for Shanti ("Tell me what's on your heart. Nothing you say here goes to anyone else."), and a `use-shanti` notice with a button, like `use-ayurveda`.
- `i18n-hi.ts`: Hindi labels for all new strings.
- Help, terms and privacy: a line on what Shanti is and isn't (not therapy, helpline numbers). The landing page gets a short Shanti card.
- Plain and minimal, working at 375px in light and dark.

### 6. Tests (api, existing vitest style)
- Routing: Shanti mode never reaches the chart, and the Kosmik mode Gita question gets `use-shanti`.
- Cache: a Shanti cached answer isn't served in a Kosmik chat, and the other way round. Personal Shanti questions aren't cached.
- Concern levels produce the right notices, and the banned phrases trigger a retry.
- Kundli: "show my kundli" shows the Western lines and label, while "when will my finances improve" doesn't, and its answer has no label.
- Passages: seed and fingerprint include passages (step 2).

## Order of work
1. Kundli Western change (small, separate).
2. Kosmik-only routing plus the `use-shanti` notice.
3. Shanti chat on the Gita: migration, cache split, prompt, alerts, app.
4. Passages library (after the owner approves the downloads).

Each step is checked with `npm run typecheck && npm test` (api) and `typecheck`, `lint` and `build:web` (app). Deploying and pushing happen only when the owner asks.

## Owner's calls (please confirm or change)
- **Name: "Shanti".** Short, Hindu, means peace, and reads the same in Hindi. Alternatives: Saathi, Sahara, Mann.
- **Limits:** Shanti uses the normal question allowance (guest 3 a day, Starter 11 a week).
- **Alerts:** these are shown to the person only. Nobody else (not the admin) is told; that would need consent and a different privacy policy.
- **Guests:** they can use Shanti too, but nothing is kept (as today).

## Not in this repo: the "Sign in to Wearday" email
The sign-in code email comes from the shared Asanoha Supabase Auth project (also used by Wearday and the store). Its subject, body and sender name are set in the Supabase dashboard (Authentication → Email Templates, and the SMTP sender name), not in Kosmik's code. Changing "Wearday" to "Asanoha" there fixes Kosmik and makes Wearday's and the store's emails say Asanoha too. That fits, because it is one Asanoha account. It needs the owner's dashboard sign-in: either the owner edits it, or Claude does it in the browser pane once the owner is signed in there.
