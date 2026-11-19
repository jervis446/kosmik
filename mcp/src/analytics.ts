/**
 * Each MCP tool call as a PostHog event (EU), under the same person id the app uses, so app and
 * Claude/ChatGPT use show up in one history. Only the tool name and outcome: never what was asked.
 */
export type Outcome = 'ok' | 'error' | 'limit';
export type ToolCall = { tool: string; outcome: Outcome; premium: boolean };

export const POSTHOG_HOST = 'https://eu.i.posthog.com';

/** Which app made the call, from the request's user agent. */
export function clientFrom(userAgent: string | null): 'Claude' | 'ChatGPT' | 'other' {
  const ua = (userAgent ?? '').toLowerCase();
  if (ua.includes('claude') || ua.includes('anthropic')) return 'Claude';
  if (ua.includes('openai') || ua.includes('chatgpt')) return 'ChatGPT';
  return 'other';
}

export function toolCallEvent(c: ToolCall & { key: string; userId: string; userAgent: string | null; now: Date }) {
  return {
    api_key: c.key,
    event: 'mcp_tool_called',
    distinct_id: c.userId,
    timestamp: c.now.toISOString(),
    properties: {
      tool: c.tool,
      outcome: c.outcome,
      premium: c.premium,
      client: clientFrom(c.userAgent),
      user_agent: (c.userAgent ?? '').slice(0, 120),
      $lib: 'kosmik-mcp',
    } as Record<string, unknown>,
  };
}

/** Sends one event; a PostHog problem never affects the tool call. */
export async function sendToPostHog(event: ReturnType<typeof toolCallEvent>): Promise<void> {
  try {
    await fetch(`${POSTHOG_HOST}/i/v0/e/`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(event) });
  } catch {
    // Analytics is best effort.
  }
}
