import type { createClient } from '@supabase/supabase-js';
import { EPISODE_VIDEO_VISUAL_VERSION } from '@zapengine/types/shared';
import { describe, expect, it } from 'vitest';

import type {
  OperationalSignal,
  OperationsSocialResponse,
} from '../../../shared/types.js';
import { readControlCenterConfig } from '../../config/env.js';
import { deriveSocialSignals, loadOperationsSocial } from './social.js';

const NOW = new Date('2026-08-28T12:00:00.000Z');
const CONFIGURED = readControlCenterConfig({
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
});

interface StubPayload {
  data: unknown;
  count: number | null;
  error: { message: string } | null;
}

interface StubChain {
  select: () => StubChain;
  in: () => StubChain;
  eq: () => StubChain;
  limit: (count: number) => StubChain;
  order: (column: string, options: { ascending: boolean }) => StubChain;
  maybeSingle: () => Promise<StubPayload>;
  then: (resolve: (value: StubPayload) => unknown) => Promise<unknown>;
}

interface StubTable {
  data?: unknown;
  count?: number | null;
  error?: { message: string } | null;
}

/**
 * The adapter only ever reads, so a chainable stub that ignores every filter
 * and resolves to a canned payload per table is enough; it keeps the tests off
 * the network without pulling in a Supabase mock library.
 */
function stubSupabase(tables: Record<string, StubTable>): typeof createClient {
  const factory = () => ({
    from(table: string): StubChain {
      const stub = tables[table] ?? {};
      const payload: StubPayload = {
        data: stub.data ?? null,
        count: stub.count ?? null,
        error: stub.error ?? null,
      };
      const chain: StubChain = {
        select: () => chain,
        in: () => chain,
        eq: () => chain,
        order: (column, options) => {
          if (Array.isArray(payload.data)) {
            payload.data = [...payload.data].sort(
              (a, b) =>
                String(a[column]).localeCompare(String(b[column])) *
                (options.ascending ? 1 : -1),
            );
          }
          return chain;
        },
        limit: (count) => {
          if (Array.isArray(payload.data))
            {payload.data = payload.data.slice(0, count);}
          return chain;
        },
        maybeSingle: () => Promise.resolve(payload),
        then: (resolve) => Promise.resolve(payload).then(resolve),
      };
      return chain;
    },
  });
  return factory as unknown as typeof createClient;
}

function waitingRow(overrides: Record<string, unknown> = {}) {
  return {
    waiting_since: '2026-08-28T11:00:00.000Z',
    last_progress_at: '2026-08-28T11:30:00.000Z',
    render_status: 'pending',
    render_attempt_count: 0,
    render_next_attempt_at: null,
    render_lease_expires_at: null,
    render_visual_version: EPISODE_VIDEO_VISUAL_VERSION,
    visual_status: 'completed',
    visual_version: EPISODE_VIDEO_VISUAL_VERSION,
    ...overrides,
  };
}

function jobRow(overrides: Record<string, unknown> = {}) {
  return {
    episode_id: 'episode-1',
    platform: 'threads',
    language_code: 'ja',
    status: 'queued',
    scheduled_at: '2026-08-28T11:00:00.000Z',
    next_attempt_at: '2026-08-28T11:55:00.000Z',
    attempt_count: 0,
    ...overrides,
  };
}

function daemonRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'local-social-daemon-v1',
    first_started_at: '2026-08-01T00:00:00.000Z',
    last_tick_started_at: '2026-08-28T11:58:00.000Z',
    last_tick_completed_at: '2026-08-28T11:58:10.000Z',
    last_success_at: '2026-08-28T11:58:10.000Z',
    last_error: null,
    owner: 'laptop-jst',
    daemon_version: '2026.08.28',
    ...overrides,
  };
}

async function load(tables: Record<string, StubTable>) {
  return loadOperationsSocial({
    config: CONFIGURED,
    now: NOW,
    createClient: stubSupabase(tables),
  });
}

/**
 * Queue behaviour is read against a live daemon and an empty media backlog, so
 * only the lanes — and, where the case is about the heartbeat, the daemon row —
 * are worth spelling out per test.
 */
async function loadQueue(jobs: unknown[], daemon: unknown = daemonRow()) {
  return load({
    social_publish_jobs: { data: jobs },
    social_daemon_state: { data: daemon },
    social_waiting_media: { count: 0 },
  });
}

function signal(
  signals: OperationalSignal[],
  fingerprint: string,
): OperationalSignal {
  const found = signals.find((entry) => entry.fingerprint === fingerprint);
  if (!found) {
    throw new Error(`missing signal ${fingerprint}`);
  }
  return found;
}

