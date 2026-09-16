import { afterEach, describe, expect, it, vi } from 'vitest';

import { readControlCenterConfig } from '../../config/env.js';
import { collectSentrySignals } from './sentry.js';

const NOW = new Date('2026-08-28T09:00:00.000Z');
const CONFIG = readControlCenterConfig({
  SENTRY_OPS_AUTH_TOKEN: 'sentry-token',
  SENTRY_ORG_SLUG: 'zap-pilot',
});

function issue(overrides: Record<string, unknown> = {}) {
  return {
    id: '1',
    lastSeen: '2026-08-26T09:00:00Z',
    userCount: 0,
    title: 'TypeError',
    culprit: 'app/routes',
    permalink: 'https://sentry.io/issues/1/',
    count: '4',
    project: { slug: 'account-engine' },
    ...overrides,
  };
}

function router(active: unknown[], recent: unknown[]) {
  return (async (url: string | URL | Request) =>
    String(url).includes('statsPeriod=30d')
      ? new Response(JSON.stringify(recent), { status: 200 })
      : new Response(JSON.stringify(active), {
          status: 200,
        })) as unknown as typeof fetch;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('sentry coverage', () => {
  it('falls back to the global fetch when no fetch impl is injected', async () => {
    const fetchImpl = vi.fn(async () => Response.json([]));
    vi.stubGlobal('fetch', fetchImpl);

    const signals = await collectSentrySignals({ config: CONFIG, now: NOW });

    expect(fetchImpl).toHaveBeenCalled();
    expect(signals[0]?.fingerprint).toBe('sentry:issues/organization');
  });

  it('picks the later issue as loudest when its count is higher', async () => {
    const signals = await collectSentrySignals({
      config: CONFIG,
      now: NOW,
      fetchImpl: router(
        [issue({ id: '1', count: '2' }), issue({ id: '2', count: '9' })],
        [],
      ),
    });

    const target = signals.find(
      (signal) => signal.fingerprint === 'sentry:issues/account-engine',
    );
    expect(target?.evidence['topIssue']).toBe('app/routes');
    expect(target?.evidence['eventCount']).toBe(11);
  });

  it('selects the later stale issue as loudest and tolerates a missing permalink', async () => {
    const signals = await collectSentrySignals({
      config: CONFIG,
      now: NOW,
      fetchImpl: router(
        [],
        [
          issue({ id: '10', count: '1', permalink: null }),
          issue({ id: '11', count: '7', permalink: null }),
        ],
      ),
    });

    const stale = signals.find(
      (signal) =>
        signal.fingerprint === 'sentry:stale-unresolved/account-engine',
    );
    expect(stale?.status).toBe('degraded');
    expect(stale?.url).toBeNull();
    expect(stale?.evidence['oldestLastSeen']).toBe('2026-08-26T09:00:00Z');
    expect(stale?.evidence['newestLastSeen']).toBe('2026-08-26T09:00:00Z');
  });
});
