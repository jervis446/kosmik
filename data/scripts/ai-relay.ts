/**
 * Local development only. Forwards Workers AI calls from `wrangler dev` to the Workers AI REST
 * API, for machines where the local runtime can't reach Cloudflare directly (for example
 * behind an HTTP proxy). Listens on 127.0.0.1 only.
 *
 * Usage: NODE_USE_ENV_PROXY=1 CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... node data/scripts/ai-relay.ts [port]
 * Then set AI_RELAY_URL=http://127.0.0.1:<port> in api/.dev.vars.
 */
import { createServer } from 'node:http';

const port = Number(process.argv[2] ?? 8788);
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!account || !token) throw new Error('Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN');

createServer(async (req, res) => {
  const model = /^\/run\/(@cf\/[\w.@/-]+)$/.exec(req.url ?? '')?.[1];
  if (req.method !== 'POST' || !model) {
    res.writeHead(404).end();
    return;
  }
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const upstream = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${model}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: Buffer.concat(chunks),
  });
  const body = (await upstream.json().catch(() => ({}))) as { success?: boolean; result?: unknown };
  res.writeHead(upstream.ok && body.success ? 200 : 502, { 'content-type': 'application/json' }).end(JSON.stringify(body.result ?? body));
}).listen(port, '127.0.0.1', () => console.log(`AI relay on http://127.0.0.1:${port}`));
