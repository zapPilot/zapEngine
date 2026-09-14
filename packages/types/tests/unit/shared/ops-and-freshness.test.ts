import { describe, expect, it } from 'vitest';

import { MarketDataFreshnessSchema } from '../../../src/shared/market-freshness.js';
import {
  opsAuditSchema,
  opsCorrelationSchema,
  opsLifecycleSchema,
  opsRuntimeRecordSchema,
  opsVerificationSchema,
} from '../../../src/shared/ops.js';

const UUID = '123e4567-e89b-42d3-a456-426614174000';
const SHA = 'a'.repeat(40);
const TIMESTAMP = '2026-09-14T01:00:00.000Z';

describe('market freshness contract', () => {
  const valid = {
    requested_date: '2026-09-14',
    effective_date: '2026-09-12',
    missing_dates: ['2026-09-13'],
    stale_features: [
      {
        feature_name: 'volatility_30d',
        asset: 'BTC',
        requested_date: '2026-09-14',
        effective_date: '2026-09-12',
        lag_days: 2,
      },
    ],
    max_lag_days: 2,
    is_stale: true,
  };

  it('accepts zero lag and empty diagnostic lists', () => {
    expect(
      MarketDataFreshnessSchema.parse({
        ...valid,
        missing_dates: [],
        stale_features: [],
        max_lag_days: 0,
        is_stale: false,
      }),
    ).toMatchObject({ max_lag_days: 0, is_stale: false });
  });

  it('rejects negative, fractional, and wrongly typed lag data', () => {
    expect(
      MarketDataFreshnessSchema.safeParse({ ...valid, max_lag_days: -1 })
        .success,
    ).toBe(false);
    expect(
      MarketDataFreshnessSchema.safeParse({
        ...valid,
        stale_features: [{ ...valid.stale_features[0], lag_days: 0.5 }],
      }).success,
    ).toBe(false);
    expect(
      MarketDataFreshnessSchema.safeParse({
        ...valid,
        stale_features: [{ ...valid.stale_features[0], asset: 1 }],
      }).success,
    ).toBe(false);
  });
});

describe('ops correlation identifiers', () => {
  it('accepts empty correlation and every supported identifier', () => {
    expect(opsCorrelationSchema.parse({})).toEqual({});
    expect(
      opsCorrelationSchema.parse({
        episodeId: UUID,
        localizationId: UUID,
        renderJobId: UUID,
        publishJobId: UUID,
        deploymentId: 'deploy:production/v1.2_3',
        gitSha: SHA,
        flyMachineId: 'machine-1',
        sentryEventId: 'event/1',
        sentryIssueId: '00123',
        contentId: 'content.id',
        analyticsId: UUID,
        waitlistId: UUID,
      }),
    ).toMatchObject({ gitSha: SHA, sentryIssueId: '00123' });
  });

  it('accepts the 160-character opaque-id boundary', () => {
    expect(
      opsCorrelationSchema.parse({ deploymentId: 'a'.repeat(160) })
        .deploymentId,
    ).toHaveLength(160);
  });

  it.each(['', 'a'.repeat(161), 'contains space', 'contains#hash'])(
    'rejects invalid opaque identifier %s',
    (deploymentId) =>
      expect(opsCorrelationSchema.safeParse({ deploymentId }).success).toBe(
        false,
      ),
  );

  it.each(['a'.repeat(39), 'a'.repeat(41), 'A'.repeat(40), 'g'.repeat(40)])(
    'rejects malformed git SHA %s',
    (gitSha) =>
      expect(opsCorrelationSchema.safeParse({ gitSha }).success).toBe(false),
  );

  it('rejects non-UUID correlations and non-decimal issue ids', () => {
    expect(
      opsCorrelationSchema.safeParse({ episodeId: 'episode-1' }).success,
    ).toBe(false);
    expect(
      opsCorrelationSchema.safeParse({ sentryIssueId: '12a' }).success,
    ).toBe(false);
  });
});

