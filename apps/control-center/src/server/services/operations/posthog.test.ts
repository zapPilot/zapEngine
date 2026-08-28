import { describe, expect, it } from 'vitest';

import { readControlCenterConfig } from '../../config/env.js';
import { expectUnconfigured, fetchReturning } from './adapter-testing.js';
import { collectPosthogSignals } from './posthog.js';

const NOW = new Date('2026-08-28T09:00:00.000Z');

const CONFIG = readControlCenterConfig({
  POSTHOG_PERSONAL_API_KEY: 'phx-key',
  POSTHOG_PROJECT_ID: '4242',
});

const QUERY_URL = 'https://us.i.posthog.com/api/projects/4242/query/';

function collect(fetchImpl: typeof fetch) {
  return collectPosthogSignals({ config: CONFIG, now: NOW, fetchImpl });
}

describe('collectPosthogSignals', () => {
  it.each([
    ['the personal API key is absent', { POSTHOG_PROJECT_ID: '4242' }],
    ['the project id is absent', { POSTHOG_PERSONAL_API_KEY: 'phx-key' }],
  ])('reports unknown without a request when %s', async (_case, env) =>
    expectUnconfigured({
      env,
      fingerprint: 'posthog:unconfigured/credentials',
      collect: (config, fetchImpl) =>
        collectPosthogSignals({ config, now: NOW, fetchImpl }),
    }),
  );

  it('reports one healthy audience signal from the HogQL row', async () => {
    const fetchImpl = fetchReturning({ results: [[318, 1204]] });

    const signals = await collect(fetchImpl);

    const init = fetchImpl.mock.calls[0]?.[1];
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(QUERY_URL);
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({
      Authorization: 'Bearer phx-key',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(String(init?.body))).toMatchObject({
      query: { kind: 'HogQLQuery' },
    });
    expect(signals).toEqual([
      expect.objectContaining({
        fingerprint: 'posthog:audience/project',
        source: 'posthog',
        domain: 'analytics',
        status: 'healthy',
        evidence: { uniqueUsers7d: 318, uniqueUsers30d: 1204 },
        observedAt: NOW.toISOString(),
        url: 'https://us.posthog.com/project/4242',
      }),
    ]);
  });

  it('coerces HogQL numerics that arrive as strings', async () => {
    const signals = await collect(
      fetchReturning({ results: [['318', '1204']] }),
    );

    expect(signals[0]?.evidence).toEqual({
      uniqueUsers7d: 318,
      uniqueUsers30d: 1204,
    });
  });

  it.each([
    ['a non-2xx response', { detail: 'unauthorized' }, 401],
    ['an unrecognised body', { detail: 'nope' }, 200],
    ['an empty result set', { results: [] }, 200],
    ['a row with unusable columns', { results: [['a', 'b']] }, 200],
  ])('degrades but never escalates on %s', async (_case, body, status) => {
    const signals = await collect(fetchReturning(body, status));

    expect(signals).toHaveLength(1);
    expect(signals[0]?.fingerprint).toBe('posthog:source-failure/adapter');
    expect(signals[0]?.status).toBe('degraded');
  });
});
