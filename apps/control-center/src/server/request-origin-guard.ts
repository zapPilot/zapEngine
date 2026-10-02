import type { MiddlewareHandler } from 'hono';

/** Browser mutation requests must come from this dashboard's origin. */
export const requestOriginGuard: MiddlewareHandler = async (context, next) => {
  const { method, path } = context.req;
  // MCP authenticates bearer clients separately; GET/HEAD have no mutations.
  if (method === 'GET' || method === 'HEAD' || path === '/api/mcp') {
    return next();
  }
  const site = context.req.header('sec-fetch-site');
  const origin = context.req.header('origin');
  if (
    site === 'cross-site' ||
    site === 'same-site' ||
    (origin !== undefined && origin !== new URL(context.req.url).origin)
  ) {
    return context.json({ error: 'Cross-origin mutation denied' }, 403);
  }
  const mediaType = context.req
    .header('content-type')
    ?.split(';', 1)[0]
    ?.trim()
    .toLowerCase();
  if (mediaType !== 'application/json') {
    return context.json({ error: 'Mutation requires application/json' }, 415);
  }
  // CLI clients may omit browser metadata but must identify JSON mutations.
  return next();
};

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** The unauthenticated local API is available only on loopback hostnames. */
export const localHostGuard: MiddlewareHandler = async (context, next) => {
  if (!LOOPBACK_HOSTS.has(new URL(context.req.url).hostname)) {
    return context.json({ error: 'Unexpected local API host' }, 403);
  }
  return next();
};
