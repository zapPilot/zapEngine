import { describe, expect, it } from 'vitest';

import type {
  OperationsSocialResponse,
  OperationalSignal,
} from '../../../shared/types.js';
import { readControlCenterConfig } from '../../config/env.js';
import { deriveSocialSignals, loadOperationsSocial } from './social.js';

const NOW = new Date('2026-08-28T12:00:00.000Z');
const CONFIGURED = readControlCenterConfig({
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
});

function jobRow(overrides: Record<string, unknown> = {}) {
  return {
    episode_id: 'episode-1',
    platform: 'threads',
    language_code: 'ja',
    status: 'queued',
    scheduled_at: '2026-08-28T11:00:00.000Z',
    next_attempt_at: '2026-08-28T10:00:00.000Z',
    attempt_count: 0,
    ...overrides,
  };
}

function daemonRow() {
  return {
    id: 'local-social-daemon-v1',
    first_started_at: '2026-08-01T00:00:00.000Z',
    last_tick_started_at: '2026-08-28T11:58:00.000Z',
    last_tick_completed_at: '2026-08-28T11:58:10.000Z',
    last_success_at: '2026-08-28T11:58:10.000Z',
    last_error: null,
    owner: 'laptop-jst',
    daemon_version: '2026.08.28',
  };
}

function stub(tables: Record<string, unknown>) {
  const factory = () => ({
    from(table: string) {
      const stubbed = (tables[table] ?? {}) as {
        data?: unknown;
        count?: number | null;
        error?: { message: string } | null;
      };
      const payload = {
        data: stubbed.data ?? null,
        count: stubbed.count ?? null,
        error: stubbed.error ?? null,
      };
      const chain = {
        select: () => chain,
        in: () => chain,
        eq: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: () => Promise.resolve(payload),
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve(payload).then(resolve),
      };
      return chain;
    },
  });
  return factory as unknown as Parameters<
    typeof loadOperationsSocial
  >[0]['createClient'];
}

function find(signals: OperationalSignal[], fingerprint: string) {
  const found = signals.find((signal) => signal.fingerprint === fingerprint);
  if (!found) {
    throw new Error(`missing ${fingerprint}`);
  }
  return found;
}

function healthyDaemon() {
  return {
    status: 'healthy' as const,
    owner: 'laptop-jst',
    daemonVersion: null,
    firstStartedAt: null,
    lastTickStartedAt: NOW.toISOString(),
    lastTickCompletedAt: null,
    lastSuccessAt: null,
    lastError: null,
    staleMinutes: 1,
  };
}

