import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { EMBED_DIMS, EMBED_MODEL, GeminiAi, parsePalm, parseShanti } from '../src/ai.ts';

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
  assert.deepEqual(out, { answer: 'Focus on the work.', cited: ['BG 2.47'], personal: false, offTopic: false, followUps: [], behind: [] });
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
  const out = await new GeminiAi({ apiKey: 'k' }).readPalm(
    [
      { data: 'QUJD', mime: 'image/jpeg', hand: 'left' },
      { data: 'REVG', mime: 'image/jpeg', hand: 'right' },
    ],
    'hi',
    { question: 'meri life line kaisi hai?' },
  );
  assert.deepEqual(out, { isPalm: true, overview: 'A long, narrow palm.', lines: [{ name: 'Heart line', reading: 'Curved and deep.' }] });
  const content = (calls[0].body.messages as { content: unknown }[])[1].content as { type: string; text?: string; image_url?: { url: string } }[];
  assert.match(content[0].text!, /Hindi/);
  assert.match(content[0].text!, /meri life line kaisi hai\?/);
  assert.deepEqual(
    content.slice(1).map((c) => c.text ?? c.image_url!.url),
    ['Left hand:', 'data:image/jpeg;base64,QUJD', 'Right hand:', 'data:image/jpeg;base64,REVG'],
  );
});

test('palm: "is_palm" without readable lines counts as not a palm; junk is rejected', () => {
  assert.equal(parsePalm('{"is_palm":true,"overview":"Too dark to see.","lines":[]}')?.isPalm, false);
  assert.equal(parsePalm('no json here'), null);
  assert.equal(parsePalm('{"is_palm":true,"overview":"","lines":[]}'), null);
});

test('a reply in the wrong language is asked for again, with the language repeated at the end', async () => {
  const english = 'Patience in the Gita means staying steady through both pleasure and pain, doing your duty without clinging to the result.';
  const hindi = 'गीता में धैर्य का अर्थ है सुख और दुख दोनों में स्थिर रहना, और फल की चिंता किए बिना अपना कर्तव्य करना।';
  let n = 0;
  const calls = fakeFetch(() => ({ json: { choices: [{ message: { content: JSON.stringify({ answer: n++ === 0 ? english : hindi, cited: [], follow_ups: [] }) } }] } }));
  const g = await new GeminiAi({ apiKey: 'k' }).answer('What does the Gita say about patience?', 'hi', sources);
  assert.equal(g.answer, hindi);
  assert.equal(calls.length, 2);
  const user = (c: Call) => String((c.body.messages as { content: string }[])[1].content);
  assert.match(user(calls[0]), /LANGUAGE: Reply in Hindi, in Devanagari script\.[^\n]*$/);
  assert.match(user(calls[1]), /previous reply was in the wrong language/);
});

test('a reply already in the right language is not asked for twice', async () => {
  const calls = fakeFetch(() => ({ json: { choices: [{ message: { content: JSON.stringify({ answer: 'Gita mein dhairya ka matlab hai sukh aur dukh dono mein steady rehna, aur result ki chinta kiye bina apna kaam karna.', cited: [], follow_ups: [] }) } }] } }));
  await new GeminiAi({ apiKey: 'k' }).answer('Gita patience ke baare mein kya kehti hai?', 'hinglish', sources);
  assert.equal(calls.length, 1);
});

test('partialField reads the answer while the JSON is still being written', async () => {
  const { partialField } = await import('../src/ai.ts');
  assert.equal(partialField('{"answer": "Riya, yes, you can st', 'answer'), 'Riya, yes, you can st');
  assert.equal(partialField('{"answer": "Line one.\\nLine \\"two\\"', 'answer'), 'Line one.\nLine "two"');
  assert.equal(partialField('{"answer": "done", "cited": []}', 'answer'), 'done');
  assert.equal(partialField('{"answer": "ends on an escape \\', 'answer'), 'ends on an escape ');
  assert.equal(partialField('{"mode": "ask", "reply": "\\u0939\\u093f', 'reply'), 'हि');
  assert.equal(partialField('{"mode": "ask"', 'reply'), '');
});

test('with onText set, the answer streams and arrives in pieces', async () => {
  const chunks = ['{"answer": "Riya, ', 'yes, you can', ' start it.", "cited": [], "personal": false, "off_topic": false, "follow_ups": [], "behind": []}'];
  globalThis.fetch = (async () => {
    const body = chunks.map((c) => `data: ${JSON.stringify({ choices: [{ delta: { content: c } }] })}\n\n`).join('') + 'data: [DONE]\n\n';
    return new Response(body, { status: 200 });
  }) as typeof fetch;
  const ai = new GeminiAi({ apiKey: 'k' });
  const seen: string[] = [];
  ai.onText = (t) => seen.push(t);
  const g = await ai.answer('can I start?', 'en', sources);
  assert.equal(g.answer, 'Riya, yes, you can start it.');
  assert.ok(seen.length >= 1 && seen.at(-1) === 'Riya, yes, you can start it.');
});

