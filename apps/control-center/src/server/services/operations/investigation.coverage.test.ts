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

function snapshot(signals: OperationalSignal[]): OperationsResponse {
  return {
    generatedAt: '2026-08-30T10:06:00.000Z',
    status: 'critical',
    domains: OPERATIONS_DOMAINS.map((domain) => ({
      domain,
      status: 'healthy' as const,
      signalCount: signals.filter((signal) => signal.domain === domain).length,
    })),
    priorities:
      signals.length > 0
        ? [{ signal: signals[0]!, score: 100, reasons: ['critical'] }]
        : [],
    signals,
  };
}

function baseInspection(
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

function baseCustomers(): CustomerEconomicsResponse {
  return {
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
}

function baseSocial(): OperationsSocialResponse {
  return {
    generatedAt: '2026-08-30T10:06:00.000Z',
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
    jobs: [],
    waitingMedia: {
      lanes: 0,
      rowsRead: 0,
      oldestWaitingSince: null,
      oldestEpisodeId: null,
      oldestLanguageCode: null,
      blockedLanes: 0,
      invalidRows: 0,
      message: null,
    },
    invalidJobRows: 0,
    message: null,
  };
}

function githubSignal(): OperationalSignal {
  return {
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
}

function socialSignal(): OperationalSignal {
  return {
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
}

function okInspect(fingerprint: string): Promise<SignalInspection> {
  const source = fingerprint.startsWith('github-actions:')
    ? 'github-actions'
    : fingerprint.startsWith('sentry:')
      ? 'sentry'
      : fingerprint.startsWith('fly:')
        ? 'fly'
        : null;
  return Promise.resolve(baseInspection(fingerprint, source));
}

describe('investigation coverage', () => {
  it('records an explicit customer-economics message as the evidence gap', async () => {
    const primary = githubSignal();
    const degraded: CustomerEconomicsResponse = {
      ...baseCustomers(),
      status: 'error',
      message: 'customer warehouse timed out',
    };

    const result = await investigateOperationalSignal({
      fingerprint: primary.fingerprint,
      snapshot: snapshot([primary]),
      inspect: okInspect,
      loadCustomers: async () => degraded,
      loadSocial: async () => baseSocial(),
    });

    expect(result.relatedEvidence.customers).toEqual({
      status: 'error',
      priorityUsers: 3,
      totalCustomers: 8,
    });
    expect(result.evidenceGaps).toContainEqual({
      source: 'customer-economics',
      reason: 'customer warehouse timed out',
    });
  });

  it('falls back to the status string when a degraded customer read has no message', async () => {
    const primary = githubSignal();
    const degraded: CustomerEconomicsResponse = {
      ...baseCustomers(),
      status: 'error',
      message: null,
    };

    const result = await investigateOperationalSignal({
      fingerprint: primary.fingerprint,
      snapshot: snapshot([primary]),
      inspect: okInspect,
      loadCustomers: async () => degraded,
      loadSocial: async () => baseSocial(),
    });

    expect(result.evidenceGaps).toContainEqual({
      source: 'customer-economics',
      reason: 'customer read returned error',
    });
  });

  it('records a customer loader rejection as a customer-economics gap', async () => {
    const primary = githubSignal();

    const result = await investigateOperationalSignal({
      fingerprint: primary.fingerprint,
      snapshot: snapshot([primary]),
      inspect: okInspect,
      loadCustomers: async () => {
        throw new Error('customer boom');
      },
      loadSocial: async () => baseSocial(),
    });

    expect(result.relatedEvidence.customers).toBeUndefined();
    expect(result.evidenceGaps).toContainEqual({
      source: 'customer-economics',
      reason: 'customer boom',
    });
  });

  it('records social queue and waiting-view messages while counting mixed overdue jobs', async () => {
    const primary = socialSignal();
    const social: OperationsSocialResponse = {
      ...baseSocial(),
      message: 'queue reader degraded',
      waitingMedia: {
        ...baseSocial().waitingMedia,
        lanes: 4,
        rowsRead: 4,
        blockedLanes: 2,
        message: 'waiting view partial',
      },
      jobs: [
        {
          episodeId: 'ep-null',
          platform: 'youtube',
          languageCode: 'en',
          status: 'queued',
          scheduledAt: '2026-08-30T09:00:00.000Z',
          nextAttemptAt: '2026-08-30T09:00:00.000Z',
          attemptCount: 1,
          overdueMinutes: null,
          attemptsExhausted: false,
        },
        {
          episodeId: 'ep-zero',
          platform: 'youtube',
          languageCode: 'en',
          status: 'queued',
          scheduledAt: '2026-08-30T09:00:00.000Z',
          nextAttemptAt: '2026-08-30T09:00:00.000Z',
          attemptCount: 1,
          overdueMinutes: 0,
          attemptsExhausted: false,
        },
        {
          episodeId: 'ep-late',
          platform: 'youtube',
          languageCode: 'en',
          status: 'queued',
          scheduledAt: '2026-08-30T09:00:00.000Z',
          nextAttemptAt: '2026-08-30T09:00:00.000Z',
          attemptCount: 3,
          overdueMinutes: 45,
          attemptsExhausted: true,
        },
      ],
    };

    const result = await investigateOperationalSignal({
      fingerprint: primary.fingerprint,
      snapshot: snapshot([primary]),
      inspect: okInspect,
      loadCustomers: async () => baseCustomers(),
      loadSocial: async () => social,
    });

    expect(result.relatedEvidence.social).toEqual({
      daemonStatus: 'healthy',
      waitingMediaLanes: 4,
      blockedWaitingLanes: 2,
      overdueJobs: 1,
      exhaustedJobs: 1,
    });
    expect(result.evidenceGaps).toContainEqual({
      source: 'social-queue',
      reason: 'queue reader degraded',
    });
    expect(result.evidenceGaps).toContainEqual({
      source: 'social-queue',
      reason: 'waiting view partial',
    });
  });

  it('records a social loader rejection as a social-queue gap', async () => {
    const primary = socialSignal();
    const inspect =
      vi.fn<(fingerprint: string) => Promise<SignalInspection>>(okInspect);

    const result = await investigateOperationalSignal({
      fingerprint: primary.fingerprint,
      snapshot: snapshot([primary]),
      inspect,
      loadCustomers: async () => baseCustomers(),
      loadSocial: async () => {
        throw new Error('social boom');
      },
    });

    expect(result.relatedEvidence.social).toBeUndefined();
    expect(result.evidenceGaps).toContainEqual({
      source: 'social-queue',
      reason: 'social boom',
    });
    expect(inspect).toHaveBeenCalledWith(
      'fly:process-group/from-fed-to-chain-api/render',
    );
  });

  it('maps every known source through a failed inspection and leaves unknown sources sourceless', async () => {
    const cases: Array<{ fingerprint: string; source: string | null }> = [
      {
        fingerprint: 'customer-economics:freshness/priority-portfolios',
        source: 'customer-economics',
      },
      {
        fingerprint: 'product-health:portfolio-freshness/priority-coverage',
        source: 'product-health',
      },
      { fingerprint: 'cost-ledger:snapshot-age/ledger', source: 'cost-ledger' },
      {
        fingerprint: 'social-queue:waiting-media/podcast',
        source: 'social-queue',
      },
      {
        fingerprint: 'social-daemon:heartbeat/daemon',
        source: 'social-daemon',
      },
      {
        fingerprint: 'github-actions:workflow/alpha-etl-daily-refresh.yml',
        source: 'github-actions',
      },
      { fingerprint: 'fly:app/alpha-etl', source: 'fly' },
      { fingerprint: 'sentry:issues/alpha-etl', source: 'sentry' },
      { fingerprint: 'posthog:funnel/landing-to-waitlist', source: 'posthog' },
    ];

    for (const { fingerprint, source } of cases) {
      const result = await investigateOperationalSignal({
        fingerprint,
        snapshot: snapshot([]),
        inspect: async () => {
          throw new Error(`nope ${fingerprint}`);
        },
        loadCustomers: async () => baseCustomers(),
        loadSocial: async () => baseSocial(),
      });

      expect(result.primaryEvidence.status).toBe('unavailable');
      expect(result.primaryEvidence.source).toBe(source);
      expect(result.primaryEvidence.summary).toContain(`nope ${fingerprint}`);
      expect(result.primaryEvidence.gaps).toEqual([
        { source: source!, reason: `nope ${fingerprint}` },
      ]);
      expect(result.incident.source).toBe(source);
      expect(result.incident.status).toBe('unknown');
    }

    const unknownResult = await investigateOperationalSignal({
      fingerprint: 'bogus:kind/key',
      snapshot: snapshot([]),
      inspect: async () => {
        throw new Error('bogus boom');
      },
      loadCustomers: async () => baseCustomers(),
      loadSocial: async () => baseSocial(),
    });
    expect(unknownResult.primaryEvidence.source).toBeNull();
    expect(unknownResult.primaryEvidence.gaps).toEqual([]);
    expect(unknownResult.incident.source).toBeNull();

    const unparsable = await investigateOperationalSignal({
      fingerprint: 'not-a-fingerprint',
      snapshot: snapshot([]),
      inspect: async () => {
        throw new Error('unparsable boom');
      },
      loadCustomers: async () => baseCustomers(),
      loadSocial: async () => baseSocial(),
    });
    expect(unparsable.primaryEvidence.source).toBeNull();
    expect(unparsable.primaryEvidence.gaps).toEqual([]);
  });

  it('stringifies a non-Error inspection rejection', async () => {
    const failure = 'plain-string-failure';
    const result = await investigateOperationalSignal({
      fingerprint: 'cost-ledger:snapshot-age/ledger',
      snapshot: snapshot([]),
      inspect: async () => {
        throw failure;
      },
      loadCustomers: async () => baseCustomers(),
      loadSocial: async () => baseSocial(),
    });

    expect(result.primaryEvidence.status).toBe('unavailable');
    expect(result.primaryEvidence.source).toBe('cost-ledger');
    expect(result.primaryEvidence.summary).toContain('plain-string-failure');
    expect(result.primaryEvidence.gaps).toEqual([
      { source: 'cost-ledger', reason: 'plain-string-failure' },
    ]);
  });

  it('emits github timeline fallbacks for numeric, missing, and invalid run fields', async () => {
    const primary = githubSignal();
    const inspect = async (fingerprint: string): Promise<SignalInspection> => {
      if (fingerprint === primary.fingerprint) {
        return baseInspection(fingerprint, 'github-actions', {
          selectedRun: {
            id: 101,
            startedAt: '2026-08-30T10:00:00.000Z',
            completedAt: '2026-08-30T10:02:00.000Z',
          },
          failedJobs: [
            {
              id: 202,
              startedAt: '2026-08-30T10:00:30.000Z',
              completedAt: '2026-08-30T10:02:00.000Z',
              conclusion: { unexpected: true },
            },
            {
              startedAt: 'not-a-date',
              completedAt: 42,
            },
          ],
        });
      }
      return baseInspection(fingerprint, null);
    };

    const result = await investigateOperationalSignal({
      fingerprint: primary.fingerprint,
      snapshot: snapshot([primary]),
      inspect,
      loadCustomers: async () => baseCustomers(),
      loadSocial: async () => baseSocial(),
    });

    const byType = new Map(result.timeline.map((event) => [event.type, event]));
    expect(byType.get('workflow-started')?.summary).toBe(
      'Workflow run 101 started',
    );
    expect(byType.get('workflow-completed')?.summary).toBe(
      'Workflow run 101 completed (unknown)',
    );
    expect(byType.get('job-started')?.summary).toBe('Failed job 202 started');
    expect(byType.get('job-failed')?.summary).toBe('Job 202 finished (failed)');
    expect(
      result.timeline.some((event) => event.summary.includes('not-a-date')),
    ).toBe(false);
  });

  it('labels a run without an id as unknown', async () => {
    const primary = githubSignal();
    const result = await investigateOperationalSignal({
      fingerprint: primary.fingerprint,
      snapshot: snapshot([primary]),
      inspect: async (fingerprint: string) =>
        baseInspection(fingerprint, 'github-actions', {
          selectedRun: {
            startedAt: '2026-08-30T10:00:00.000Z',
            completedAt: '2026-08-30T10:02:00.000Z',
          },
          failedJobs: [],
        }),
      loadCustomers: async () => baseCustomers(),
      loadSocial: async () => baseSocial(),
    });

    const byType = new Map(result.timeline.map((event) => [event.type, event]));
    expect(byType.get('workflow-started')?.summary).toBe(
      'Workflow run unknown started',
    );
    expect(byType.get('workflow-completed')?.summary).toBe(
      'Workflow run unknown completed (unknown)',
    );
  });

  it('dedupes repeated entities and gaps', async () => {
    const primary = githubSignal();
    const duplicateGap = { source: 'sentry' as const, reason: 'dup' };
    const result = await investigateOperationalSignal({
      fingerprint: primary.fingerprint,
      snapshot: snapshot([primary]),
      inspect: async (fingerprint: string) => {
        if (fingerprint === primary.fingerprint) {
          return {
            ...baseInspection(fingerprint, 'github-actions'),
            entities: [
              { type: 'workspace' as const, id: '@zapengine/alpha-etl' },
              { type: 'workspace' as const, id: '@zapengine/alpha-etl' },
            ],
            gaps: [duplicateGap],
          };
        }
        if (fingerprint.startsWith('sentry:')) {
          return {
            ...baseInspection(fingerprint, 'sentry'),
            gaps: [duplicateGap],
          };
        }
        return baseInspection(fingerprint, null);
      },
      loadCustomers: async () => baseCustomers(),
      loadSocial: async () => baseSocial(),
    });

    expect(
      result.entities.filter(
        (entity) =>
          entity.type === 'workspace' && entity.id === '@zapengine/alpha-etl',
      ),
    ).toHaveLength(1);
    expect(
      result.evidenceGaps.filter(
        (gap) => gap.source === 'sentry' && gap.reason === 'dup',
      ),
    ).toHaveLength(1);
  });

  it('emits no github events when the run payload is absent or malformed', async () => {
    const primary = githubSignal();
    const result = await investigateOperationalSignal({
      fingerprint: primary.fingerprint,
      snapshot: snapshot([primary]),
      inspect: async (fingerprint: string) =>
        baseInspection(fingerprint, 'github-actions', {
          selectedRun: 'not-a-record',
          failedJobs: 'not-a-list',
        }),
      loadCustomers: async () => baseCustomers(),
      loadSocial: async () => baseSocial(),
    });

    expect(
      result.timeline.some(
        (event) =>
          event.type === 'workflow-started' ||
          event.type === 'workflow-completed' ||
          event.type === 'job-started' ||
          event.type === 'job-failed',
      ),
    ).toBe(false);
    expect(
      result.timeline.some((event) => event.type === 'signal-observed'),
    ).toBe(true);
  });

  it('emits sentry timeline fallbacks for missing labels, bad dates, and sample titles', async () => {
    const primary: OperationalSignal = {
      fingerprint: 'sentry:issues/alpha-etl',
      source: 'sentry',
      domain: 'errors',
      status: 'critical',
      title: 'Sentry spike',
      detail: null,
      evidence: {},
      observedAt: '2026-08-30T10:02:00.000Z',
      url: null,
    };
    const result = await investigateOperationalSignal({
      fingerprint: primary.fingerprint,
      snapshot: snapshot([primary]),
      inspect: async (fingerprint: string) =>
        baseInspection(fingerprint, 'sentry', {
          issues: [
            {
              shortId: 'ALPHA-1',
              firstSeen: '2026-08-30T09:00:00.000Z',
              lastSeen: '2026-08-30T10:00:00.000Z',
            },
            {
              title: 'Only title',
              firstSeen: '2026-08-30T09:10:00.000Z',
              lastSeen: 'not-a-date',
            },
            {
              firstSeen: '2026-08-30T09:20:00.000Z',
              lastSeen: '2026-08-30T10:01:00.000Z',
            },
          ],
          sampleEvent: { title: 404, createdAt: '2026-08-30T10:01:30.000Z' },
        }),
      loadCustomers: async () => baseCustomers(),
      loadSocial: async () => baseSocial(),
    });

    const summaries = result.timeline.map((event) => event.summary);
    expect(summaries).toContain('ALPHA-1 first seen');
    expect(summaries).toContain('ALPHA-1 last seen');
    expect(summaries).toContain('Only title first seen');
    expect(summaries).toContain('Sentry issue last seen');
    expect(summaries).toContain('404');
    expect(
      result.timeline.some((event) => event.summary.includes('not-a-date')),
    ).toBe(false);
  });

  it('covers the sentry sample fallback and the absent-sample path', async () => {
    const primary: OperationalSignal = {
      fingerprint: 'sentry:issues/alpha-etl',
      source: 'sentry',
      domain: 'errors',
      status: 'critical',
      title: 'Sentry spike',
      detail: null,
      evidence: {},
      observedAt: '2026-08-30T10:02:00.000Z',
      url: null,
    };

    const withUntitledSample = await investigateOperationalSignal({
      fingerprint: primary.fingerprint,
      snapshot: snapshot([primary]),
      inspect: async (fingerprint: string) =>
        baseInspection(fingerprint, 'sentry', {
          issues: [],
          sampleEvent: { createdAt: '2026-08-30T10:01:30.000Z' },
        }),
      loadCustomers: async () => baseCustomers(),
      loadSocial: async () => baseSocial(),
    });
    expect(
      withUntitledSample.timeline.some(
        (event) =>
          event.type === 'event-sample' &&
          event.summary === 'Sentry event sample',
      ),
    ).toBe(true);

    const withoutSample = await investigateOperationalSignal({
      fingerprint: primary.fingerprint,
      snapshot: snapshot([primary]),
      inspect: async (fingerprint: string) =>
        baseInspection(fingerprint, 'sentry', {
          issues: [],
          sampleEvent: 'not-a-record',
        }),
      loadCustomers: async () => baseCustomers(),
      loadSocial: async () => baseSocial(),
    });
    expect(
      withoutSample.timeline.some((event) => event.type === 'event-sample'),
    ).toBe(false);
  });

  it('emits fly timeline fallbacks for missing ids, states, and event fields', async () => {
    const primary: OperationalSignal = {
      fingerprint: 'fly:app/alpha-etl',
      source: 'fly',
      domain: 'infra',
      status: 'critical',
      title: 'Fly app down',
      detail: null,
      evidence: {},
      observedAt: '2026-08-30T10:02:00.000Z',
      url: null,
    };
    const result = await investigateOperationalSignal({
      fingerprint: primary.fingerprint,
      snapshot: snapshot([primary]),
      inspect: async (fingerprint: string) =>
        baseInspection(fingerprint, 'fly', {
          machines: [
            {
              id: 7,
              state: 'stopped',
              createdAt: '2026-08-30T09:00:00.000Z',
              updatedAt: '2026-08-30T10:04:00.000Z',
              recentEvents: [
                {
                  type: 'stop',
                  status: 'stopped',
                  at: '2026-08-30T10:04:00.000Z',
                },
                {
                  at: '2026-08-30T10:04:30.000Z',
                },
              ],
            },
            {
              createdAt: '2026-08-30T09:05:00.000Z',
              updatedAt: '2026-08-30T10:05:00.000Z',
              recentEvents: 'not-a-list',
            },
            {
              id: 'bad-dates',
              createdAt: 'not-a-date',
              updatedAt: 42,
              recentEvents: [],
            },
          ],
        }),
      loadCustomers: async () => baseCustomers(),
      loadSocial: async () => baseSocial(),
    });

    const summaries = result.timeline.map((event) => event.summary);
    expect(summaries).toContain('Machine 7 created');
    expect(summaries).toContain('Machine 7 updated (stopped)');
    expect(summaries).toContain('Machine 7: stop stopped');
    expect(summaries).toContain('Machine 7: event');
    expect(summaries).toContain('Machine unknown created');
    expect(summaries).toContain('Machine unknown updated (unknown)');
    expect(
      result.timeline.some((event) => event.summary.includes('not-a-date')),
    ).toBe(false);
  });

  it('keeps inspection timelines empty for sources without a timeline renderer', async () => {
    const primary: OperationalSignal = {
      fingerprint: 'cost-ledger:snapshot-age/ledger',
      source: 'cost-ledger',
      domain: 'costs',
      status: 'degraded',
      title: 'Cost ledger snapshot is stale',
      detail: null,
      evidence: {},
      observedAt: '2026-08-30T12:00:00.000Z',
      url: null,
    };

    const otherSource = await investigateOperationalSignal({
      fingerprint: primary.fingerprint,
      snapshot: snapshot([primary]),
      inspect: async (fingerprint: string) =>
        baseInspection(fingerprint, 'cost-ledger', {
          selectedRun: { startedAt: '2026-08-30T10:00:00.000Z' },
        }),
      loadCustomers: async () => baseCustomers(),
      loadSocial: async () => baseSocial(),
    });
    expect(
      otherSource.timeline.every((event) => event.type === 'signal-observed'),
    ).toBe(true);

    const nullSource = await investigateOperationalSignal({
      fingerprint: primary.fingerprint,
      snapshot: snapshot([primary]),
      inspect: async (fingerprint: string) => baseInspection(fingerprint, null),
      loadCustomers: async () => baseCustomers(),
      loadSocial: async () => baseSocial(),
    });
    expect(
      nullSource.timeline.every((event) => event.type === 'signal-observed'),
    ).toBe(true);
  });

  it('reads numeric, non-numeric, and missing freshness evidence', async () => {
    const freshness: OperationalSignal = {
      fingerprint: 'customer-economics:freshness/priority-portfolios',
      source: 'customer-economics',
      domain: 'customers',
      status: 'critical',
      title: '2 priority portfolios are stale',
      detail: null,
      evidence: { affectedUsers: 'two', aumAtRiskUsd: null },
      observedAt: '2026-08-30T10:06:00.000Z',
      url: null,
    };
    const numericFreshness: OperationalSignal = {
      ...freshness,
      evidence: { affectedUsers: 2, aumAtRiskUsd: 12_500 },
    };
    const primary = githubSignal();

    const numeric = await investigateOperationalSignal({
      fingerprint: primary.fingerprint,
      snapshot: snapshot([primary, numericFreshness]),
      inspect: okInspect,
      loadCustomers: async () => baseCustomers(),
      loadSocial: async () => baseSocial(),
    });
    expect(numeric.customerImpact).toEqual({
      affectedCustomers: 2,
      priorityCustomers: 3,
      aumUsd: 12_500,
    });

    const nonNumeric = await investigateOperationalSignal({
      fingerprint: primary.fingerprint,
      snapshot: snapshot([primary, freshness]),
      inspect: okInspect,
      loadCustomers: async () => baseCustomers(),
      loadSocial: async () => baseSocial(),
    });
    expect(nonNumeric.customerImpact).toEqual({
      affectedCustomers: null,
      priorityCustomers: 3,
      aumUsd: null,
    });

    const missingFreshness = await investigateOperationalSignal({
      fingerprint: primary.fingerprint,
      snapshot: snapshot([primary]),
      inspect: okInspect,
      loadCustomers: async () => baseCustomers(),
      loadSocial: async () => baseSocial(),
    });
    expect(missingFreshness.customerImpact).toEqual({
      affectedCustomers: null,
      priorityCustomers: 3,
      aumUsd: null,
    });
  });
});
