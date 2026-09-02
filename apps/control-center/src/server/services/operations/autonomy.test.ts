import { describe, expect, it } from 'vitest';

import type { OperationalSignal } from '../../../shared/types.js';
import { buildRemediationFacts } from './autonomy.js';
import type {
  EvidenceGap,
  SignalInspectionStatus,
} from './inspection/types.js';

const NOW = '2026-09-02T06:30:00.000Z';

function signal(overrides: Partial<OperationalSignal> = {}): OperationalSignal {
  return {
    fingerprint: 'github-actions:workflow/ci.yml',
    source: 'github-actions',
    domain: 'jobs',
    status: 'degraded',
    title: 'CI failed',
    detail: null,
    evidence: {},
    observedAt: NOW,
    url: null,
    ...overrides,
  };
}

function facts(
  input: {
    signal?: OperationalSignal | undefined;
    operationalPriorityScore?: number | null;
    inspectionStatus?: SignalInspectionStatus;
    evidenceGaps?: EvidenceGap[];
  } = {},
) {
  return buildRemediationFacts({
    signal: 'signal' in input ? input.signal : signal(),
    operationalPriorityScore: input.operationalPriorityScore ?? null,
    inspectionStatus: input.inspectionStatus ?? 'ok',
    evidenceGaps: input.evidenceGaps ?? [],
  });
}

describe('buildRemediationFacts', () => {
  it('keeps operational priority separate from remediation safety', () => {
    const result = facts({
      signal: signal({
        fingerprint: 'customer-economics:freshness/priority-portfolios',
        source: 'customer-economics',
        domain: 'customers',
        status: 'critical',
        evidence: { affectedUsers: 3, aumAtRiskUsd: 50_000 },
      }),
      operationalPriorityScore: 100,
      inspectionStatus: 'unsupported',
    });

    expect(result.operationalPriorityScore).toBe(100);
    expect(result.directMutationAllowed).toBe(false);
    expect(result.exposure).toEqual({ affectedUsers: 3, aumAtRiskUsd: 50_000 });
    expect(result.blockers).toContain(
      'AUM is at risk, so remediation stays on a human-controlled rail',
    );
  });

  it('reports a deeply inspected signal with no gaps as unblocked', () => {
    const result = facts({ operationalPriorityScore: 46 });

    expect(result).toMatchObject({
      policyVersion: 'ops-autonomy-v1',
      operationalPriorityScore: 46,
      observer: 'ok',
      inspectionCoverage: 'inspected',
      terminalState: false,
      directMutationAllowed: false,
    });
    expect(result.blockers).toEqual([]);
  });

  it('does not read a missing inspector as clean evidence', () => {
    const result = facts({
      signal: signal({
        fingerprint: 'social-queue:overdue/queue',
        source: 'social-queue',
        domain: 'social',
        status: 'critical',
        evidence: { attemptsExhausted: true },
      }),
      inspectionStatus: 'unsupported',
    });

    expect(result.inspectionCoverage).toBe('no-inspector');
    expect(result.terminalState).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(
      result.reasons.some((reason) =>
        reason.includes('no deep inspector exists'),
      ),
    ).toBe(true);
  });

  it('fails closed while the investigation still has evidence gaps', () => {
    const result = facts({
      signal: signal({ status: 'critical' }),
      operationalPriorityScore: 76,
      evidenceGaps: [{ source: 'sentry', reason: 'request timed out' }],
    });

    expect(result.blockers).toContain('sentry: request timed out');
  });

  it('treats an unavailable provider read as missing evidence', () => {
    const result = facts({ inspectionStatus: 'unavailable' });

    expect(result.inspectionCoverage).toBe('unavailable');
    expect(result.blockers).toContain(
      'deep inspection was unavailable, so provider evidence is missing',
    );
  });

  it('treats a vanished inspection target as unconfirmed', () => {
    const result = facts({ inspectionStatus: 'not-found' });

    expect(result.inspectionCoverage).toBe('not-found');
    expect(result.blockers).toContain(
      'the inspected entity no longer exists, so nothing is confirmed',
    );
  });

  it('treats observer failure as unproven rather than as a repair target', () => {
    const result = facts({
      signal: signal({ fingerprint: 'github-actions:source-failure/adapter' }),
    });

    expect(result.observer).toBe('source-failure');
    expect(result.blockers).toContain(
      'the observer failed, so the state of the observed system is unproven',
    );
  });

  it('never treats unknown operational state as healthy', () => {
    const result = facts({ signal: signal({ status: 'unknown' }) });

    expect(result.observer).toBe('unknown');
    expect(result.blockers).toContain(
      'operational state is unknown, and unknown is never healthy',
    );
  });

  it('blocks a fingerprint that is no longer active', () => {
    const result = facts({ signal: undefined });

    expect(result.observer).toBe('not-active');
    expect(result.exposure).toEqual({
      affectedUsers: null,
      aumAtRiskUsd: null,
    });
    expect(result.blockers).toContain(
      'the fingerprint is not active in the current snapshot',
    );
  });

  it('has nothing to remediate for a healthy signal', () => {
    const result = facts({ signal: signal({ status: 'healthy' }) });

    expect(result.blockers).toContain(
      'the signal is healthy, so there is nothing to remediate',
    );
  });
});
