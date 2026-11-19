# Kosmik MCP server (Kosmik in Claude and ChatGPT)

Owner's request (2026-11-19): an MCP server so people can add Kosmik to Claude and ChatGPT and ask
there. Goal: reach people where they already ask questions, at almost no AI cost to Kosmik, since
their own AI writes the answer from Kosmik's exact calculations.

## Decided
- **Its own Worker,** `kosmik-mcp`, in a new `mcp/` folder. It imports the existing calculation code
  from `api/src` and binds the same D1 database, so a fault in it can't take the app down. The
  address is `https://kosmik-mcp.prime-adarsh108.workers.dev/mcp` to start; a custom domain comes later.
- **Transport:** MCP Streamable HTTP, stateless (`@modelcontextprotocol/sdk` 1.32.2, its web-standard
  transport). No Durable Objects.
- **Sign-in:** OAuth 2.1 with dynamic client registration, as Claude and ChatGPT expect, using
  `@cloudflare/workers-oauth-provider` 1.2.4 in its one-Worker form (`OAuthProvider`). Tokens are
  kept in a new KV namespace, `OAUTH_KV`.
  1. Claude or ChatGPT opens the Worker's `/authorize`. The Worker checks the request and sends the
     person to a new app page, `kosmik.asanoha.co.in/connect?request=…`.
  2. On that page the person signs in with their Asanoha account as usual (email code or Google) and
     sees "Allow Claude/ChatGPT to use your Kosmik account? It will see your birth details and chart."
     with Allow and Cancel.
  3. On Allow, the page sends the person's Supabase session token to the Worker. The Worker checks it
     with Supabase, exactly as the API does today, and finishes the OAuth flow with the person's user
     ID. Nothing else about the account is stored in the token.
- **Tools.** Each returns plain text the other AI can read, ending with Kosmik's rules.
  - `my_kundali`: lagna, Moon sign, nakshatra, planets with house, sign, degree and dignity,
    panchang at birth, yogas. Uses the saved birth details.
  - `my_dashas`: the full Vimshottari table with antardashas, and the running periods marked.
  - `transits_now`: Saturn, Jupiter, Rahu and Ketu against their chart, and Sade Sati and dhaiya.
  - `match_kundali`: Guna Milan and Manglik with a partner, from the partner's birth date, time and
    place (looked up the same way as in the app). The partner's details are never saved.
  - `draw_tarot`: 1 or 3 cards drawn by Kosmik, with their meanings.
  - `find_verse`: a Gita verse by chapter and verse, or a verse for a feeling or topic, from the library.
  - `herb_info`: an Ayurveda herb by name, from the herb library.
  - `my_prakriti`: their prakriti and vikriti results, if they took the quizzes.
  - `my_reports` (Premium): the reports they've bought, in full.
- **No birth details yet:** the chart tools reply "Add your birth details in Kosmik first" with a link
  to the account page, instead of failing.
- **Rules travel with every answer:** no fear, no gemstones or paid pujas, dates only from the chart,
  and for health, a doctor first. These go in each tool's description and at the end of each result.
- **Limits:** the tools use no AI, so they don't count toward the 11-a-week or 10-a-day questions.
  Each account gets up to 100 tool calls a day, to stop scraping.

## Left out of the first version
- `ask_kosmik` (Kosmik's own AI answer): it costs Gemini on every call and needs the chat pipeline.
  It can come next if people want it.
- Listing in the Claude and ChatGPT connector directories: after it has run well for a while.
- A custom domain such as `mcp.kosmik.asanoha.co.in`.

## Approaches considered
1. Separate Worker with the one-Worker OAuth provider (picked). It keeps the live API untouched and
   needs only one new KV namespace.
2. Adding `/mcp` to the existing API Worker. It would share code without imports, but wrapping the
   live API in the OAuth provider risks breaking the app.
3. Cloudflare's `agents` package (McpAgent with Durable Objects). That's more than stateless tools need.

## Constraints
No secrets in the code. The Supabase URL and anon key are public, as in the API. Packages are
installed with `npm install --ignore-scripts`. Everything is tested with `node --test`, as the API is.
