import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

interface VercelRouteCondition {
  type: 'query';
  key: string;
}

interface VercelRedirect {
  source: string;
  destination: string;
  permanent?: boolean;
  missing?: VercelRouteCondition[];
}

interface VercelConfig {
  redirects?: VercelRedirect[];
  rewrites?: Array<{ source: string; destination: string }>;
}

const appRoot = fileURLToPath(new URL('..', import.meta.url));
const config = JSON.parse(
  readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'),
) as VercelConfig;

describe('web deployment routing', () => {
  it('redirects ordinary root visits to Podcast before the SPA boots', () => {
    expect(config.redirects).toContainEqual({
      source: '/',
      destination: '/podcast',
      permanent: false,
      missing: [{ type: 'query', key: 'userId' }],
    });
  });

  it('keeps the SPA fallback for bundle-view root requests', () => {
    expect(config.rewrites).toContainEqual({
      source: '/(.*)',
      destination: '/index.html',
    });
  });
});
