/**
 * Kosmik's MCP server: Kosmik in Claude and ChatGPT. People add https://<this Worker>/mcp as a
 * connector and sign in with their Asanoha account (see authorize.ts). Every tool is calculated or
 * looked up (see tools.ts): no AI runs here.
 */
import { OAuthProvider } from '@cloudflare/workers-oauth-provider';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';

import { handleAuthorize, handleConnectCode, handleDeny, handleFinish, type AuthEnv } from './authorize.ts';
import { kosmikServer } from './server.ts';

export type Env = AuthEnv & {
  DB: D1Database;
  /** This Worker's MCP address, e.g. https://kosmik-mcp.prime-adarsh108.workers.dev/mcp */
  MCP_URL: string;
};

/** One stateless MCP exchange for the signed-in account (ctx.props comes from the OAuth grant). */
const mcp = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext & { props?: { userId?: string } }): Promise<Response> {
    const userId = ctx.props?.userId;
    if (!userId) return new Response('Unauthorized', { status: 401 });
    const server = kosmikServer({ db: env.DB, userId, now: new Date() });
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await server.connect(transport);
    return transport.handleRequest(request);
  },
};

const site = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === '/authorize') return handleAuthorize(request, env);
    if (pathname === '/connect/code') return handleConnectCode(request, env);
    if (pathname === '/authorize/finish') return handleFinish(request, env);
    if (pathname === '/authorize/deny') return handleDeny(request, env);
    if (pathname === '/') return Response.redirect(`${env.SITE_URL}/`, 302);
    return new Response('Not found', { status: 404 });
  },
};

/** Built on first use, from MCP_URL (this Worker's /mcp address, which differs in local testing). */
let provider: OAuthProvider<Env> | null = null;

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    provider ??= new OAuthProvider<Env>({
      apiRoute: '/mcp',
      apiHandler: mcp as ExportedHandler<Env> & { fetch: NonNullable<ExportedHandler<Env>['fetch']> },
      defaultHandler: site as ExportedHandler<Env>,
      authorizeEndpoint: '/authorize',
      tokenEndpoint: '/token',
      clientRegistrationEndpoint: '/register',
      scopesSupported: ['kosmik', 'offline_access'],
      resourceMetadata: { resource: env.MCP_URL, resource_name: 'Kosmik' },
      requiredScopes: ['kosmik'],
    });
    return provider.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
