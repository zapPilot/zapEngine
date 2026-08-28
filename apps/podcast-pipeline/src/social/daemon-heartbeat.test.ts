import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  capturePipelineException: vi.fn(),
}));

vi.mock('../services/supabase-client.js', () => ({
  getPipelineSupabase: () => ({ from: mocks.from }),
  throwSupabaseError: (error: unknown) => {
    throw error instanceof Error ? error : new Error(String(error));
  },
}));

vi.mock('../observability/sentry.js', () => ({
  capturePipelineException: mocks.capturePipelineException,
}));

import { recordSocialDaemonTick } from './daemon-heartbeat.js';
import { SOCIAL_DAEMON_STATE_ID } from './daemon-store.js';

const NOW = new Date('2026-08-28T10:00:00.000Z');
const OWNER = 'laptop:4321';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.from.mockReturnValue({ update: mocks.update });
  mocks.update.mockReturnValue({ eq: mocks.eq });
  mocks.eq.mockResolvedValue({ error: null });
});

describe('recordSocialDaemonTick', () => {
  it('stamps the tick start with the owner and daemon version', async () => {
    await recordSocialDaemonTick({ phase: 'start', now: NOW, owner: OWNER });

    expect(mocks.from).toHaveBeenCalledWith('social_daemon_state');
    expect(mocks.update).toHaveBeenCalledWith({
      last_tick_started_at: '2026-08-28T10:00:00.000Z',
      owner: OWNER,
      daemon_version: 'social-daemon-v1',
      updated_at: '2026-08-28T10:00:00.000Z',
    });
    expect(mocks.eq).toHaveBeenCalledWith('id', SOCIAL_DAEMON_STATE_ID);
  });

  it('clears the previous error when a tick succeeds', async () => {
    await recordSocialDaemonTick({ phase: 'success', now: NOW, owner: OWNER });

    expect(mocks.update).toHaveBeenCalledWith({
      last_tick_completed_at: '2026-08-28T10:00:00.000Z',
      last_success_at: '2026-08-28T10:00:00.000Z',
      last_error: null,
      updated_at: '2026-08-28T10:00:00.000Z',
    });
  });

  it('records a failed tick and truncates an oversized message', async () => {
    await recordSocialDaemonTick({
      phase: 'error',
      now: NOW,
      owner: OWNER,
      error: new Error('x'.repeat(5_000)),
    });

    const patch = mocks.update.mock.calls[0]?.[0] as {
      last_error: string;
      last_success_at?: string;
    };
    expect(patch.last_error).toBe('x'.repeat(4_000));
    expect(patch).not.toHaveProperty('last_success_at');
  });

  it('resolves and reports as a warning when the write fails', async () => {
    mocks.eq.mockResolvedValue({
      error: new Error('state row unreachable'),
    });
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    try {
      await expect(
        recordSocialDaemonTick({ phase: 'start', now: NOW, owner: OWNER }),
      ).resolves.toBeUndefined();
    } finally {
      consoleError.mockRestore();
    }

    expect(mocks.capturePipelineException).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'state row unreachable' }),
      expect.objectContaining({
        component: 'social-daemon',
        level: 'warning',
      }),
    );
  });

  it('resolves when the supabase client itself throws', async () => {
    mocks.from.mockImplementation(() => {
      throw new Error('supabase client unavailable');
    });
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    try {
      await expect(
        recordSocialDaemonTick({ phase: 'success', now: NOW, owner: OWNER }),
      ).resolves.toBeUndefined();
    } finally {
      consoleError.mockRestore();
    }

    expect(mocks.capturePipelineException).toHaveBeenCalledOnce();
  });
});
