import type { MiddlewareHandler } from 'hono';

import { UnauthorizedException } from '../http';

interface ApiKeyEnv {
  ADMIN_API_KEY?: string;
}

export function resolveAdminApiKey(env: ApiKeyEnv): string | undefined {
  return env.ADMIN_API_KEY;
}

export function requireApiKey(env: ApiKeyEnv): MiddlewareHandler {
  return async (c, next) => {
    const apiKey = c.req.header('x-api-key');
    if (!apiKey) {
      throw new UnauthorizedException('Missing x-api-key header');
    }

    const expectedApiKey = resolveAdminApiKey(env);
    if (!expectedApiKey) {
      throw new UnauthorizedException(
        'Server configuration error: ADMIN_API_KEY not set',
      );
    }

    if (apiKey !== expectedApiKey) {
      throw new UnauthorizedException('Invalid API key');
    }

    await next();
  };
}
