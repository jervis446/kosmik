import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { d1 } from '../../api/test/d1.ts';
import { kosmikServer, TOOL_NAMES } from '../src/server.ts';

const NOW = new Date('2026-11-19T06:00:00Z');

async function connect(opts: { profile?: boolean } = {}) {
  const { db, raw } = d1();
  if (opts.profile !== false) {
    raw.prepare(
      `INSERT INTO profiles (user_id, name, birth_date, birth_time, place, lat, lon, tz_offset_min, consent_at, updated_at, gender)
       VALUES ('u1', 'Kiran', '1981-12-13', '01:20', 'Nashik', 20, 73.8667, 330, 0, 0, 'female')`,
    ).run();
  }
  const server = kosmikServer({ db, userId: 'u1', now: NOW, searchPlaces: async () => [] });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const client = new Client({ name: 'test', version: '1.0.0' });
  await client.connect(b);
  return { client, raw };
}

const text = (r: { content?: unknown }) => ((r.content as { type: string; text: string }[])[0]).text;

test('the server lists every Kosmik tool, all read-only, with Kosmik’s rules in the descriptions', async () => {
  const { client } = await connect();
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), [...TOOL_NAMES].sort());
  assert.equal(tools.length, 9);
  for (const t of tools) {
    assert.equal(t.annotations?.readOnlyHint, true, t.name);
    assert.ok((t.description ?? '').length > 40, `${t.name} explains itself`);
  }
  assert.match(tools.find((t) => t.name === 'match_kundali')!.description!, /not saved/);
});

test('a tool call returns Kosmik’s text', async () => {
  const { client } = await connect();
  const r = await client.callTool({ name: 'my_kundali', arguments: {} });
  assert.equal(r.isError, undefined);
  assert.match(text(r), /Lagna \(ascendant\): Kanya/);
});

test('a bad input comes back as a readable tool error, not a crash', async () => {
  const { client } = await connect();
  const r = await client.callTool({ name: 'match_kundali', arguments: { birthDate: '1980-05-10', place: 'Nowhere' } });
  assert.equal(r.isError, true);
  assert.match(text(r), /couldn’t find that place/);
});

test('after 100 calls in a day the tools say so', async () => {
  const { client, raw } = await connect();
  raw.prepare("INSERT INTO usage (subject, period, count) VALUES ('mcp:u1', 'd:2026-11-19', 100)").run();
  const r = await client.callTool({ name: 'draw_tarot', arguments: { count: 1 } });
  assert.equal(r.isError, true);
  assert.match(text(r), /used today’s 100 Kosmik lookups/);
});
