import { createPipelineSupabaseClient } from '../services/supabase-client.js';
import type { SocialEpisode, SocialLanguage } from './types.js';

interface EpisodeProjection {
  id: string;
  source_url: string;
  source_title: string | null;
  created_at: string;
}

interface LocalizationProjection {
  id: string;
  episode_id: string;
  language_code: string;
  title: string;
  raw_text: string | null;
  script: string | null;
  status: string;
}

interface VideoProjection {
  status: string;
  mp4_url: string | null;
}

const SHARE_BASE_URL = 'https://from-fed-to-chain-api.fly.dev';
const CANONICAL_LANGUAGE_CODE = 'zh-Hant';

export function toPrimaryLanguageCode(language: SocialLanguage): string {
  if (language !== 'zh') {
    throw new Error(`Unsupported social language: ${language}`);
  }
  return CANONICAL_LANGUAGE_CODE;
}

export function buildSocialEpisode(input: {
  episode: EpisodeProjection;
  localization: LocalizationProjection;
  video: VideoProjection | null;
}): SocialEpisode {
  const transcript = input.localization.script?.trim() ?? '';
  if (!transcript) {
    throw new Error(
      `Episode ${input.episode.id} has no completed zh transcript. Social publishing aborted.`,
    );
  }

  const videoUrl =
    input.video?.status === 'completed' ? input.video.mp4_url?.trim() : '';
  if (!videoUrl) {
    throw new Error(
      `No completed zh video found for episode ${input.episode.id}. Social publishing aborted.`,
    );
  }

  const description = input.localization.raw_text?.trim() || undefined;
  const summarySource = description ?? transcript;

  return {
    id: input.episode.id,
    title: input.localization.title.trim() || input.episode.source_title || '',
    description,
    summary: summarize(summarySource),
    transcript,
    publishedAt: input.episode.created_at,
    episodeUrl: `${SHARE_BASE_URL}/e/${encodeURIComponent(input.episode.id)}?lang=${encodeURIComponent(CANONICAL_LANGUAGE_CODE)}`,
    videos: { zh: videoUrl },
  };
}

export async function getSocialEpisode(
  episodeId: string,
  language: SocialLanguage = 'zh',
): Promise<SocialEpisode> {
  const languageCode = toPrimaryLanguageCode(language);
  const supabase = createPipelineSupabaseClient();

  const { data: episode, error: episodeError } = await supabase
    .from('episodes')
    .select('id, source_url, source_title, created_at')
    .eq('id', episodeId)
    .maybeSingle<EpisodeProjection>();

  if (episodeError) throw episodeError;
  if (!episode) {
    throw new Error(`Episode ${episodeId} not found.`);
  }

  const { data: localization, error: localizationError } = await supabase
    .from('episode_localizations')
    .select('id, episode_id, language_code, title, raw_text, script, status')
    .eq('episode_id', episodeId)
    .eq('language_code', languageCode)
    .maybeSingle<LocalizationProjection>();

  if (localizationError) throw localizationError;
  if (localization?.status !== 'completed') {
    throw new Error(
      `No completed zh localization found for episode ${episodeId}. Social publishing aborted.`,
    );
  }

  const { data: video, error: videoError } = await supabase
    .from('episode_videos')
    .select('status, mp4_url')
    .eq('episode_localization_id', localization.id)
    .maybeSingle<VideoProjection>();

  if (videoError) throw videoError;

  return buildSocialEpisode({ episode, localization, video });
}

function summarize(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= 800) return normalized;
  return `${normalized.slice(0, 797).trimEnd()}...`;
}
