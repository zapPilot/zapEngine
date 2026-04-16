import { Logger } from '@common/logger';
import type { MiddlewareHandler } from 'hono';

export function createRequestLoggerMiddleware(): MiddlewareHandler {
  const logger = new Logger('HTTP');

  return async (c, next) => {
    const { method } = c.req;
    const path = c.req.path;
    const ip =
      c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? 'unknown';
    const userAgent = c.req.header('user-agent') ?? '';
    const startTime = Date.now();

    await next();

    const statusCode = c.res.status;
    const duration = Date.now() - startTime;
    const logMessage = `${method} ${path} ${statusCode} ${duration}ms - ${ip} "${userAgent}"`;

    if (statusCode >= 500) {
      logger.error(logMessage);
      return;
    }

    if (statusCode >= 400) {
      logger.warn(logMessage);
      return;
    }

    logger.log(logMessage);
  };
}
