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

describe('Ops MCP projections', () => {
  it('keeps a domain bounded to its own signals and priorities', () => {
    const result = projectDomain(snapshot, 'jobs');

    expect(result.status).toBe('critical');
    expect(result.signals).toEqual([jobSignal]);
    expect(result.priorities).toEqual(snapshot.priorities);
  });

  it('returns a stable not-found result when an incident has cleared', () => {
    expect(projectSignal(snapshot, 'sentry:issue/cleared')).toEqual({
      generatedAt: snapshot.generatedAt,
      found: false,
      fingerprint: 'sentry:issue/cleared',
      signal: null,
      priority: null,
    });
  });

  it('includes the ranked priority when a signal is still active', () => {
    const result = projectSignal(snapshot, jobSignal.fingerprint);

    expect(result.found).toBe(true);
    expect(result.signal).toEqual(jobSignal);
    expect(result.priority).toEqual(snapshot.priorities[0]);
  });
});
