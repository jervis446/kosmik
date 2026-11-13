/**
 * Embeds texts with Gemini (gemini-embedding-2, multilingual) at the size the Worker uses.
 * Used at build time for the verse and meaning libraries; the Worker embeds questions at runtime
 * with the same model and size (api/src/ai.ts), so the two must change together.
 *
 * Needs GEMINI_API_KEY. Usage: node data/scripts/embed.ts <input.json> <output.json>
 *   input:  [{ "key": "...", "text": "..." }, ...]
 *   output: { "model": "...", "dims": 768, "vectors": { "<key>": "<base64 float32>" } }
 */
import { readFileSync, writeFileSync } from 'node:fs';

import { EMBED_DIMS, EMBED_MODEL } from '../../api/src/ai.ts';
import { gemini } from './gemini.ts';

const BATCH = 50;

export async function embedBatch(texts: string[]): Promise<number[][]> {
  const out = await gemini<{ data?: { embedding: number[] }[] }>('/embeddings', { model: EMBED_MODEL, input: texts, dimensions: EMBED_DIMS });
  const vectors = out.data?.map((d) => d.embedding) ?? [];
  if (vectors.length !== texts.length || vectors.some((v) => v.length !== EMBED_DIMS)) throw new Error('Embedding returned the wrong shape');
  return vectors;
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
  }
  writeFileSync(output, JSON.stringify({ model: EMBED_MODEL, dims: EMBED_DIMS, vectors }) + '\n');
  console.log(`\nWrote ${Object.keys(vectors).length} vectors to ${output}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
