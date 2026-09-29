import { afterEach, describe, expect, it, vi } from 'vitest';

import { readControlCenterConfig } from '../config/env.js';
import { readMetricVersionContext } from './metric-version-context.js';

const now = new Date('2026-09-16T07:00:00Z');
const config = readControlCenterConfig({ OPS_GITHUB_TOKEN: 'read-token' });
const mainSha = 'a'.repeat(40);
const deployedSha = 'b'.repeat(40);
const deployment = {
  id: 1,
  sha: deployedSha,
  environment: 'production',
  production_environment: true,
};
const response = (body: unknown) => new Response(JSON.stringify(body));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('metric version context global fetch', () => {
  it('uses globalThis.fetch when no fetchImpl is injected', async () => {
    const fetchImpl = vi.fn(async (url: unknown) => {
      const text = String(url);
      if (text.endsWith('commits/main')) {
        return response({ sha: mainSha });
      }
      if (text.includes('/statuses')) {
        return response([
          { state: 'success', created_at: '2026-09-15T12:00:00Z' },
        ]);
      }
      return response([deployment]);
    });
    vi.stubGlobal('fetch', fetchImpl);

    const result = await readMetricVersionContext({ config, now });

    expect(fetchImpl).toHaveBeenCalled();
    expect(result.mainSha).toBe(mainSha);
    expect(result.deployments).toHaveLength(1);
  });
});
