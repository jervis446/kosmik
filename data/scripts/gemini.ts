/**
 * Calls Gemini's OpenAI-compatible API from the build scripts.
 * Needs GEMINI_API_KEY. Run with NODE_USE_ENV_PROXY=1 behind an HTTP proxy.
 */
export const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** POSTs to Gemini, retrying rate limits and server errors with backoff. */
export async function gemini<T>(path: string, body: unknown, attempts = 5): Promise<T> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('Set GEMINI_API_KEY');
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${GEMINI_URL}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
    });
    if (res.ok) return (await res.json()) as T;
    const retry = res.status === 429 || res.status >= 500;
    if (!retry || attempt >= attempts) throw new Error(`Gemini ${path} failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
    await sleep(1500 * 2 ** attempt);
  }
}
