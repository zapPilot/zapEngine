import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PipelineSupabaseClient } from './supabase-client.js';

const mocks = vi.hoisted(() => ({
  getPipelineSupabase: vi.fn(),
  sendMessage: vi.fn(),
}));

vi.mock('./supabase-client.js', async () => {
  const actual = await vi.importActual<typeof import('./supabase-client.js')>(
    './supabase-client.js',
  );
  return { ...actual, getPipelineSupabase: mocks.getPipelineSupabase };
});

vi.mock('./telegram.js', async () => {
  const actual =
    await vi.importActual<typeof import('./telegram.js')>('./telegram.js');
  return { ...actual, sendMessage: mocks.sendMessage };
});

import {
  createVideoVisualFailureNotifier,
  VISUAL_FAILURE_NOTICE_RPC,
} from './video-visual-failure-notifier.js';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sendMessage.mockResolvedValue(undefined);
});

describe('video visual failure notifier coverage', () => {
  it('uses defaults and reports a successful delivery whose stamp changed no row', async () => {
    const rpc = vi.fn(async (name: string) => {
      if (name === VISUAL_FAILURE_NOTICE_RPC) {
        return {
          data: [
            {
              episode_id: 'episode-default',
              telegram_chat_id: 'chat-default',
              last_error: null,
            },
          ],
          error: null,
        };
      }
      return { data: false, error: null };
    });
    mocks.getPipelineSupabase.mockReturnValue({ rpc });
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    try {
      const notifier = createVideoVisualFailureNotifier();
      await notifier.sweep();

      expect(mocks.getPipelineSupabase).toHaveBeenCalledTimes(1);
      expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
      expect(error).toHaveBeenCalledWith(
        '[video-worker] visual failure notification stamp changed no row',
      );
    } finally {
      error.mockRestore();
    }
  });

  it('logs reap failures and ignores malformed or incomplete rows', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: { message: 'rpc failed' } })
      .mockResolvedValueOnce({ data: { unexpected: true }, error: null })
      .mockResolvedValueOnce({
        data: [
          { episode_id: null, telegram_chat_id: 'chat', last_error: null },
          { episode_id: 'episode', telegram_chat_id: null, last_error: null },
        ],
        error: null,
      });
    const logger = { error: vi.fn() };
    const notify = vi.fn();
    const notifier = createVideoVisualFailureNotifier({
      supabase: { rpc } as unknown as PipelineSupabaseClient,
      notify,
      logger,
    });

    await notifier.sweep();
    await notifier.sweep();
    await notifier.sweep();

    expect(logger.error).toHaveBeenCalledWith(
      '[video-worker] failed to reap visual failure notifications',
      expect.objectContaining({ message: 'rpc failed' }),
    );
    expect(notify).not.toHaveBeenCalled();
  });
});
