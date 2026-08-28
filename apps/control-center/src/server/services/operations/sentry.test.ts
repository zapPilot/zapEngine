import { describe, expect, it, vi } from 'vitest';

import { readControlCenterConfig } from '../../config/env.js';
import { collectSentrySignals } from './sentry.js';

const NOW = new Date('2026-08-28T09:00:00.000Z');

const CONFIG = readControlCenterConfig({
  SENTRY_OPS_AUTH_TOKEN: 'sentry-token',
  SENTRY_ORG_SLUG: 'zap-pilot',
});

const ISSUES_URL =
  'https://sentry.io/api/0/organizations/zap-pilot/issues/' +
  '?query=is%3Aunresolved&statsPeriod=24h&limit=25';

function fetchReturning(body: unknown, status = 200) {
  return vi.fn<typeof fetch>(
    async () => new Response(JSON.stringify(body), { status }),
  );
}

function issue(overrides: Record<string, unknown> = {}) {
  return {
    title: 'TypeError',
    culprit: 'app/routes/portfolio',
    permalink: 'https://sentry.io/issues/1/',
    count: '4',
    project: { slug: 'account-engine' },
    ...overrides,
  };
}

describe('collectSentrySignals', () => {
  it.each([
    ['the auth token is absent', { SENTRY_ORG_SLUG: 'zap-pilot' }],
    ['the org slug is absent', { SENTRY_OPS_AUTH_TOKEN: 'sentry-token' }],
  ])('reports unknown without a request when %s', async (_case, env) => {
    const fetchImpl = vi.fn<typeof fetch>();

    const signals = await collectSentrySignals({
      config: readControlCenterConfig(env),
      now: NOW,
      fetchImpl,
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(signals).toHaveLength(1);
    expect(signals[0]?.status).toBe('unknown');
    expect(signals[0]?.fingerprint).toBe('sentry:unconfigured/credentials');
  });

  it('groups unresolved issues per project and grades each one', async () => {
    const fetchImpl = fetchReturning([
      issue({ count: '120' }),
      issue({ count: '40', permalink: 'https://sentry.io/issues/2/' }),
      issue({ count: '8' }),
      issue({ count: '8' }),
      issue({ count: '4' }),
      issue({
        title: 'FetchError',
        culprit: '   ',
        permalink: null,
        count: '3',
        project: { slug: 'podcast-pipeline' },
      }),
    ]);

    const signals = await collectSentrySignals({
      config: CONFIG,
      now: NOW,
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      ISSUES_URL,
      expect.objectContaining({
        headers: { Authorization: 'Bearer sentry-token' },
      }),
    );
    expect(signals.map((signal) => signal.fingerprint)).toEqual([
      'sentry:issues/account-engine',
      'sentry:issues/podcast-pipeline',
    ]);
    expect(signals[0]).toMatchObject({
      source: 'sentry',
      domain: 'errors',
      status: 'critical',
      title: '5 unresolved issues in account-engine',
      evidence: {
        issueCount: 5,
        eventCount: 180,
        topIssue: 'app/routes/portfolio',
      },
      observedAt: NOW.toISOString(),
      url: 'https://sentry.io/issues/1/',
    });
    expect(signals[1]).toMatchObject({
      status: 'degraded',
      title: '1 unresolved issue in podcast-pipeline',
      evidence: { issueCount: 1, eventCount: 3, topIssue: 'FetchError' },
      url: null,
    });
  });

  it('coerces the decimal string Sentry sends as the event count', async () => {
    const fetchImpl = fetchReturning([
      issue({ count: '7' }),
      issue({ count: '13' }),
    ]);

    const signals = await collectSentrySignals({
      config: CONFIG,
      now: NOW,
      fetchImpl,
    });

    expect(signals[0]?.evidence['eventCount']).toBe(20);
  });

  it('drops an unrecognised issue row and keeps the rest', async () => {
    const fetchImpl = fetchReturning([issue(), { unexpected: true }]);

    const signals = await collectSentrySignals({
      config: CONFIG,
      now: NOW,
      fetchImpl,
    });

    expect(signals).toHaveLength(1);
    expect(signals[0]?.evidence['issueCount']).toBe(1);
  });

  it('emits one healthy signal when nothing is unresolved', async () => {
    const signals = await collectSentrySignals({
      config: CONFIG,
      now: NOW,
      fetchImpl: fetchReturning([]),
    });

    expect(signals).toEqual([
      expect.objectContaining({
        fingerprint: 'sentry:issues/organization',
        status: 'healthy',
        evidence: { issueCount: 0 },
      }),
    ]);
  });

  it('degrades to a source failure on a non-2xx response', async () => {
    const signals = await collectSentrySignals({
      config: CONFIG,
      now: NOW,
      fetchImpl: fetchReturning({ detail: 'forbidden' }, 403),
    });

    expect(signals).toHaveLength(1);
    expect(signals[0]?.fingerprint).toBe('sentry:source-failure/adapter');
    expect(signals[0]?.status).toBe('degraded');
    expect(signals[0]?.detail).toContain('403');
  });

  it('degrades to a source failure when the body is not a list', async () => {
    const signals = await collectSentrySignals({
      config: CONFIG,
      now: NOW,
      fetchImpl: fetchReturning({ detail: 'not a list' }),
    });

    expect(signals[0]?.fingerprint).toBe('sentry:source-failure/adapter');
  });

  it('never reports healthy when every row failed to parse', async () => {
    const signals = await collectSentrySignals({
      config: CONFIG,
      now: NOW,
      fetchImpl: fetchReturning([{ unexpected: true }]),
    });

    expect(signals[0]?.fingerprint).toBe('sentry:source-failure/adapter');
    expect(signals[0]?.detail).toContain('unknown shape');
  });
});
