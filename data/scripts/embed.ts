/**
 * Embeds texts with Workers AI (@cf/baai/bge-m3, multilingual, 1024 dimensions) through the
 * Cloudflare REST API. Used at build time for the verse and meaning libraries; the Worker
 * uses the AI binding for questions at runtime.
 *
 * Needs CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN in the environment.
 * Usage: node data/scripts/embed.ts <input.json> <output.json>
 *   input:  [{ "key": "...", "text": "..." }, ...]
 *   output: { "model": "...", "dims": 1024, "vectors": { "<key>": "<base64 float32>" } }
 */
import { readFileSync, writeFileSync } from 'node:fs';

export const EMBED_MODEL = '@cf/baai/bge-m3';
const BATCH = 40;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function embedBatch(texts: string[]): Promise<number[][]> {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!account || !token) throw new Error('Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN');
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${EMBED_MODEL}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ text: texts }),
    });
    const body = (await res.json().catch(() => ({}))) as { success?: boolean; result?: { data?: number[][] }; errors?: unknown };
    if (res.ok && body.success && body.result?.data?.length === texts.length) return body.result.data;
    if (attempt >= 5) throw new Error(`Embedding failed (${res.status}): ${JSON.stringify(body.errors ?? body).slice(0, 300)}`);
    await sleep(1500 * 2 ** attempt);
  }
}

export const toBase64 = (v: number[]) => Buffer.from(new Float32Array(v).buffer).toString('base64');

async function main() {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) throw new Error('Usage: embed.ts <input.json> <output.json>');
  const items: { key: string; text: string }[] = JSON.parse(readFileSync(input, 'utf8'));
  const vectors: Record<string, string> = {};
  for (let i = 0; i < items.length; i += BATCH) {
    const batch = items.slice(i, i + BATCH);
    const data = await embedBatch(batch.map((b) => b.text));
    batch.forEach((b, j) => (vectors[b.key] = toBase64(data[j])));
    process.stdout.write(`\r${Math.min(i + BATCH, items.length)}/${items.length}`);
    await sleep(400);
  }
  writeFileSync(output, JSON.stringify({ model: EMBED_MODEL, dims: 1024, vectors }) + '\n');
  console.log(`\nWrote ${Object.keys(vectors).length} vectors to ${output}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
