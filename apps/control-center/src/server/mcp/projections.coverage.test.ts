import { describe, expect, it } from 'vitest';

import type { OperationsResponse } from '../../shared/types.js';
import { projectDomain, projectSignal } from './projections.js';

const jobSignal = {
  fingerprint: 'github-actions:workflow/alpha-etl-daily-refresh.yml',
  source: 'github-actions' as const,
  domain: 'jobs' as const,
  status: 'critical' as const,
  title: 'alpha-etl daily refresh failed',
  detail: 'Two scheduled runs failed.',
  evidence: { failureStreak: 2 },
  observedAt: '2026-08-30T07:00:00.000Z',
  url: 'https://github.com/zapPilot/zapEngine/actions',
};

const costSignal = {
  fingerprint: 'cost-ledger:provider/fly',
  source: 'cost-ledger' as const,
  domain: 'costs' as const,
  status: 'healthy' as const,
  title: 'Fly.io cost collection',
  detail: null,
  evidence: { accruedCostUsd: 12.5 },
  observedAt: '2026-08-30T07:00:00.000Z',
  url: null,
};

const snapshot: OperationsResponse = {
  generatedAt: '2026-08-30T07:00:00.000Z',
  status: 'critical',
  domains: [
    { domain: 'customers', status: 'healthy', signalCount: 0 },
    { domain: 'product', status: 'healthy', signalCount: 0 },
    { domain: 'costs', status: 'healthy', signalCount: 1 },
    { domain: 'social', status: 'healthy', signalCount: 0 },
    { domain: 'jobs', status: 'critical', signalCount: 1 },
    { domain: 'infra', status: 'healthy', signalCount: 0 },
    { domain: 'errors', status: 'healthy', signalCount: 0 },
    { domain: 'analytics', status: 'healthy', signalCount: 0 },
  ],
  priorities: [
    { signal: jobSignal, score: 100, reasons: ['critical job failure'] },
  ],
  signals: [jobSignal, costSignal],
};

describe('Ops MCP projections coverage', () => {
  it('reports an unknown domain that has no summary row', () => {
    const withoutJobs: OperationsResponse = {
      ...snapshot,
      domains: snapshot.domains.filter((entry) => entry.domain !== 'jobs'),
    };
    const result = projectDomain(withoutJobs, 'jobs');

    expect(result.status).toBe('unknown');
    expect(result.domain).toEqual({
      domain: 'jobs',
      status: 'unknown',
      signalCount: 0,
    });
    expect(result.generatedAt).toBe(snapshot.generatedAt);
    expect(result.signals).toEqual([jobSignal]);
    expect(result.priorities).toEqual(snapshot.priorities);
  });

  it('returns a null priority when a signal has no ranked entry', () => {
    const result = projectSignal(snapshot, costSignal.fingerprint);

    expect(result.found).toBe(true);
    expect(result.signal).toEqual(costSignal);
    expect(result.priority).toBeNull();
    expect(result.fingerprint).toBe(costSignal.fingerprint);
  });
});
