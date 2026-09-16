import { EPISODE_VIDEO_VISUAL_VERSION } from '@zapengine/types/shared';
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

function waitingRow(overrides: Record<string, unknown> = {}) {
  return {
    episode_id: 'episode-waiting',
    language_code: 'ja',
    waiting_since: '2026-08-28T11:00:00.000Z',
    last_progress_at: null,
    render_status: 'queued',
    render_attempt_count: 0,
    render_next_attempt_at: null,
    render_lease_expires_at: null,
    render_visual_version: EPISODE_VIDEO_VISUAL_VERSION,
    render_visual_hash: 'visual-hash',
    visual_status: 'completed',
    visual_version: EPISODE_VIDEO_VISUAL_VERSION,
    visual_hash: 'visual-hash',
    ...overrides,
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

describe('social coverage', () => {
  it('appends the unread warning to an overdue lane once', async () => {
    const response = await loadOperationsSocial({
      config: CONFIGURED,
      now: NOW,
      createClient: stub({
        social_publish_jobs: {
          data: [
            jobRow({ next_attempt_at: '2026-08-28T10:00:00.000Z' }),
            { episode_id: 'bad', platform: 42 },
          ],
        },
        social_daemon_state: { data: daemonRow() },
        social_waiting_media: { count: 0 },
      }),
    });

    const queue = find(
      deriveSocialSignals(response, NOW),
      'social-queue:overdue/queue',
    );
    expect(queue.status).toBe('degraded');
    expect(queue.detail).toContain('1 queue row failed to parse');
    expect(queue.evidence['invalidRowCount']).toBe(1);
  });

  it('names the oldest lane without a language suffix when it is absent', async () => {
    const response = await loadOperationsSocial({
      config: CONFIGURED,
      now: NOW,
      createClient: stub({
        social_publish_jobs: { data: [] },
        social_daemon_state: { data: daemonRow() },
        social_waiting_media: {
          count: 1,
          data: [
            waitingRow({
              episode_id: 'episode-stuck',
              language_code: null,
              waiting_since: '2026-08-18T12:00:00.000Z',
              render_status: 'failed',
            }),
          ],
        },
      }),
    });

    const waiting = find(
      deriveSocialSignals(response, NOW),
      'social-queue:waiting-media/episodes',
    );
    expect(waiting.status).toBe('critical');
    expect(waiting.detail).toContain('episode episode-stuck has waited');
    expect(waiting.detail).not.toContain('(ja)');
  });

  it('falls back to the parsed length when the waiting count is absent', async () => {
    const response = await loadOperationsSocial({
      config: CONFIGURED,
      now: NOW,
      createClient: stub({
        social_publish_jobs: { data: [] },
        social_daemon_state: { data: daemonRow() },
        social_waiting_media: { count: null, data: [waitingRow()] },
      }),
    });

    expect(response.waitingMedia.lanes).toBe(1);
    const waiting = find(
      deriveSocialSignals(response, NOW),
      'social-queue:waiting-media/episodes',
    );
    expect(waiting.status).toBe('healthy');
  });

  it('reads a missing language code as null rather than dropping the lane', async () => {
    const { language_code: _dropped, ...withoutLanguage } = jobRow();
    void _dropped;
    const response = await loadOperationsSocial({
      config: CONFIGURED,
      now: NOW,
      createClient: stub({
        social_publish_jobs: { data: [withoutLanguage] },
        social_daemon_state: { data: daemonRow() },
        social_waiting_media: { count: 0 },
      }),
    });

    expect(response.jobs[0]?.languageCode).toBeNull();
  });

  it('reports an unreadable view with a missing message without inventing one', () => {
    const response: OperationsSocialResponse = {
      generatedAt: NOW.toISOString(),
      daemon: {
        status: 'healthy',
        owner: 'laptop-jst',
        daemonVersion: null,
        firstStartedAt: null,
        lastTickStartedAt: NOW.toISOString(),
        lastTickCompletedAt: null,
        lastSuccessAt: null,
        lastError: null,
        staleMinutes: 1,
      },
      jobs: [],
      waitingMedia: {
        lanes: null,
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

    const waiting = find(
      deriveSocialSignals(response, NOW),
      'social-queue:waiting-media/episodes',
    );
    expect(waiting.status).toBe('unknown');
    expect(waiting.detail).toContain('could not be read');
  });

  it('counts a single waiting-media parse failure with the singular noun', () => {
    const response: OperationsSocialResponse = {
      generatedAt: NOW.toISOString(),
      daemon: {
        status: 'healthy',
        owner: null,
        daemonVersion: null,
        firstStartedAt: null,
        lastTickStartedAt: NOW.toISOString(),
        lastTickCompletedAt: null,
        lastSuccessAt: null,
        lastError: null,
        staleMinutes: 1,
      },
      jobs: [],
      waitingMedia: {
        lanes: 2,
        rowsRead: 2,
        oldestWaitingSince: '2026-08-26T11:00:00.000Z',
        oldestEpisodeId: 'episode-old',
        oldestLanguageCode: 'ja',
        blockedLanes: 0,
        invalidRows: 1,
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
    expect(waiting.detail).toContain('1 waiting-media row failed to parse');
  });
});
