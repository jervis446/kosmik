import assert from 'node:assert/strict';
import { test } from 'node:test';

import { clientFrom, toolCallEvent } from '../src/analytics.ts';

test('the client is read from the request’s user agent', () => {
  assert.equal(clientFrom('Claude-User (claude-code/1.0)'), 'Claude');
  assert.equal(clientFrom('Mozilla/5.0 (compatible; Anthropic)'), 'Claude');
  assert.equal(clientFrom('openai-mcp/1.0.0'), 'ChatGPT');
  assert.equal(clientFrom('ChatGPT-User/1.0'), 'ChatGPT');
  assert.equal(clientFrom('curl/8.1'), 'other');
  assert.equal(clientFrom(null), 'other');
});

test('a tool call becomes one PostHog event for the same person as the app, with no inputs', () => {
  const e = toolCallEvent({
    key: 'phc_test', userId: 'u1', tool: 'match_kundali', outcome: 'ok', premium: false,
    userAgent: 'openai-mcp/1.0.0', now: new Date('2026-11-19T06:00:00Z'),
  });
  assert.deepEqual(e, {
    api_key: 'phc_test',
    event: 'mcp_tool_called',
    distinct_id: 'u1',
    timestamp: '2026-11-19T06:00:00.000Z',
    properties: { tool: 'match_kundali', outcome: 'ok', premium: false, client: 'ChatGPT', user_agent: 'openai-mcp/1.0.0', $lib: 'kosmik-mcp' },
  });
});

test('a long user agent is cut short', () => {
  const e = toolCallEvent({ key: 'k', userId: 'u1', tool: 'x', outcome: 'ok', premium: false, userAgent: 'a'.repeat(500), now: new Date(0) });
  assert.equal((e.properties.user_agent as string).length, 120);
});
