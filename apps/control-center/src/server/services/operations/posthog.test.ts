import { describe, expect, it, vi } from 'vitest';

import { readControlCenterConfig } from '../../config/env.js';
import { expectUnconfigured } from './adapter-testing.js';
import { collectPosthogSignals } from './posthog.js';

const NOW = new Date('2026-08-28T09:00:00.000Z');

const CONFIG = readControlCenterConfig({
  POSTHOG_PERSONAL_API_KEY: 'phx-key',
  POSTHOG_PROJECT_ID: '4242',
});

const QUERY_URL = 'https://us.i.posthog.com/api/projects/4242/query/';
const ROW = [318, 1204, 90, 300, 4, 12, 20, 55, 8, 21, 6];
const SOURCE_ROWS = [
  ['threads', 210],
  ['x', 40],
  ['youtube', 15],
  ['rednote', 5],
  ['direct', 20],
  ['other', 10],
];
const EVIDENCE = {
  uniqueUsers7d: 318,
  uniqueUsers30d: 1204,
  landingVisitors7d: 90,
  landingVisitors30d: 300,
  ctaUsers7d: 4,
  ctaUsers30d: 12,
  appVisitors7d: 20,
  appVisitors30d: 55,
  walletConnectedUsers7d: 8,
  walletConnectedUsers30d: 21,
  landingDeadClickUsers7d: 6,
  landingThreads30d: 210,
  landingX30d: 40,
  landingYoutube30d: 15,
  landingRednote30d: 5,
  landingDirect30d: 20,
  landingOther30d: 10,
  landingSocialAttributed30d: 270,
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function fetchPosthog(
  audience: unknown = { results: [ROW] },
  sources: unknown = { results: SOURCE_ROWS },
) {
  return vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(response(audience))
    .mockResolvedValueOnce(response(sources));
}

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

  it('reports audience plus mutually exclusive first-touch acquisition evidence', async () => {
    const fetchImpl = fetchPosthog();

    const signals = await collect(fetchImpl);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    for (const call of fetchImpl.mock.calls) {
      expect(call[0]).toBe(QUERY_URL);
      expect(call[1]?.method).toBe('POST');
      expect(call[1]?.headers).toEqual({
        Authorization: 'Bearer phx-key',
        'Content-Type': 'application/json',
      });
    }
    const bodies = fetchImpl.mock.calls.map((call) =>
      JSON.parse(String(call[1]?.body)),
    );
    const audienceQuery = bodies[0]?.query?.query as string;
    const sourceQuery = bodies[1]?.query?.query as string;
    expect(audienceQuery).not.toContain("event = 'cta_clicked'");
    expect(audienceQuery).not.toContain('waitlist_submitted');
    expect(audienceQuery).toContain(
      "event = 'waitlist_cta_clicked' AND properties.surface = 'landing'",
    );
    expect(audienceQuery).toContain("event = 'wallet_connected'");
    expect(sourceQuery).toContain('argMin(');
    expect(sourceQuery).toContain("extractURLParameter(properties.$current_url, 'utm_source')");
    expect(sourceQuery).toContain("properties.$referring_domain = 'l.threads.com'");
    expect(signals).toEqual([
      expect.objectContaining({
        fingerprint: 'posthog:audience/project',
        source: 'posthog',
        domain: 'analytics',
        status: 'healthy',
        evidence: EVIDENCE,
        observedAt: NOW.toISOString(),
        url: 'https://us.posthog.com/project/4242',
      }),
    ]);
  });

  it('coerces HogQL numerics that arrive as strings', async () => {
    const signals = await collect(
      fetchPosthog(
        { results: [ROW.map((value) => String(value))] },
        {
          results: SOURCE_ROWS.map(([source, value]) => [source, String(value)]),
        },
      ),
    );

    expect(signals[0]?.evidence).toEqual(EVIDENCE);
  });

  it('fills absent source buckets with zero without inventing visitors', async () => {
    const signals = await collect(
      fetchPosthog(undefined, { results: [['threads', 300]] }),
    );

    expect(signals[0]?.evidence).toMatchObject({
      landingThreads30d: 300,
      landingX30d: 0,
      landingYoutube30d: 0,
      landingRednote30d: 0,
      landingDirect30d: 0,
      landingOther30d: 0,
      landingSocialAttributed30d: 300,
    });
  });

  it.each([
    ['an unrecognised audience body', { detail: 'nope' }, { results: SOURCE_ROWS }],
    ['an empty audience result set', { results: [] }, { results: SOURCE_ROWS }],
    ['an unusable audience row', { results: [['a', 'b']] }, { results: SOURCE_ROWS }],
    ['an unusable source row', { results: [ROW] }, { results: [['threads', -1]] }],
  ])('degrades but never escalates on %s', async (_case, audience, sources) => {
    const signals = await collect(fetchPosthog(audience, sources));

    expect(signals).toHaveLength(1);
    expect(signals[0]?.fingerprint).toBe('posthog:source-failure/adapter');
    expect(signals[0]?.status).toBe('degraded');
  });

  it.each([null, '', -1, 1.2, true])(
    'rejects invalid audience aggregate %s rather than reporting zero',
    async (invalid) => {
      const row: unknown[] = [...ROW];
      row[2] = invalid;
      expect(
        (
          await collect(
            fetchPosthog({ results: [row] }, { results: SOURCE_ROWS }),
          )
        )[0]?.status,
      ).toBe('degraded');
    },
  );
});
