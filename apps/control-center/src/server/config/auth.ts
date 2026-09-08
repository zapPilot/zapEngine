import type { ControlCenterConfig } from './env.js';

/**
 * The remote operator surface has no platform-level gate in front of it: on
 * Vercel's Hobby tier, Standard Protection covers deployment URLs but not a
 * production custom domain, so `ops.zap-pilot.org` served every read and every
 * pipeline mutation anonymously. Credentials are therefore mandatory wherever
 * this is called, and their absence must stop the process rather than degrade
 * into the unauthenticated mode that was live until now.
 */
export function requireControlCenterAuth(config: ControlCenterConfig): {
  username: string;
  password: string;
} {
  return {
    username: required(config.OPS_AUTH_USERNAME, 'OPS_AUTH_USERNAME'),
    password: required(config.OPS_AUTH_PASSWORD, 'OPS_AUTH_PASSWORD'),
  };
}

function required(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
