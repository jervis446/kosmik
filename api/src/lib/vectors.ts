/** Embedding vectors: storage encoding and similarity search. */

export type Hit = { id: string; score: number };

export const toBlob = (v: ArrayLike<number>): ArrayBuffer => new Float32Array(v).buffer as ArrayBuffer;

export function fromBlob(blob: ArrayBuffer | Uint8Array | number[]): Float32Array {
  if (Array.isArray(blob)) return new Float32Array(new Uint8Array(blob).buffer);
  const bytes = blob instanceof Uint8Array ? blob : new Uint8Array(blob);
  // Copy so the result is aligned regardless of where the bytes came from.
  return new Float32Array(bytes.slice().buffer);
}

export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export function topK(query: ArrayLike<number>, items: { id: string; vector: ArrayLike<number> }[], k: number, minScore = -1): Hit[] {
  const hits: Hit[] = [];
  for (const it of items) {
    const score = cosine(query, it.vector);
    if (score >= minScore) hits.push({ id: it.id, score });
  }
  return hits.sort((x, y) => y.score - x.score).slice(0, k);
}
