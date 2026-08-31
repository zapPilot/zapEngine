import { describe, expect, it, vi } from 'vitest';

import {
  OPERATIONS_DOMAINS,
  type CustomerEconomicsResponse,
  type OperationalSignal,
  type OperationsResponse,
  type OperationsSocialResponse,
} from '../../../shared/types.js';
import type { SignalInspection } from './inspection/types.js';
import { investigateOperationalSignal } from './investigation.js';

const PRIMARY: OperationalSignal = {
  fingerprint: 'github-actions:workflow/alpha-etl-daily-refresh.yml',
  source: 'github-actions',
  domain: 'jobs',
  status: 'critical',
  title: 'alpha-etl daily refresh failed',
  detail: 'Refresh step failed.',
  evidence: { failureStreak: 2 },
  observedAt: '2026-08-30T10:02:00.000Z',
  url: null,
};

const PRODUCT: OperationalSignal = {
  fingerprint: 'product-health:portfolio-freshness/priority-coverage',
  source: 'product-health',
  domain: 'product',
  status: 'critical',
  title: 'Priority wallet refresh has stalled',
  detail: '5 of 23 priority wallets refreshed.',
  evidence: {
    expectedWallets: 23,
    freshWallets: 5,
    staleWallets: 18,
    coverageRatio: 0.217,
  },
  observedAt: '2026-08-30T10:05:00.000Z',
  url: null,
};

const CUSTOMER: OperationalSignal = {
  fingerprint: 'customer-economics:freshness/priority-portfolios',
  source: 'customer-economics',
  domain: 'customers',
  status: 'critical',
  title: '2 priority portfolios are stale',
  detail: null,
  evidence: { affectedUsers: 2, aumAtRiskUsd: 12_500 },
  observedAt: '2026-08-30T10:06:00.000Z',
  url: null,
};

function snapshot(signals: OperationalSignal[]): OperationsResponse {
  return {
    generatedAt: '2026-08-30T10:06:00.000Z',
    status: 'critical',
    domains: OPERATIONS_DOMAINS.map((domain) => ({
      domain,
      status: signals.some(
        (signal) => signal.domain === domain && signal.status === 'critical',
      )
        ? 'critical'
        : 'healthy',
      signalCount: signals.filter((signal) => signal.domain === domain).length,
    })),
    priorities: [{ signal: signals[0]!, score: 100, reasons: ['critical'] }],
    signals,
  };
}

function inspection(
  fingerprint: string,
  source: SignalInspection['source'],
  evidence: Record<string, unknown> = {},
): SignalInspection {
  return {
    fingerprint,
    source,
    status: 'ok',
    inspectedAt: '2026-08-30T10:07:00.000Z',
    summary: `${fingerprint} inspected`,
    entities: [],
    evidence,
    gaps: [],
  };
}

const CUSTOMERS: CustomerEconomicsResponse = {
  generatedAt: '2026-08-30T10:06:00.000Z',
  status: 'ok',
  message: null,
  summary: {
    totalCustomers: 8,
    priorityUsers: 3,
    standardUsers: 5,
    pausedUsers: 0,
    activeLast7d: 5,
    inactiveButPriority: 0,
    aumUsd: 20_000,
    attributedCostUsd30d: null,
    revenueUsd: null,
  },
  users: [],
};

const SOCIAL: OperationsSocialResponse = {
  generatedAt: '2026-08-30T10:06:00.000Z',
  // jscpd:ignore-start -- test fixture mirrors social unknownDaemon shape, intentional duplication
  daemon: {
    status: 'healthy',
    owner: 'local-mac',
    daemonVersion: null,
    firstStartedAt: null,
    lastTickStartedAt: null,
    lastTickCompletedAt: null,
    lastSuccessAt: null,
    lastError: null,
    staleMinutes: null,
  },
  // jscpd:ignore-end
  jobs: [],
  waitingMediaLanes: 0,
  invalidJobRows: 0,
  message: null,
};

