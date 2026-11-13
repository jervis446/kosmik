import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { EMBED_DIMS, EMBED_MODEL, GeminiAi, parsePalm } from '../src/ai.ts';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

type Call = { url: string; headers: Record<string, string>; body: Record<string, unknown> };

function fakeFetch(reply: (call: Call) => { status?: number; json: unknown }): Call[] {
  const calls: Call[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    const call = { url, headers: init.headers as Record<string, string>, body: JSON.parse(init.body as string) };
    calls.push(call);
    const r = reply(call);
    return new Response(JSON.stringify(r.json), { status: r.status ?? 200 });
  }) as typeof fetch;
  return calls;
}

const sources = {
  verses: [{ ref: 'BG 2.47', chapter: 2, verse: 47, sanskrit: '', iast: '', translation: 'Thy right is to work only.', translator: 'Swami Sivananda' }],
  meanings: [],
} as unknown as Parameters<GeminiAi['answer']>[2];

test('embed asks Gemini for the library model and size', async () => {
  const calls = fakeFetch(() => ({ json: { data: [{ embedding: new Array(EMBED_DIMS).fill(0.1) }] } }));
  const ai = new GeminiAi({ apiKey: 'test-key' });
  const v = await ai.embed('mujhe chinta hoti hai');
  assert.equal(v.length, EMBED_DIMS);
  assert.match(calls[0].url, /\/v1beta\/openai\/embeddings$/);
  assert.equal(calls[0].headers.authorization, 'Bearer test-key');
  assert.deepEqual(calls[0].body, { model: EMBED_MODEL, input: ['mujhe chinta hoti hai'], dimensions: EMBED_DIMS });
});

test('embed rejects a vector of the wrong size', async () => {
  fakeFetch(() => ({ json: { data: [{ embedding: [0.1, 0.2] }] } }));
  await assert.rejects(new GeminiAi({ apiKey: 'k' }).embed('x'), /Embedding failed/);
});

test('answer sends the sources and parses the JSON reply', async () => {
  const calls = fakeFetch(() => ({
    json: { choices: [{ message: { content: '{"answer":"Focus on the work.","cited":["BG 2.47"],"personal":false,"off_topic":false}' } }] },
  }));
  const ai = new GeminiAi({ apiKey: 'k', model: 'gemini-test', baseUrl: 'http://127.0.0.1:8788/' });
  const out = await ai.answer('exam ki tension', 'hinglish', sources);
  assert.deepEqual(out, { answer: 'Focus on the work.', cited: ['BG 2.47'], personal: false, offTopic: false });
  assert.equal(calls[0].url, 'http://127.0.0.1:8788/chat/completions');
  assert.equal(calls[0].body.model, 'gemini-test');
  assert.equal(calls[0].body.reasoning_effort, 'none');
  const user = (calls[0].body.messages as { content: string }[])[1].content;
  assert.match(user, /Hinglish/);
  assert.match(user, /\[BG 2\.47\]/);
});

test('errors are thrown (so the pipeline shows "busy") and a missing key never calls out', async () => {
  fakeFetch(() => ({ status: 429, json: { error: { message: 'Resource exhausted' } } }));
  await assert.rejects(new GeminiAi({ apiKey: 'k' }).answer('q', 'en', sources), /failed \(429\)/);

  const calls = fakeFetch(() => ({ json: {} }));
  await assert.rejects(new GeminiAi({}).embed('q'), /GEMINI_API_KEY is not set/);
  assert.equal(calls.length, 0);
});

test('palm: the photo is sent as an inline image and the reply is parsed', async () => {
  const calls = fakeFetch(() => ({
    json: { choices: [{ message: { content: '{"is_palm":true,"overview":"A long, narrow palm.","lines":[{"name":"Heart line","reading":"Curved and deep."}]}' } }] },
  }));
  const out = await new GeminiAi({ apiKey: 'k' }).readPalm({ data: 'QUJD', mime: 'image/jpeg' }, 'hi');
  assert.deepEqual(out, { isPalm: true, overview: 'A long, narrow palm.', lines: [{ name: 'Heart line', reading: 'Curved and deep.' }] });
  const content = (calls[0].body.messages as { content: unknown }[])[1].content as { type: string; text?: string; image_url?: { url: string } }[];
  assert.match(content[0].text!, /Hindi/);
  assert.equal(content[1].image_url!.url, 'data:image/jpeg;base64,QUJD');
});

test('palm: "is_palm" without readable lines counts as not a palm; junk is rejected', () => {
  assert.equal(parsePalm('{"is_palm":true,"overview":"Too dark to see.","lines":[]}')?.isPalm, false);
  assert.equal(parsePalm('no json here'), null);
  assert.equal(parsePalm('{"is_palm":true,"overview":"","lines":[]}'), null);
});
