import { UnauthorizedException } from '@common/http';
import type { MiddlewareHandler } from 'hono';

interface ApiKeyEnv {
  ADMIN_API_KEY?: string;
  API_KEY?: string;
}

/**
 * Resolve the configured admin API key, preferring ADMIN_API_KEY with API_KEY fallback.
 */
export function resolveAdminApiKey(env: ApiKeyEnv): string | undefined {
  return env.ADMIN_API_KEY ?? env.API_KEY;
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