describe('investigateOperationalSignal', () => {
  it('correlates a cron failure with Fly and customer impact while preserving a Sentry evidence gap', async () => {
    const inspect = vi.fn(
      async (fingerprint: string): Promise<SignalInspection> => {
        if (fingerprint.startsWith('github-actions:')) {
          return inspection(fingerprint, 'github-actions', {
            selectedRun: {
              id: 100,
              startedAt: '2026-08-30T10:00:00.000Z',
              completedAt: '2026-08-30T10:02:00.000Z',
              conclusion: 'failure',
            },
            failedJobs: [
              {
                id: 101,
                name: 'refresh',
                startedAt: '2026-08-30T10:00:30.000Z',
                completedAt: '2026-08-30T10:02:00.000Z',
                conclusion: 'failure',
              },
            ],
          });
        }
        if (fingerprint.startsWith('sentry:')) {
          return {
            ...inspection(fingerprint, 'sentry'),
            status: 'unavailable',
            summary: 'Sentry timed out',
            gaps: [{ source: 'sentry', reason: 'request timed out' }],
          };
        }
        return inspection(fingerprint, 'fly', {
          machines: [
            {
              id: 'etl-1',
              state: 'stopped',
              createdAt: '2026-08-30T09:00:00.000Z',
              updatedAt: '2026-08-30T10:04:00.000Z',
              recentEvents: [
                {
                  type: 'stop',
                  status: 'stopped',
                  at: '2026-08-30T10:04:00.000Z',
                },
              ],
            },
          ],
        });
      },
    );

    const result = await investigateOperationalSignal({
      fingerprint: PRIMARY.fingerprint,
      snapshot: snapshot([PRIMARY, PRODUCT, CUSTOMER]),
      inspect,
      loadCustomers: async () => CUSTOMERS,
      loadSocial: async () => SOCIAL,
    });

    expect(result.incident).toMatchObject({
      fingerprint: PRIMARY.fingerprint,
      status: 'critical',
    });
    expect(result.entities).toContainEqual({
      type: 'workspace',
      id: '@zapengine/alpha-etl',
    });
    expect(result.relatedEvidence.fly?.status).toBe('ok');
    expect(result.relatedEvidence.sentry?.status).toBe('unavailable');
    expect(result.evidenceGaps).toContainEqual({
      source: 'sentry',
      reason: 'request timed out',
    });
    expect(result.customerImpact).toEqual({
      affectedCustomers: 2,
      priorityCustomers: 3,
      aumUsd: 12_500,
    });
    expect(result.timeline.map((event) => event.at)).toEqual(
      [...result.timeline.map((event) => event.at)].sort(),
    );
    expect(result.timeline.some((event) => event.type === 'machine-stop')).toBe(
      true,
    );
  });

  it('routes a social media incident to bounded render evidence', async () => {
    const socialSignal: OperationalSignal = {
      fingerprint: 'social-queue:waiting-media/podcast',
      source: 'social-queue',
      domain: 'social',
      status: 'critical',
      title: 'Media lanes are waiting',
      detail: null,
      evidence: { waitingMediaLanes: 4 },
      observedAt: '2026-08-30T11:00:00.000Z',
      url: null,
    };
    const inspect = vi.fn(async (fingerprint: string) => {
      const source = fingerprint.startsWith('github-actions:')
        ? 'github-actions'
        : fingerprint.startsWith('sentry:')
          ? 'sentry'
          : fingerprint.startsWith('fly:')
            ? 'fly'
            : null;
      return inspection(fingerprint, source);
    });
    const social: OperationsSocialResponse = {
      ...SOCIAL,
      waitingMediaLanes: 4,
      jobs: [
        {
          episodeId: 'ep-1',
          platform: 'youtube',
          languageCode: 'en',
          status: 'queued',
          scheduledAt: '2026-08-30T09:00:00.000Z',
          nextAttemptAt: '2026-08-30T09:00:00.000Z',
          attemptCount: 3,
          overdueMinutes: 120,
          attemptsExhausted: true,
        },
      ],
    };

    const result = await investigateOperationalSignal({
      fingerprint: socialSignal.fingerprint,
      snapshot: snapshot([socialSignal]),
      inspect,
      loadCustomers: async () => CUSTOMERS,
      loadSocial: async () => social,
    });

    expect(inspect).toHaveBeenCalledWith(
      'fly:process-group/from-fed-to-chain-api/render',
    );
    expect(result.relatedEvidence.social).toEqual({
      daemonStatus: 'healthy',
      waitingMediaLanes: 4,
      overdueJobs: 1,
      exhaustedJobs: 1,
    });
    expect(result.customerImpact).toEqual({
      affectedCustomers: null,
      priorityCustomers: null,
      aumUsd: null,
    });
  });
});
