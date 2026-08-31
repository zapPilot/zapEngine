import { describe, expect, it, vi } from 'vitest';

import type { PipelineSupabaseClient } from './supabase-client.js';
import { createVideoVisualFailureNotifier } from './video-visual-failure-notifier.js';

function makeSupabase(options: { stampFails?: boolean } = {}) {
  const rpc = vi.fn(async (name: string) => {
    if (name === 'reap_failed_episode_video_visual_notifications') {
      return {
        data: [
          {
            episode_id: 'episode-1',
            telegram_chat_id: 'chat-1',
            last_error: 'subject catalog exhausted retries',
          },
        ],
        error: null,
      };
    }
    if (name === 'mark_episode_video_visual_failure_notified') {
      return options.stampFails
        ? { data: null, error: new Error('database unavailable') }
        : { data: true, error: null };
    }
    throw new Error(`Unexpected RPC ${name}`);
  });
  return { rpc };
}

describe('video visual failure notifier', () => {
  it('sends a terminal visual failure and stamps it only after delivery', async () => {
    const supabase = makeSupabase();
    const notify = vi.fn().mockResolvedValue(undefined);
    const notifier = createVideoVisualFailureNotifier({
      supabase: supabase as unknown as PipelineSupabaseClient,
      notify,
      logger: { error: vi.fn() },
    });

    await notifier.sweep();

    expect(notify).toHaveBeenCalledWith(
      'chat-1',
      expect.stringContaining('原因：subject catalog exhausted retries'),
    );
    expect(supabase.rpc).toHaveBeenNthCalledWith(
      2,
      'mark_episode_video_visual_failure_notified',
      { p_episode_id: 'episode-1' },
    );
  });

  it('does not stamp when Telegram delivery fails', async () => {
    const supabase = makeSupabase();
    const notify = vi.fn().mockRejectedValue(new Error('telegram unavailable'));
    const logger = { error: vi.fn() };
    const notifier = createVideoVisualFailureNotifier({
      supabase: supabase as unknown as PipelineSupabaseClient,
      notify,
      logger,
    });

    await notifier.sweep();

    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      '[video-worker] visual failure notification not delivered; will retry',
      expect.objectContaining({ message: 'telegram unavailable' }),
    );
  });

  it('prefers a duplicate notification over losing one when stamping fails', async () => {
    const supabase = makeSupabase({ stampFails: true });
    const notify = vi.fn().mockResolvedValue(undefined);
    const logger = { error: vi.fn() };
    const notifier = createVideoVisualFailureNotifier({
      supabase: supabase as unknown as PipelineSupabaseClient,
      notify,
      logger,
    });

    await notifier.sweep();
    await notifier.sweep();

    expect(notify).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledWith(
      '[video-worker] failed to record visual failure notification',
      expect.objectContaining({ message: 'database unavailable' }),
    );
  });
});
