import { describe, expect, it } from 'vitest';

import { createControlCenterApp } from './app.js';
import { readControlCenterConfig } from './config/env.js';

const EPISODE_ID = '826f4b87-6278-4275-bff5-535ba5ef438d';

describe('retired social release routes', () => {
  it.each([false, true])(
    'exposes no release evidence or closure API (authenticated: %s)',
    async (authenticated) => {
      const app = createControlCenterApp({
        config: readControlCenterConfig({}),
        auth: authenticated
          ? { username: 'operator', password: 'test-password' }
          : undefined,
      });
      for (const [method, path] of [
        ['GET', '/api/operations/social/release-evidence'],
        ['POST', `/api/operations/social/${EPISODE_ID}/complete`],
      ] as const) {
        const response = await app.request(path, {
          method,
          headers: authenticated
            ? { Authorization: `Basic ${btoa('operator:test-password')}` }
            : {},
        });
        expect(response.status).toBe(404);
      }
    },
  );
});
