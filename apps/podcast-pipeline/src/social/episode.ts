import {
  findEpisodeById,
  findEpisodeLocalizationByEpisodeId,
  listEpisodeVideoSummariesByLocalizationIds,
} from '../services/db.js';
import { isEpisodeId } from '../services/request-validation.js';
import { buildEpisodeShareUrl } from '../services/telegram.js';
import type { SocialEpisode } from './types.js';

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
  url: string;
  thumbnailUrl: string;
  durationSeconds: number;
}

const CANONICAL_LANGUAGE_CODE = 'zh-Hant';

export function parseSocialEpisodeId(value: string): string {
  const normalized = value.trim();
  if (isEpisodeId(normalized)) return normalized.toLowerCase();

  try {
    const url = new URL(normalized);
    const match = /\/e\/([^/]+)\/?$/.exec(url.pathname);
    const episodeId = match?.[1] ? decodeURIComponent(match[1]) : '';

    if (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      isEpisodeId(episodeId)
    ) {
      return episodeId.toLowerCase();
    }
  } catch {
    // The shared validation error below covers malformed URLs and path escapes.
  }

  throw new Error(
    'Invalid episode input. Expected a bare UUID or a share URL with an /e/<uuid> path.',
  );
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

  const videoUrl = input.video?.url.trim();
  const thumbnailUrl = input.video?.thumbnailUrl.trim();
  const videoDurationSeconds = input.video?.durationSeconds;
  if (
    !videoUrl ||
    !thumbnailUrl ||
    typeof videoDurationSeconds !== 'number' ||
    !Number.isFinite(videoDurationSeconds) ||
    videoDurationSeconds <= 0
  ) {
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
    episodeUrl: buildEpisodeShareUrl(input.episode.id),
    videoDurationSeconds,
    videos: { zh: videoUrl },
  };
}

export async function getSocialEpisode(
  episodeId: string,
): Promise<SocialEpisode> {
  const languageCode = CANONICAL_LANGUAGE_CODE;
  const episode = await findEpisodeById(episodeId);
  if (!episode) {
    throw new Error(`Episode ${episodeId} not found.`);
  }

  const localization = await findEpisodeLocalizationByEpisodeId(
    episodeId,
    languageCode,
  );
  if (localization?.status !== 'completed') {
    throw new Error(
      `No completed zh localization found for episode ${episodeId}. Social publishing aborted.`,
    );
  }

  const video = (
    await listEpisodeVideoSummariesByLocalizationIds([localization.id])
  ).get(localization.id)?.video;

  return buildSocialEpisode({ episode, localization, video: video ?? null });
}

function summarize(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= 800) return normalized;
  return `${normalized.slice(0, 797).trimEnd()}...`;
}