test('shanti: the reply is parsed; concern is one of three values, and an empty answer is rejected', () => {
  const r = parseShanti('{"answer": "That hurts. ", "cited": ["BG 2.14", 3], "concern": "high", "follow_ups": ["How do I sleep tonight?"]}');
  assert.deepEqual(r, { answer: 'That hurts.', cited: ['BG 2.14'], concern: 'high', followUps: ['How do I sleep tonight?'] });
  assert.equal(parseShanti('{"answer": "Hi", "concern": "panic"}')?.concern, 'none');
  assert.equal(parseShanti('{"answer": ""}'), null);
  assert.equal(parseShanti('not json'), null);
});

test('shanti prompt: speaks by the {name} token, suggests something uplifting, and answers questions about the texts', async () => {
  const { SHANTI_PROMPT } = await import('../src/ai.ts');
  assert.match(SHANTI_PROMPT, /\{name\}, \.\.\./);
  assert.match(SHANTI_PROMPT, /happy thing to do today/);
  assert.match(SHANTI_PROMPT, /When they ask about the texts/);
});

test('answers lose em dashes, semicolons and markdown, but keep number ranges', async () => {
  const { cleanAnswer } = await import('../src/ai.ts');
  assert.equal(cleanAnswer('Saturn is slow — give it time; it lifts in **June 2027**.'), 'Saturn is slow, give it time. It lifts in June 2027.');
  assert.equal(cleanAnswer('## Today\n* Eat warm food\n* Sleep by 10'), 'Today\nEat warm food\nSleep by 10');
  assert.equal(cleanAnswer('From 2026–2027 the dasha runs.'), 'From 2026–2027 the dasha runs.');
});

test('every chat prompt carries the same human writing style', async () => {
  const ai = await import('../src/ai.ts');
  for (const p of [ai.systemPrompt('open'), ai.systemPrompt('safe'), ai.AYURVEDA_PROMPT, ai.SHANTI_PROMPT, ai.TAROT_PROMPT, ai.PALM_PROMPT]) {
    assert.ok(p.includes(ai.STYLE), p.slice(0, 40));
  }
  assert.match(ai.STYLE, /mild uncertainty/);
  assert.match(ai.STYLE, /em dashes/);
});

test('parseReport: keeps the dasha, transit and dosha readings', async () => {
  const { parseReport } = await import('../src/ai.ts');
  const r = parseReport(JSON.stringify({
    headline: 'H', summary: 'S', sections: [1, 2, 3].map((i) => ({ heading: `A${i}`, body: 'B' })), timing: [], remedies: [], strengths: [], watch: [], follow_ups: [],
    periods: [{ when: '2024 – 2027', dasha: 'Mercury–Venus', reading: 'Good for love.' }, { when: '', dasha: 'x', reading: 'y' }],
    transits: [{ planet: 'Saturn', reading: 'Slow, steady.' }],
    doshas: [{ name: 'Manglik', reading: 'Mild, from the Moon only.' }],
  }))!;
  assert.deepEqual(r.periods, [{ when: '2024 – 2027', dasha: 'Mercury–Venus', reading: 'Good for love.' }]);
  assert.deepEqual(r.transits, [{ planet: 'Saturn', reading: 'Slow, steady.' }]);
  assert.deepEqual(r.doshas, [{ name: 'Manglik', reading: 'Mild, from the Moon only.' }]);
  assert.deepEqual(parseReport('{"headline":"H","summary":"S","sections":[{"heading":"A","body":"B"},{"heading":"C","body":"D"},{"heading":"E","body":"F"}]}')!.periods, [], 'older reports have none');
});

test('shanti: room for a long reply, and one cut-off reply is retried before giving up', async () => {
  const replies = [
    '{"answer": "{name}, feeling alone in a full room is real. The Gita says',
    JSON.stringify({ answer: '{name}, feeling alone in a full room is real.', cited: [], concern: 'none', follow_ups: [] }),
  ];
  const calls = fakeFetch(() => ({ json: { choices: [{ message: { content: replies.shift() } }] } }));
  const ai = new GeminiAi({ apiKey: 'k' });
  const r = await ai.shanti('I feel alone even with people around', 'en', { verses: [], passages: [] });
  assert.match(r.answer, /feeling alone/);
  assert.equal(calls.length, 2, 'retried once');
  assert.ok((calls[0].body.max_tokens as number) >= 3500);

  fakeFetch(() => ({ json: { choices: [{ message: { content: '{"answer": "{name}, cut' } }] } }));
  await assert.rejects(ai.shanti('I feel alone', 'en', { verses: [], passages: [] }), /no usable Shanti reply \(\d+ chars/);
});