describe('social missing branches', () => {
  it('reports blocked lanes with a null waiting age as 0h', () => {
    const response: OperationsSocialResponse = {
      generatedAt: NOW.toISOString(),
      daemon: healthyDaemon(),
      jobs: [],
      waitingMedia: {
        lanes: 5,
        rowsRead: 1,
        oldestWaitingSince: null,
        oldestEpisodeId: 'episode-stuck',
        oldestLanguageCode: 'ja',
        blockedLanes: 2,
        invalidRows: 0,
        message: null,
      },
      invalidJobRows: 0,
      message: null,
    };
    const waiting = find(
      deriveSocialSignals(response, NOW),
      'social-queue:waiting-media/episodes',
    );
    expect(waiting.status).toBe('critical');
    expect(waiting.detail).toContain('0h');
  });

  it('reports degraded lanes with a null waiting age as 0h', () => {
    const response: OperationsSocialResponse = {
      generatedAt: NOW.toISOString(),
      daemon: healthyDaemon(),
      jobs: [],
      waitingMedia: {
        lanes: 5,
        rowsRead: 5,
        oldestWaitingSince: null,
        oldestEpisodeId: 'episode-stuck',
        oldestLanguageCode: null,
        blockedLanes: 0,
        invalidRows: 0,
        message: null,
      },
      invalidJobRows: 0,
      message: null,
    };
    const waiting = find(
      deriveSocialSignals(response, NOW),
      'social-queue:waiting-media/episodes',
    );
    expect(waiting.status).toBe('degraded');
    expect(waiting.detail).toContain('0h');
  });

  it('counts multiple waiting-media parse failures with the plural noun', () => {
    const response: OperationsSocialResponse = {
      generatedAt: NOW.toISOString(),
      daemon: healthyDaemon(),
      jobs: [],
      waitingMedia: {
        lanes: 2,
        rowsRead: 2,
        oldestWaitingSince: '2026-08-26T11:00:00.000Z',
        oldestEpisodeId: 'episode-old',
        oldestLanguageCode: 'ja',
        blockedLanes: 0,
        invalidRows: 2,
        message: null,
      },
      invalidJobRows: 0,
      message: null,
    };
    const waiting = find(
      deriveSocialSignals(response, NOW),
      'social-queue:waiting-media/episodes',
    );
    expect(waiting.detail).toContain('2 waiting-media rows failed to parse');
  });

  it('prefers an exhausted lane over a merely overdue one and vice versa', async () => {
    // Both exhausted so `attemptsExhausted` ties and the overdue comparison
    // runs: one lane has a null age (inside the grace window) which exercises
    // the `?? 0` fallback on each side across the two orderings.
    const exhaustedRecent = jobRow({
      episode_id: 'episode-exhausted-recent',
      attempt_count: 8,
      scheduled_at: '2026-08-28T11:50:00.000Z',
      next_attempt_at: '2026-08-28T11:50:00.000Z',
    });
    const exhaustedOld = jobRow({
      episode_id: 'episode-exhausted-old',
      attempt_count: 8,
      scheduled_at: '2026-08-28T06:00:00.000Z',
      next_attempt_at: '2026-08-28T06:00:00.000Z',
    });

    const first = await loadOperationsSocial({
      config: CONFIGURED,
      now: NOW,
      createClient: stub({
        social_publish_jobs: { data: [exhaustedRecent, exhaustedOld] },
        social_daemon_state: { data: daemonRow() },
        social_waiting_media: { count: 0 },
      }),
    });
    const queueFirst = find(
      deriveSocialSignals(first, NOW),
      'social-queue:overdue/queue',
    );
    expect(queueFirst.status).toBe('critical');
    expect(queueFirst.detail).toContain('episode-exhausted-old');

    const second = await loadOperationsSocial({
      config: CONFIGURED,
      now: NOW,
      createClient: stub({
        social_publish_jobs: { data: [exhaustedOld, exhaustedRecent] },
        social_daemon_state: { data: daemonRow() },
        social_waiting_media: { count: 0 },
      }),
    });
    const queueSecond = find(
      deriveSocialSignals(second, NOW),
      'social-queue:overdue/queue',
    );
    expect(queueSecond.status).toBe('critical');
    expect(queueSecond.detail).toContain('episode-exhausted-old');
  });

  it('orders overdue lanes by minutes when neither is exhausted', async () => {
    const early = jobRow({
      episode_id: 'episode-early',
      scheduled_at: '2026-08-28T08:00:00.000Z',
      next_attempt_at: '2026-08-28T08:00:00.000Z',
    });
    const late = jobRow({
      episode_id: 'episode-late',
      scheduled_at: '2026-08-28T06:00:00.000Z',
      next_attempt_at: '2026-08-28T06:00:00.000Z',
    });
    const response = await loadOperationsSocial({
      config: CONFIGURED,
      now: NOW,
      createClient: stub({
        social_publish_jobs: { data: [early, late] },
        social_daemon_state: { data: daemonRow() },
        social_waiting_media: { count: 0 },
      }),
    });
    const queue = find(
      deriveSocialSignals(response, NOW),
      'social-queue:overdue/queue',
    );
    expect(queue.detail).toContain('episode-late');
  });

  it('reports multiple unreadable waiting-media rows with the plural noun', async () => {
    const response = await loadOperationsSocial({
      config: CONFIGURED,
      now: NOW,
      createClient: stub({
        social_publish_jobs: { data: [] },
        social_daemon_state: { data: daemonRow() },
        social_waiting_media: {
          count: 2,
          data: [{ bogus: 1 }, { bogus: 2 }],
        },
      }),
    });
    expect(response.waitingMedia.message).toContain('2 waiting-media rows');
  });
});
