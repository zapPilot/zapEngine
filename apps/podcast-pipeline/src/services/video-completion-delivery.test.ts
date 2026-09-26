import { describe, expect, it, vi } from 'vitest';

import type { PipelineSupabaseClient } from './supabase-client.js';
import {
  parseVideoCompletionDelivery,
  recordVideoCompletionDelivery,
  VIDEO_COMPLETION_MARK_RPC,
} from './video-completion-delivery.js';

const episodeId = '78c0a4f6-3e10-49de-ae0d-985e2b42b460';
const completionMessage = `🎬 三語影片完成：🇹🇼 繁中・🇯🇵 日文・🇺🇸 英文\nhttps://link.zap-pilot.org/e/${episodeId}?lang=zh-Hant`;

describe('grouped video completion delivery acknowledgement', () => {
  it('parses the episode-level completion message', () => {
    expect(parseVideoCompletionDelivery(completionMessage)).toEqual({
      episodeId,
    });
  });

  it('ignores legacy per-language and unrelated Telegram messages', () => {
    expect(
      parseVideoCompletionDelivery(
        `🎬 🇺🇸 英文影片完成\nhttps://link.zap-pilot.org/e/${episodeId}?lang=en`,
      ),
    ).toBeNull();
    expect(parseVideoCompletionDelivery('收到，開始處理文章。')).toBeNull();
  });

  it('stamps every completed language row for the episode after delivery', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    const supabase = { rpc } as unknown as PipelineSupabaseClient;

    await recordVideoCompletionDelivery(completionMessage, { supabase });

    expect(rpc).toHaveBeenCalledWith(VIDEO_COMPLETION_MARK_RPC, {
      p_episode_id: episodeId,
    });
  });

  it('never turns a delivered Telegram message into a failure when stamping fails', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: '500', message: 'database unavailable' },
    });
    const logger = { error: vi.fn() };

    await expect(
      recordVideoCompletionDelivery(completionMessage, {
        supabase: { rpc } as unknown as PipelineSupabaseClient,
        logger,
      }),
    ).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledOnce();
  });
});
