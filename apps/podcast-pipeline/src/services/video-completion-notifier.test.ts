import { describe, expect, it, vi } from 'vitest';

import type { PipelineSupabaseClient } from './supabase-client.js';
import {
  createVideoCompletionNotifier,
  VIDEO_COMPLETION_NOTICE_RPC,
} from './video-completion-notifier.js';

const episodeId = '78c0a4f6-3e10-49de-ae0d-985e2b42b460';

describe('video completion notifier', () => {
  it('sends one durable Telegram notification after all language videos complete', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          telegram_chat_id: '5266667564',
          episode_id: episodeId,
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
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(
      '5266667564',
      `🎬 三語影片完成：🇹🇼 繁中・🇯🇵 日文・🇺🇸 英文\nhttps://link.zap-pilot.org/e/${episodeId}?lang=zh-Hant`,
    );
  });

  it('leaves a failed grouped Telegram send for the next sweep', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          telegram_chat_id: '5266667564',
          episode_id: episodeId,
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
      '[video-completion-notifier] grouped notification not delivered; will retry',
      expect.any(Error),
    );
  });
});
