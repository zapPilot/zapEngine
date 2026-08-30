import { createMcpHandler } from '@modelcontextprotocol/server';
import type { Hono } from 'hono';

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
    if (!input.token) {
      return context.json(
        { error: 'Ops MCP remote access is not configured.' },
        503,
      );
    }

    if (context.req.header('authorization') !== `Bearer ${input.token}`) {
      context.header('WWW-Authenticate', 'Bearer');
      return context.json({ error: 'Unauthorized' }, 401);
    }

    return handler.fetch(context.req.raw);
  });
}