/**
 * The queue signal, checked against the verdict the case is about. Every one
 * of these tests reads the same fingerprint and judges the same status before
 * looking at evidence, so the status belongs in the lookup rather than in a
 * line repeated per case.
 */
function expectQueue(
  response: OperationsSocialResponse,
  status: OperationalSignal['status'],
): OperationalSignal {
  const queue = signal(
    deriveSocialSignals(response, NOW),
    'social-queue:overdue/queue',
  );
  expect(queue.status).toBe(status);
  return queue;
}

/**
 * A read the adapter could not trust collapses the whole panel to one signal,
 * so these cases are only interesting in what that single signal says.
 */
function soleSourceFailure(
  response: OperationsSocialResponse,
): OperationalSignal {
  const signals = deriveSocialSignals(response, NOW);
  expect(signals).toHaveLength(1);
  return signal(signals, 'social-queue:source-failure/adapter');
}

describe('loadOperationsSocial', () => {
  it('reports one unknown signal when Supabase is not configured', async () => {
    const response = await loadOperationsSocial({
      config: readControlCenterConfig({}),
      now: NOW,
    });

    expect(response.daemon.status).toBe('unknown');
    expect(response.jobs).toEqual([]);
    expect(response.waitingMediaLanes).toBeNull();
    expect(response.message).not.toBeNull();

    const signals = deriveSocialSignals(response, NOW);
    expect(signals).toHaveLength(1);
    expect(signals[0]?.fingerprint).toBe('social-queue:unconfigured/supabase');
    expect(signals[0]?.status).toBe('unknown');
  });

  it('reads a live queue as healthy across all three signals', async () => {
    const response = await load({
      social_publish_jobs: { data: [jobRow()] },
      social_daemon_state: { data: daemonRow() },
      social_waiting_media: { count: 1, data: [waitingRow()] },
    });

    expect(response.daemon).toMatchObject({
      status: 'healthy',
      owner: 'laptop-jst',
      daemonVersion: '2026.08.28',
      staleMinutes: 2,
    });
    expect(response.jobs).toEqual([
      {
        episodeId: 'episode-1',
        platform: 'threads',
        languageCode: 'ja',
        status: 'queued',
        scheduledAt: '2026-08-28T11:00:00.000Z',
        nextAttemptAt: '2026-08-28T11:55:00.000Z',
        attemptCount: 0,
        overdueMinutes: null,
        attemptsExhausted: false,
      },
    ]);

    const signals = deriveSocialSignals(response, NOW);
    expect(signals.map((entry) => entry.status)).toEqual([
      'healthy',
      'healthy',
      'healthy',
    ]);
    expect(
      signal(signals, 'social-daemon:heartbeat/local-social-daemon-v1')
        .evidence,
    ).toMatchObject({ staleMinutes: 2, owner: 'laptop-jst', overdueJobs: 0 });
    expect(
      signal(signals, 'social-queue:overdue/queue').evidence,
    ).toMatchObject({ pendingJobs: 1, overdueJobs: 0 });
  });

  it('keeps a job inside the grace window off the overdue list', async () => {
    // Due 10 minutes ago: the daemon polls, so this is a lane waiting for the
    // next tick rather than a late one.
    const response = await loadQueue([
      jobRow({ next_attempt_at: '2026-08-28T11:50:00.000Z' }),
    ]);

    expect(response.jobs[0]?.overdueMinutes).toBeNull();
    expectQueue(response, 'healthy');
  });

  it('measures overdue from the later of scheduled and next attempt', async () => {
    const response = await loadQueue([
      jobRow({
        episode_id: 'episode-mild',
        next_attempt_at: '2026-08-28T11:40:00.000Z',
      }),
      jobRow({
        episode_id: 'episode-worst',
        // The claim gates on both timestamps, so lateness runs from the later
        // one: nine hours behind schedule is still only an hour past the point
        // the daemon could have taken it.
        scheduled_at: '2026-08-28T03:00:00.000Z',
        next_attempt_at: '2026-08-28T11:00:00.000Z',
      }),
      jobRow({
        episode_id: 'episode-middling',
        next_attempt_at: '2026-08-28T11:20:00.000Z',
      }),
    ]);

    expect(response.jobs.map((job) => job.overdueMinutes)).toEqual([
      20, 60, 40,
    ]);

    const queue = expectQueue(response, 'degraded');
    expect(queue.evidence).toMatchObject({
      overdueMinutes: 60,
      episodeId: 'episode-worst',
      platform: 'threads',
      attemptsExhausted: false,
      overdueJobs: 3,
    });
  });

  it('escalates an exhausted lane over every merely late one', async () => {
    const response = await loadQueue([
      jobRow({
        episode_id: 'episode-very-late',
        next_attempt_at: '2026-08-28T09:00:00.000Z',
      }),
      jobRow({
        episode_id: 'episode-dead',
        platform: 'x',
        status: 'failed',
        // Still inside the grace window, so it is not late at all — but the
        // claim has already stopped looking at it.
        next_attempt_at: '2026-08-28T11:58:00.000Z',
        attempt_count: 8,
      }),
      jobRow({
        episode_id: 'episode-late',
        next_attempt_at: '2026-08-28T11:20:00.000Z',
      }),
    ]);

    expect(response.jobs[1]?.overdueMinutes).toBeNull();

    const queue = expectQueue(response, 'critical');
    expect(queue.evidence).toMatchObject({
      episodeId: 'episode-dead',
      platform: 'x',
      attemptsExhausted: true,
      overdueMinutes: null,
      overdueJobs: 3,
    });
  });

  it('calls a stale daemon degraded while nothing is overdue yet', async () => {
    const response = await loadQueue(
      [jobRow()],
      daemonRow({
        last_tick_started_at: '2026-08-28T10:30:00.000Z',
        last_error: 'rednote session expired',
      }),
    );

    expect(response.daemon.staleMinutes).toBe(90);

    const heartbeat = signal(
      deriveSocialSignals(response, NOW),
      'social-daemon:heartbeat/local-social-daemon-v1',
    );
    expect(heartbeat.status).toBe('degraded');
    expect(heartbeat.detail).toContain('laptop');
    expect(heartbeat.evidence).toMatchObject({
      staleMinutes: 90,
      lastError: 'rednote session expired',
      overdueJobs: 0,
    });
  });

  it('turns a stale daemon with an overdue lane into a critical signal', async () => {
    const response = await loadQueue(
      [jobRow({ next_attempt_at: '2026-08-28T10:00:00.000Z' })],
      daemonRow({ last_tick_started_at: '2026-08-28T10:30:00.000Z' }),
    );

    const heartbeat = signal(
      deriveSocialSignals(response, NOW),
      'social-daemon:heartbeat/local-social-daemon-v1',
    );
    expect(heartbeat.status).toBe('critical');
    expect(heartbeat.evidence).toMatchObject({ overdueJobs: 1 });
  });

  it('treats a pre-heartbeat row and a missing row alike as unknown', async () => {
    const legacy = await loadQueue([], {
      id: 'local-social-daemon-v1',
      first_started_at: null,
    });
    const absent = await loadQueue([], null);

    expect(legacy.daemon.status).toBe('unknown');
    expect(legacy.daemon.lastTickStartedAt).toBeNull();
    expect(absent.daemon).toEqual(legacy.daemon);
    expect(
      signal(
        deriveSocialSignals(absent, NOW),
        'social-daemon:heartbeat/local-social-daemon-v1',
      ).status,
    ).toBe('unknown');
  });

  it('flags a media backlog once enough lanes are waiting', async () => {
    const response = await load({
      // A body-less job response is what an empty queue can look like, and it
      // must read as "nothing pending", not as a lost reading.
      social_publish_jobs: { data: null },
      social_daemon_state: { data: daemonRow() },
      social_waiting_media: {
        count: 4,
        data: Array.from({ length: 4 }, () => waitingRow()),
      },
    });

    expect(response.jobs).toEqual([]);

    const waiting = signal(
      deriveSocialSignals(response, NOW),
      'social-queue:waiting-media/episodes',
    );
    expect(waiting.status).toBe('degraded');
    expect(waiting.evidence).toMatchObject({ waitingMediaLanes: 4 });
  });

  it('drops malformed job rows but never calls the rest on schedule', async () => {
    const response = await load({
      social_publish_jobs: {
        data: [
          jobRow({ next_attempt_at: 'not-a-timestamp' }),
          jobRow({ platform: 42 }),
          jobRow({ episode_id: 'episode-good' }),
        ],
      },
      social_daemon_state: { data: daemonRow() },
      social_waiting_media: { count: null },
    });

    expect(response.jobs).toHaveLength(1);
    expect(response.jobs[0]?.episodeId).toBe('episode-good');
    expect(response.invalidJobRows).toBe(2);
    expect(response.waitingMediaLanes).toBe(0);

    const queue = expectQueue(response, 'degraded');
    expect(queue.detail).toContain('failed to parse');
    expect(queue.evidence).toMatchObject({
      pendingJobs: 1,
      overdueJobs: 0,
      invalidRowCount: 2,
    });
  });

  it('reads a stringified attempt count as the number it is', async () => {
    // PostgREST hands back bigint columns as decimal strings, so a lane that
    // is one retry from the fence must not be dropped for saying so in text.
    const response = await loadQueue([
      jobRow({ attempt_count: '3' }),
      jobRow({ episode_id: 'episode-dead', attempt_count: '8' }),
    ]);

    expect(response.invalidJobRows).toBe(0);
    expect(response.jobs.map((job) => job.attemptCount)).toEqual([3, 8]);
    expect(response.jobs[0]?.attemptsExhausted).toBe(false);

    const queue = expectQueue(response, 'critical');
    expect(queue.evidence).toMatchObject({
      episodeId: 'episode-dead',
      attemptsExhausted: true,
    });
  });

  it('still rejects an attempt count that is not a number at all', async () => {
    const response = await loadQueue([jobRow({ attempt_count: 'abc' })]);

    expect(response.jobs).toEqual([]);
    expect(response.message).toContain('unknown shape');
  });

  it('never reports a queue as readable when every row failed to parse', async () => {
    const response = await loadQueue([
      jobRow({ scheduled_at: 'not-a-timestamp' }),
      jobRow({ status: null }),
    ]);

    expect(response.jobs).toEqual([]);
    expect(response.invalidJobRows).toBe(0);
    expect(response.message).toContain('2 social publish jobs');

    expect(soleSourceFailure(response).status).toBe('degraded');
  });

  it('reports a Supabase failure as a source failure, never a throw', async () => {
    const response = await load({
      social_publish_jobs: { error: { message: 'permission denied' } },
      social_daemon_state: { data: daemonRow() },
      social_waiting_media: { count: 0 },
    });

    expect(response.message).toBe('permission denied');
    expect(response.jobs).toEqual([]);
    expect(response.waitingMediaLanes).toBeNull();

    const failure = soleSourceFailure(response);
    expect(failure.status).toBe('degraded');
    expect(failure.detail).toBe('permission denied');
  });
});

