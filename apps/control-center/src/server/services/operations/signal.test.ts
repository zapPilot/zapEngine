import { describe, expect, it } from 'vitest';

import {
  buildSignal,
  collectOrFail,
  errorMessage,
  fromProviderStatus,
  sourceFailure,
  unknownSignal,
  worstOf,
} from './signal.js';

const NOW = new Date('2026-08-28T12:00:00.000Z');

describe('worstOf', () => {
  it('returns the most severe known reading', () => {
    expect(worstOf(['healthy', 'degraded', 'healthy'])).toBe('degraded');
    expect(worstOf(['degraded', 'critical'])).toBe('critical');
    expect(worstOf(['healthy'])).toBe('healthy');
  });

  it('ignores unknown rather than treating it as a middle value', () => {
    // An unconfigured integration must neither drag a healthy domain down nor
    // lift a critical one up.
    expect(worstOf(['healthy', 'unknown'])).toBe('healthy');
    expect(worstOf(['critical', 'unknown'])).toBe('critical');
  });

  it('stays unknown when nothing reported', () => {
    expect(worstOf([])).toBe('unknown');
    expect(worstOf(['unknown', 'unknown'])).toBe('unknown');
  });
});

describe('fromProviderStatus', () => {
  it('never turns an unasked provider into a green light', () => {
    expect(fromProviderStatus('ok')).toBe('healthy');
    expect(fromProviderStatus('unconfigured')).toBe('unknown');
    expect(fromProviderStatus('error')).toBe('degraded');
  });
});

describe('buildSignal', () => {
  it('assembles a stable fingerprint and defaults the optional fields', () => {
    const signal = buildSignal({
      source: 'fly',
      domain: 'infra',
      kind: 'app',
      key: 'alpha-etl',
      status: 'critical',
      title: 'alpha-etl has no running machine',
      observedAt: NOW,
    });

    expect(signal.fingerprint).toBe('fly:app/alpha-etl');
    expect(signal.detail).toBeNull();
    expect(signal.url).toBeNull();
    expect(signal.evidence).toEqual({});
    expect(signal.observedAt).toBe('2026-08-28T12:00:00.000Z');
  });

  it('keeps evidence, detail and url when supplied', () => {
    const signal = buildSignal({
      source: 'github-actions',
      domain: 'jobs',
      kind: 'workflow',
      key: 'env-drift.yml',
      status: 'degraded',
      title: 'env-drift failed',
      detail: 'last run failed',
      evidence: { failureStreak: 1, lastConclusion: 'failure' },
      observedAt: NOW,
      url: 'https://github.com/zapPilot/zapEngine/actions/runs/1',
    });

    expect(signal.evidence['failureStreak']).toBe(1);
    expect(signal.url).toContain('actions/runs/1');
    expect(signal.detail).toBe('last run failed');
  });
});

describe('unknownSignal', () => {
  it('marks the condition as unconfigured rather than failed', () => {
    const signal = unknownSignal({
      source: 'sentry',
      domain: 'errors',
      key: 'organization',
      title: 'Sentry not connected',
      detail: 'SENTRY_OPS_AUTH_TOKEN is absent',
      observedAt: NOW,
    });

    expect(signal.status).toBe('unknown');
    expect(signal.fingerprint).toBe('sentry:unconfigured/organization');
  });
});

describe('sourceFailure', () => {
  it('degrades on a lost reading instead of escalating', () => {
    const signal = sourceFailure({
      source: 'posthog',
      domain: 'analytics',
      error: new Error('502 Bad Gateway'),
      observedAt: NOW,
    });

    expect(signal.status).toBe('degraded');
    expect(signal.fingerprint).toBe('posthog:source-failure/adapter');
    expect(signal.detail).toBe('502 Bad Gateway');
  });

  it('survives a thrown non-Error', () => {
    const signal = sourceFailure({
      source: 'fly',
      domain: 'infra',
      error: 'flyctl exploded',
      observedAt: NOW,
    });

    expect(signal.detail).toBe('flyctl exploded');
  });
});

describe('errorMessage', () => {
  it('names what it can and refuses to invent the rest', () => {
    expect(errorMessage(new Error('nope'))).toBe('nope');
    expect(errorMessage('nope')).toBe('nope');
    expect(errorMessage({ weird: true })).toBe('Unknown error');
  });
});

describe('collectOrFail', () => {
  const origin = { source: 'fly', domain: 'infra' } as const;

  it('passes a successful collection through untouched', async () => {
    const signals = [
      buildSignal({
        ...origin,
        kind: 'app',
        key: 'alpha-etl',
        status: 'healthy',
        title: 'ok',
        observedAt: NOW,
      }),
    ];

    await expect(collectOrFail(origin, NOW, async () => signals)).resolves.toBe(
      signals,
    );
  });

  it('converts a thrown adapter into one degraded source failure', async () => {
    const result = await collectOrFail(origin, NOW, async () => {
      throw new Error('flyctl exploded');
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      status: 'degraded',
      fingerprint: 'fly:source-failure/adapter',
      detail: 'flyctl exploded',
    });
  });
});
