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
  // Headerless CLI clients continue through the existing authentication guard.
  return next();
};
