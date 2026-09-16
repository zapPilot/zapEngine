import { beforeEach, describe, expect, it, vi } from 'vitest';

import { readControlCenterConfig } from '../config/env.js';

const configuredClient = vi.hoisted(() => ({ current: null as unknown }));

vi.mock('./supabase.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./supabase.js')>();
  return {
    ...actual,
    createConfiguredServiceRoleClient: vi.fn(() => configuredClient.current),
  };
});

import {
  CONTROL_CENTER_ABANDON_REASON,
  createPodcastAbandonService,
} from './podcast-abandon.js';

const EPISODE_ID = '826f4b87-6278-4275-bff5-535ba5ef438d';
const NOW = new Date('2026-09-05T06:00:00.000Z');

function updateChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  chain['update'] = vi.fn(() => chain);
  chain['eq'] = vi.fn(() => chain);
  chain['is'] = vi.fn(() => chain);
  chain['select'] = vi.fn(() => Promise.resolve(result));
  return chain;
}

function selectChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  chain['select'] = vi.fn(() => chain);
  chain['eq'] = vi.fn(() => chain);
  chain['limit'] = vi.fn(() => Promise.resolve(result));
  return chain;
}

describe('podcast abandon service', () => {
  beforeEach(() => {
    configuredClient.current = null;
    vi.clearAllMocks();
  });

  it('throws when Supabase is not connected', async () => {
    configuredClient.current = null;
    const svc = createPodcastAbandonService({
      config: readControlCenterConfig({}),
    });

    await expect(svc.abandonVideo(EPISODE_ID)).rejects.toThrow(
      'Supabase podcast pipeline is not connected',
    );
  });

  it('throws the update error without a follow-up read', async () => {
    const updateError = { message: 'update boom', code: 'XX000' };
    const select = vi.fn();
    configuredClient.current = {
      from: vi.fn(() => updateChain({ data: null, error: updateError })),
    };
    const svc = createPodcastAbandonService({
      config: readControlCenterConfig({
        SUPABASE_URL: 'https://x.co',
        SUPABASE_SERVICE_ROLE_KEY: 'k',
      }),
      now: () => NOW,
    });

    await expect(svc.abandonVideo(EPISODE_ID)).rejects.toBe(updateError);
    expect(select).not.toHaveBeenCalled();
  });

  it('returns on the first write and stamps the operator reason', async () => {
    const update = updateChain({
      data: [{ episode_id: EPISODE_ID }],
      error: null,
    });
    configuredClient.current = { from: vi.fn(() => update) };
    const svc = createPodcastAbandonService({
      config: readControlCenterConfig({
        SUPABASE_URL: 'https://x.co',
        SUPABASE_SERVICE_ROLE_KEY: 'k',
      }),
      now: () => NOW,
    });

    await expect(svc.abandonVideo(EPISODE_ID)).resolves.toBeUndefined();
    expect(update['update']).toHaveBeenCalledWith({
      abandoned_at: NOW.toISOString(),
      abandoned_reason: CONTROL_CENTER_ABANDON_REASON,
    });
  });

  it('treats an already-abandoned row as idempotent', async () => {
    const from = vi.fn((table: string) => {
      if (table === 'episode_video_visuals') {
        // First call is the update (empty = race), second is the read.
        const call = from.mock.calls.length;
        if (call === 1) {
          return updateChain({ data: [], error: null });
        }
        return selectChain({
          data: [
            { episode_id: EPISODE_ID, abandoned_at: '2026-09-05T05:00:00Z' },
          ],
          error: null,
        });
      }
      throw new Error(`unexpected table ${table}`);
    });
    configuredClient.current = { from };
    const svc = createPodcastAbandonService({
      config: readControlCenterConfig({
        SUPABASE_URL: 'https://x.co',
        SUPABASE_SERVICE_ROLE_KEY: 'k',
      }),
      now: () => NOW,
    });

    await expect(svc.abandonVideo(EPISODE_ID)).resolves.toBeUndefined();
    expect(from).toHaveBeenCalledTimes(2);
  });

  it('throws the follow-up read error', async () => {
    const readError = { message: 'read boom' };
    const from = vi.fn(() => {
      if (from.mock.calls.length === 1) {
        return updateChain({ data: [], error: null });
      }
      return selectChain({ data: null, error: readError });
    });
    configuredClient.current = { from };
    const svc = createPodcastAbandonService({
      config: readControlCenterConfig({
        SUPABASE_URL: 'https://x.co',
        SUPABASE_SERVICE_ROLE_KEY: 'k',
      }),
      now: () => NOW,
    });

    await expect(svc.abandonVideo(EPISODE_ID)).rejects.toBe(readError);
  });

  it('throws 22023 when no row exists to abandon', async () => {
    const from = vi.fn(() => {
      if (from.mock.calls.length === 1) {
        return updateChain({ data: [], error: null });
      }
      return selectChain({ data: [], error: null });
    });
    configuredClient.current = { from };
    const svc = createPodcastAbandonService({
      config: readControlCenterConfig({
        SUPABASE_URL: 'https://x.co',
        SUPABASE_SERVICE_ROLE_KEY: 'k',
      }),
    });

    const error = await svc.abandonVideo(EPISODE_ID).catch((e) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(
      'Episode has no video visual job to abandon',
    );
    expect((error as { code?: string }).code).toBe('22023');
  });

  it('treats a row with null abandoned_at as missing, not idempotent', async () => {
    const from = vi.fn(() => {
      if (from.mock.calls.length === 1) {
        return updateChain({ data: null, error: null });
      }
      return selectChain({
        data: [{ episode_id: EPISODE_ID, abandoned_at: null }],
        error: null,
      });
    });
    configuredClient.current = { from };
    const svc = createPodcastAbandonService({
      config: readControlCenterConfig({
        SUPABASE_URL: 'https://x.co',
        SUPABASE_SERVICE_ROLE_KEY: 'k',
      }),
      now: () => NOW,
    });

    await expect(svc.abandonVideo(EPISODE_ID)).rejects.toMatchObject({
      code: '22023',
    });
  });
});
