import { describe, expect, it, vi } from 'vitest';
import { readControlCenterConfig } from '../../config/env.js';
import { createOperationsGrowth } from './growth.js';

const config = readControlCenterConfig({
  POSTHOG_PERSONAL_API_KEY: 'test-key',
  POSTHOG_PROJECT_ID: '123',
});

function fetchJourney() {
  return vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
    const { query } = JSON.parse(String(init?.body));
    const results =
      query.kind === 'FunnelsQuery'
        ? [
            { order: 0, count: 320 },
            { order: 1, count: 0 },
          ]
        : query.query.includes('argMin(')
          ? [['direct', 320]]
          : [[320, 320, 320, 320, 0, 0, 0, 0, 0, 0, 0]];
    return new Response(JSON.stringify({ results }));
  });
}

describe('lazy growth operations', () => {
  it('performs no unconfigured requests and preserves unknown counts', async () => {
    const fetchImpl = fetchJourney();
    const get = createOperationsGrowth({
      config: readControlCenterConfig({}),
      fetchImpl,
    });
    expect(await get()).toMatchObject({
      status: 'unknown',
      journey: { ctaUsers30d: null },
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('loads only on demand, caches the observation, and refreshes on force', async () => {
    const fetchImpl = fetchJourney();
    const get = createOperationsGrowth({ config, fetchImpl });
    expect(fetchImpl).not.toHaveBeenCalled();
    const first = await get();
    expect(first).toMatchObject({
      status: 'available',
      windowDays: 30,
      journey: { landingVisitors30d: 320, ctaUsers30d: 0 },
    });
    expect(await get()).toBe(first);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    await get(true);
    expect(fetchImpl).toHaveBeenCalledTimes(6);
  });

  it('does not report healthy or invent counts on provider failure', async () => {
    const get = createOperationsGrowth({
      config,
      fetchImpl: vi.fn<typeof fetch>().mockRejectedValue(new Error('offline')),
    });
    expect(await get()).toMatchObject({
      status: 'unknown',
      journey: { landingVisitors30d: null },
    });
  });
});
