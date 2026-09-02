import { describe, expect, it } from 'vitest';

import type { OperationalSignal } from '../../../shared/types.js';
import { assessRemediationSuitability } from './autonomy.js';

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

describe('assessRemediationSuitability', () => {
  it('keeps operational priority separate from autonomy for financial incidents', () => {
    const result = assessRemediationSuitability({
      signal: signal({
        fingerprint: 'customer-economics:freshness/priority-portfolios',
        source: 'customer-economics',
        domain: 'customers',
        status: 'critical',
        evidence: { affectedUsers: 3, aumAtRiskUsd: 50_000 },
      }),
      operationalPriorityScore: 100,
    });

    expect(result.operationalPriorityScore).toBe(100);
    expect(result.suitabilityScore).toBeLessThanOrEqual(15);
    expect(result.autonomy).toBe('approval-required');
    expect(result.risk).toBe('high');
    expect(result.directMutationAllowed).toBe(false);
    expect(result.blockers).toContain(
      'AUM-at-risk incidents cannot be autonomously mutated',
    );
  });

  it('allows bounded job fixes to reach auto-PR but never direct mutation', () => {
    const result = assessRemediationSuitability({
      signal: signal(),
      operationalPriorityScore: 46,
    });

    expect(result).toMatchObject({
      operationalPriorityScore: 46,
      suitabilityScore: 80,
      autonomy: 'auto-pr',
      risk: 'low',
      evidenceReady: true,
      directMutationAllowed: false,
    });
    expect(result.blockers).toEqual([]);
  });

  it('fails closed when investigation still has evidence gaps', () => {
    const result = assessRemediationSuitability({
      signal: signal({ status: 'critical' }),
      operationalPriorityScore: 76,
      evidenceGaps: [{ source: 'sentry', reason: 'request timed out' }],
    });

    expect(result.autonomy).toBe('observe');
    expect(result.evidenceReady).toBe(false);
    expect(result.suitabilityScore).toBeLessThanOrEqual(10);
    expect(result.blockers).toContain('sentry: request timed out');
  });

  it('treats observer failure as missing evidence rather than a repair target', () => {
    const result = assessRemediationSuitability({
      signal: signal({
        fingerprint: 'github-actions:source-failure/adapter',
        status: 'degraded',
      }),
    });

    expect(result).toMatchObject({
      suitabilityScore: 0,
      autonomy: 'observe',
      evidenceReady: false,
      directMutationAllowed: false,
    });
    expect(result.blockers).toEqual(['provider evidence is unavailable']);
  });

  it('keeps infrastructure mutations approval-gated even with complete evidence', () => {
    const result = assessRemediationSuitability({
      signal: signal({
        fingerprint: 'fly:machine/account-engine',
        source: 'fly',
        domain: 'infra',
        status: 'degraded',
      }),
    });

    expect(result.autonomy).toBe('approval-required');
    expect(result.risk).toBe('high');
    expect(result.blockers).toContain(
      'runtime or infrastructure mutation requires human approval',
    );
  });
});
