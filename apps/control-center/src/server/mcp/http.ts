import { timingSafeEqual } from 'node:crypto';

import { createMcpHandler } from '@modelcontextprotocol/server';
import type { Hono } from 'hono';

import { captureServerException } from '../observability/sentry.js';
import { createOpsMcpServer } from './server.js';
import type { OpsMcpOperations } from './types.js';

export function registerOpsMcpHttp(
  app: Hono,
  input: {
    operations: OpsMcpOperations;
    token?: string;
  },
): void {
  // createMcpHandler is stateless by default and constructs a fresh McpServer
  // per HTTP request, which is the right lifecycle for Vercel functions.
  const handler = createMcpHandler(() => createOpsMcpServer(input.operations));

  app.all('/api/mcp', async (context) => {
    if (!isAuthorized(context.req.header('authorization'), input.token)) {
      context.header('WWW-Authenticate', 'Bearer');
      return context.json({ error: 'Unauthorized' }, 401);
    }

    try {
      return await handler.fetch(context.req.raw);
    } catch (error) {
      captureServerException(error, {
        method: context.req.method,
        route: '/api/mcp',
      });
      return context.json({ error: 'Internal Server Error' }, 500);
    }
  });
}

function isAuthorized(
  authorization: string | undefined,
  expectedToken: string | undefined,
): boolean {
  if (!expectedToken || !authorization?.startsWith('Bearer ')) return false;

  const presented = Buffer.from(authorization.slice('Bearer '.length));
  const expected = Buffer.from(expectedToken);
  return (
    presented.length === expected.length && timingSafeEqual(presented, expected)
  );
}
