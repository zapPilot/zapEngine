import { describe, expect, it, vi } from 'vitest';

import type { PipelineSupabaseClient } from './supabase-client.js';
import {
  createVideoCompletionNotifier,
  VIDEO_COMPLETION_NOTICE_RPC,
} from './video-completion-notifier.js';

const episodeId = '78c0a4f6-3e10-49de-ae0d-985e2b42b460';

describe('video completion notifier', () => {
  it('retries durable completed rows through Telegram', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          episode_localization_id: '43b4e15e-daee-400a-9911-4bd28e502948',
          telegram_chat_id: '5266667564',
          episode_id: episodeId,
          language_code: 'en',
        },
      ],
      error: null,
    });
    const notify = vi.fn().mockResolvedValue(undefined);
    const notifier = createVideoCompletionNotifier({
      supabase: { rpc } as unknown as PipelineSupabaseClient,
      notify,
    });

    await notifier.sweep();

    expect(rpc).toHaveBeenCalledWith(VIDEO_COMPLETION_NOTICE_RPC, {
      p_limit: 20,
    });
    expect(notify).toHaveBeenCalledWith(
      '5266667564',
      `🎬 🇺🇸 英文影片完成\nhttps://from-fed-to-chain-api.fly.dev/e/${episodeId}?lang=en`,
    );
  });

  it('leaves a failed Telegram send for the next sweep', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          episode_localization_id: '43b4e15e-daee-400a-9911-4bd28e502948',
          telegram_chat_id: '5266667564',
          episode_id: episodeId,
          language_code: 'en',
        },
      ],
      error: null,
    });
    const notify = vi.fn().mockRejectedValue(new Error('Telegram unavailable'));
    const logger = { error: vi.fn() };
    const notifier = createVideoCompletionNotifier({
      supabase: { rpc } as unknown as PipelineSupabaseClient,
      notify,
      logger,
    });

    await notifier.sweep();
    await notifier.sweep();

    expect(notify).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledWith(
      '[video-completion-notifier] notification not delivered; will retry',
      expect.any(Error),
    );
  });

  it('degrades quietly before the migration is available', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: 'PGRST202',
        message: `Could not find the function ${VIDEO_COMPLETION_NOTICE_RPC} in the schema cache`,
      },
    });
    const notify = vi.fn();
    const logger = { error: vi.fn() };
    const notifier = createVideoCompletionNotifier({
      supabase: { rpc } as unknown as PipelineSupabaseClient,
      notify,
      logger,
    });

    await notifier.sweep();

    expect(notify).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });
});
