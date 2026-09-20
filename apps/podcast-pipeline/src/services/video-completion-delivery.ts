import { toError } from '../lib/errorMessage.js';
import {
  getPipelineSupabase,
  type PipelineSupabaseClient,
  throwSupabaseError,
} from './supabase-client.js';

export const VIDEO_COMPLETION_MARK_RPC =
  'mark_episode_video_completion_group_notified';

const HEADLINE = '🎬 三語影片完成：🇹🇼 繁中・🇯🇵 日文・🇺🇸 英文';

const EPISODE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export interface VideoCompletionDelivery {
  episodeId: string;
}

interface DeliveryLogger {
  error(message: string, details?: unknown): void;
}

export function parseVideoCompletionDelivery(
  text: string,
): VideoCompletionDelivery | null {
  const [headline, rawUrl, ...extra] = text.trim().split(/\r?\n/u);
  if (headline !== HEADLINE || !rawUrl || extra.length > 0) return null;

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  const match = /\/e\/([^/]+)$/u.exec(url.pathname);
  const episodeId = match?.[1] ? decodeURIComponent(match[1]) : '';
  if (!EPISODE_ID_PATTERN.test(episodeId)) return null;
  return { episodeId };
}

export async function recordVideoCompletionDelivery(
  text: string,
  options: { supabase?: PipelineSupabaseClient; logger?: DeliveryLogger } = {},
): Promise<void> {
  const delivery = parseVideoCompletionDelivery(text);
  if (!delivery) return;

  try {
    const supabase = options.supabase ?? getPipelineSupabase();
    const { error } = await supabase.rpc(VIDEO_COMPLETION_MARK_RPC, {
      p_episode_id: delivery.episodeId,
    });
    if (error) {
      throwSupabaseError(error);
    }
  } catch (error) {
    (options.logger ?? console).error(
      '[telegram] failed to record grouped video completion notification delivery',
      toError(error),
    );
  }
}
