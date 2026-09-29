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
  createVideoCompletionNotifier,
  VIDEO_COMPLETION_NOTICE_RPC,
} from './video-completion-notifier.js';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sendMessage.mockResolvedValue(undefined);
});

describe('video completion notifier coverage', () => {
  it('uses the default supabase client, Telegram sender, logger, and interval', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        { episode_id: 'episode-default', telegram_chat_id: 'chat-default' },
      ],
      error: null,
    });
    mocks.getPipelineSupabase.mockReturnValue({ rpc });

    const notifier = createVideoCompletionNotifier();
    await notifier.sweep();

    expect(mocks.getPipelineSupabase).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(VIDEO_COMPLETION_NOTICE_RPC, {
      p_limit: 20,
    });
    expect(mocks.sendMessage).toHaveBeenCalledWith(
      'chat-default',
      expect.stringContaining('episode-default'),
    );
  });

  it('logs RPC failures and tolerates malformed or incomplete rows', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: null,
        error: { message: 'database unavailable' },
      })
      .mockResolvedValueOnce({ data: { unexpected: true }, error: null })
      .mockResolvedValueOnce({
        data: [
          { episode_id: null, telegram_chat_id: 'chat' },
          { episode_id: 'episode', telegram_chat_id: null },
        ],
        error: null,
      });
    const logger = { error: vi.fn() };
    const notify = vi.fn();
    const notifier = createVideoCompletionNotifier({
      supabase: { rpc } as unknown as PipelineSupabaseClient,
      notify,
      logger,
    });

    await notifier.sweep();
    await notifier.sweep();
    await notifier.sweep();

    expect(logger.error).toHaveBeenCalledWith(
      '[video-completion-notifier] failed to reap grouped completion notifications',
      expect.objectContaining({ message: 'database unavailable' }),
    );
    expect(notify).not.toHaveBeenCalled();
  });
});
