import { describe, expect, it, vi } from 'vitest';

import type { PipelineSupabaseClient } from './supabase-client.js';
import {
  parseVideoCompletionDelivery,
  recordVideoCompletionDelivery,
  VIDEO_COMPLETION_MARK_RPC,
} from './video-completion-delivery.js';

const episodeId = '78c0a4f6-3e10-49de-ae0d-985e2b42b460';

describe('video completion delivery acknowledgement', () => {
  it.each([
    ['zh-Hant', '🎬 🇹🇼 繁中影片完成'],
    ['ja', '🎬 🇯🇵 日文影片完成'],
    ['en', '🎬 🇺🇸 英文影片完成'],
  ] as const)('parses the %s completion message', (languageCode, headline) => {
    expect(
      parseVideoCompletionDelivery(
        `${headline}\nhttps://from-fed-to-chain-api.fly.dev/e/${episodeId}?lang=${languageCode}`,
      ),
    ).toEqual({ episodeId, languageCode });
  });

  it('ignores unrelated Telegram messages', () => {
    expect(parseVideoCompletionDelivery('收到，開始處理文章。')).toBeNull();
  });

  it('stamps the matching episode and language after delivery', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    const supabase = { rpc } as unknown as PipelineSupabaseClient;

    await recordVideoCompletionDelivery(
      `🎬 🇺🇸 英文影片完成\nhttps://from-fed-to-chain-api.fly.dev/e/${episodeId}?lang=en`,
      { supabase },
    );

    expect(rpc).toHaveBeenCalledWith(VIDEO_COMPLETION_MARK_RPC, {
      p_episode_id: episodeId,
      p_language_code: 'en',
    });
  });

  it('never turns a delivered Telegram message into a failure when stamping fails', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: '500', message: 'database unavailable' },
    });
    const logger = { error: vi.fn() };

    await expect(
      recordVideoCompletionDelivery(
        `🎬 🇯🇵 日文影片完成\nhttps://from-fed-to-chain-api.fly.dev/e/${episodeId}?lang=ja`,
        {
          supabase: { rpc } as unknown as PipelineSupabaseClient,
          logger,
        },
      ),
    ).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledOnce();
  });
});