describe('ops runtime and lifecycle contracts', () => {
  it.each([
    'render',
    'social',
    'sentry',
    'fly',
    'deploy',
    'posthog',
    'waitlist',
  ] as const)('accepts runtime source %s', (source) => {
    expect(
      opsRuntimeRecordSchema.parse({
        source,
        service: 'worker',
        recordId: 'record/1',
        observedAt: TIMESTAMP,
        correlation: {},
      }).source,
    ).toBe(source);
  });

  it('accepts offsets and rejects missing offsets or malformed records', () => {
    const valid = {
      source: 'deploy',
      service: 'api',
      recordId: 'record-1',
      observedAt: '2026-09-14T10:00:00+09:00',
      correlation: {},
    };
    expect(opsRuntimeRecordSchema.parse(valid).observedAt).toContain('+09:00');
    expect(
      opsRuntimeRecordSchema.safeParse({
        ...valid,
        observedAt: '2026-09-14T10:00:00',
      }).success,
    ).toBe(false);
    expect(
      opsRuntimeRecordSchema.safeParse({ ...valid, source: 'other' }).success,
    ).toBe(false);
    expect(
      opsRuntimeRecordSchema.safeParse({ ...valid, service: '' }).success,
    ).toBe(false);
    expect(
      opsRuntimeRecordSchema.safeParse({ ...valid, recordId: 'bad id' })
        .success,
    ).toBe(false);
  });

  it('enumerates every lifecycle state and rejects unknown states', () => {
    for (const state of [
      'diagnosed',
      'fixed_pending_deploy',
      'deployed_observing',
      'verified',
      'failed',
      'blocked',
      'needs_human',
    ]) {
      expect(opsLifecycleSchema.parse(state)).toBe(state);
    }
    expect(opsLifecycleSchema.safeParse('pending').success).toBe(false);
  });
});

describe('ops verification and audit boundaries', () => {
  const verification = {
    policyVersion: 'ops-verification-v1' as const,
    rootCause: 'Expired credential',
    fixSha: SHA,
    prNumber: null,
    deploymentId: 'deploy-1',
    deployedSha: SHA,
    release: 'release/v1',
    target: 'production',
    activeAt: TIMESTAMP,
    observedUntil: '2026-09-14T01:05:00.000Z',
    minimumObservationSeconds: 1,
    signals: [
      {
        kind: 'runtime' as const,
        target: 'api',
        from: TIMESTAMP,
        until: '2026-09-14T01:05:00.000Z',
        deployedSha: SHA,
        status: 'recovered' as const,
        evidenceId: 'evidence/1',
      },
    ],
  };

  it('accepts PR-number and all signal enum boundaries', () => {
    expect(opsVerificationSchema.parse(verification).prNumber).toBeNull();
    expect(
      opsVerificationSchema.parse({ ...verification, prNumber: 1 }).prNumber,
    ).toBe(1);
    for (const kind of ['sentry', 'queue', 'runtime', 'freshness'] as const) {
      for (const status of ['recovered', 'failed', 'unavailable'] as const) {
        expect(
          opsVerificationSchema.parse({
            ...verification,
            signals: [{ ...verification.signals[0], kind, status }],
          }).signals[0],
        ).toMatchObject({ kind, status });
      }
    }
  });

  it('rejects empty evidence, zero observation, and invalid PR numbers', () => {
    expect(
      opsVerificationSchema.safeParse({ ...verification, signals: [] }).success,
    ).toBe(false);
    expect(
      opsVerificationSchema.safeParse({
        ...verification,
        minimumObservationSeconds: 0,
      }).success,
    ).toBe(false);
    for (const prNumber of [0, -1, 1.5]) {
      expect(
        opsVerificationSchema.safeParse({ ...verification, prNumber }).success,
      ).toBe(false);
    }
  });

  it('accepts optional audit fields absent, populated, and null', () => {
    const base = {
      id: UUID,
      fingerprint: 'fingerprint',
      state: 'diagnosed',
      actor: 'operator',
      updated_at: TIMESTAMP,
      correlation: {},
      evidence: { source: 'runtime' },
      decision: 'deploy fix',
    };
    expect(opsAuditSchema.parse(base)).not.toHaveProperty('actions');
    expect(
      opsAuditSchema.parse({
        ...base,
        actions: [{ type: 'restart' }],
        verification: { policyVersion: 'external' },
      }),
    ).toMatchObject({ actions: [{ type: 'restart' }] });
    expect(
      opsAuditSchema.parse({ ...base, verification: null }).verification,
    ).toBeNull();
  });
});