describe('waiting media progress', () => {
  async function media(rows: unknown[], count = rows.length) {
    return load({
      social_waiting_media: { data: rows, count },
      social_daemon_state: { data: daemonRow() },
    });
  }
  function verdict(response: OperationsSocialResponse) {
    return signal(
      deriveSocialSignals(response, NOW),
      'social-queue:waiting-media/episodes',
    );
  }
  it.each([
    { render_status: null },
    { render_status: 'failed' },
    { render_attempt_count: 3 },
    { visual_status: 'failed' },
    { visual_version: 'old' },
    { render_visual_version: 'old' },
  ])('reports a single old blocked lane as critical: %j', async (overrides) => {
    const result = verdict(
      await media([
        waitingRow({ waiting_since: '2026-08-18T12:00:00.000Z', ...overrides }),
      ]),
    );
    expect(result.status).toBe('critical');
    expect(result.evidence).toMatchObject({
      waitingMediaLanes: 1,
      oldestWaitingHours: 240,
      blockedWaitingLanes: 1,
    });
  });
  it('keeps a young claimable lane healthy and observes its age', async () => {
    const result = verdict(await media([waitingRow()]));
    expect(result.status).toBe('healthy');
    expect(result.evidence).toMatchObject({
      oldestWaitingHours: 1,
      blockedWaitingLanes: 0,
    });
  });
  it('degrades an old claimable lane', async () => {
    expect(
      verdict(
        await media([
          waitingRow({ waiting_since: '2026-08-26T11:00:00.000Z' }),
        ]),
      ).status,
    ).toBe('degraded');
  });
  it('never reports partly unreadable media healthy', async () => {
    const response = await media([
      waitingRow(),
      waitingRow({ waiting_since: 'invalid' }),
    ]);
    expect(response.invalidWaitingMediaRows).toBe(1);
    expect(verdict(response).status).toBe('degraded');
  });
  it('rejects a positive count with no readable rows', async () => {
    for (const rows of [[], [waitingRow({ waiting_since: 'invalid' })]]) {
      expect(soleSourceFailure(await media(rows, 1)).status).toBe('degraded');
    }
  });
  it('samples oldest first before limiting and preserves the exact total', async () => {
    const rows = Array.from({ length: 250 }, () => waitingRow());
    rows.push(
      waitingRow({
        waiting_since: '2026-08-18T12:00:00.000Z',
        render_status: 'failed',
      }),
    );
    const response = await media(rows);
    expect(response.waitingMediaLanes).toBe(251);
    expect(verdict(response).status).toBe('critical');
    expect(verdict(response).evidence['oldestWaitingHours']).toBe(240);
  });
});
