/**
 * Local development only. Forwards Gemini calls from `wrangler dev` to the Gemini API, for
 * machines where the local Worker runtime can't reach the internet directly (for example behind
 * an HTTP proxy, which Node honours with NODE_USE_ENV_PROXY=1 and the runtime doesn't).
 * Listens on 127.0.0.1 only and passes the Worker's Authorization header through.
 *
 * Usage: NODE_USE_ENV_PROXY=1 node data/scripts/ai-relay.ts [port]
 * Then set GEMINI_BASE_URL=http://127.0.0.1:<port> in api/.dev.vars.
 */
import { createServer } from 'node:http';

import { GEMINI_URL } from './gemini.ts';

const port = Number(process.argv[2] ?? 8788);
const PATHS = new Set(['/chat/completions', '/embeddings']);

createServer(async (req, res) => {
  if (req.method !== 'POST' || !PATHS.has(req.url ?? '')) {
    res.writeHead(404).end();
    return;
  }
  try {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const upstream = await fetch(`${GEMINI_URL}${req.url}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: req.headers.authorization ?? '' },
      body: Buffer.concat(chunks),
    });
    res.writeHead(upstream.status, { 'content-type': 'application/json' }).end(await upstream.text());
  } catch (e) {
    res.writeHead(502, { 'content-type': 'application/json' }).end(JSON.stringify({ error: String(e) }));
  }
}).listen(port, '127.0.0.1', () => console.log(`Gemini relay on http://127.0.0.1:${port}`));
