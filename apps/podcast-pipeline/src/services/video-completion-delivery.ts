import { toError } from '../lib/errorMessage.js';
import type { LanguageClassroomLanguageCode } from '../types.js';
import {
  getPipelineSupabase,
  isMissingSupabaseRpc,
  type PipelineSupabaseClient,
  throwSupabaseError,
} from './supabase-client.js';

export const VIDEO_COMPLETION_MARK_RPC = 'mark_episode_video_completion_notified';

const HEADLINES: Record<LanguageClassroomLanguageCode, string> = {
  'zh-Hant': '🎬 🇹🇼 繁中影片完成',
  ja: '🎬 🇯🇵 日文影片完成',
  en: '🎬 🇺🇸 英文影片完成',
};

export interface VideoCompletionDelivery {
  episodeId: string;
  languageCode: LanguageClassroomLanguageCode;
}

interface DeliveryLogger {
  error(message: string, details?: unknown): void;
}

export function parseVideoCompletionDelivery(text: string): VideoCompletionDelivery | null {
  const [headline, rawUrl, ...extra] = text.trim().split(/\r?\n/u);
  if (!headline || !rawUrl || extra.length > 0) return null;

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  const languageCode = url.searchParams.get('lang');
  if (languageCode !== 'zh-Hant' && languageCode !== 'ja' && languageCode !== 'en') {
    return null;
  }
  if (headline !== HEADLINES[languageCode]) return null;

  const match = /\/e\/([0-9a-f-]+)$/iu.exec(url.pathname);
  if (!match?.[1]) return null;
  return { episodeId: match[1], languageCode };
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
      p_language_code: delivery.languageCode,
    });
    if (error) {
      if (isMissingSupabaseRpc(error, VIDEO_COMPLETION_MARK_RPC)) return;
      throwSupabaseError(error);
    }
  } catch (error) {
    (options.logger ?? console).error(
      '[telegram] failed to record video completion notification delivery',
      toError(error),
    );
  }
}
