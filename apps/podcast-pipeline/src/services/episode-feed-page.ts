import { normalizeClassroomAudioTrack } from '../lib/languageClassroom.js';
import type {
  EpisodeClassroomTrackResponse,
  EpisodeFeedResponse,
  EpisodeFeedRow,
  EpisodeVideoGenerationPublicStatus,
  EpisodeVideoGenerationSummary,
  EpisodeVideoResponse,
} from '../types.js';
import {
  type Cursor,
  encodeCursor,
  MAX_LIMIT,
  toEpisodeFeedResponse,
} from './db.js';
import {
  getPipelineSupabase as getSupabase,
  throwSupabaseError,
} from './supabase-client.js';
import {
  composeEpisodeVideoProgress,
  type EpisodeVideoProgressJobState,
} from './video-progress.js';

const EPISODE_FEED_RPC = 'list_episode_feed_page_v1';

interface EpisodeFeedRpcRow extends EpisodeFeedRow {
  video_status: string | null;
  video_progress_percent: number | null;
  video_progress_stage: string | null;
  video_updated_at: string | null;
  video_mp4_url: string | null;
  video_thumbnail_url: string | null;
  video_duration_seconds: number | null;
  visual_status: string | null;
  visual_progress_percent: number | null;
  visual_progress_stage: string | null;
  visual_updated_at: string | null;
  classroom_audio: unknown;
}

export interface HydratedEpisodeFeedPage {
  items: EpisodeFeedResponse[];
  nextCursor: string | null;
}

/**
 * Loads the public feed and all list-only enrichment in one PostgREST RPC.
 *
 * Returning null is deliberately narrow: it only means the migration has not
 * reached the database yet, so a rolling deploy can keep serving through the
 * legacy multi-request path until the operator runs `supabase db push`.
 * Runtime/query failures still throw instead of silently regressing latency.
 */
export async function listHydratedEpisodeFeedPage(
  limit: number,
  cursor: Cursor | null,
  languageCode: string,
): Promise<HydratedEpisodeFeedPage | null> {
  // index.test deliberately mocks the existing db-service seam rather than
  // provisioning Supabase. This mapper has focused tests that run with a mocked
  // client under NODE_ENV=production, while the Hono contract suite keeps
  // exercising the rollout fallback.
  if (process.env['NODE_ENV'] === 'test') return null;

  const lim = Math.min(Math.max(limit | 0, 1), MAX_LIMIT);
  const { data, error } = await getSupabase().rpc(EPISODE_FEED_RPC, {
    p_limit: lim + 1,
    p_language_code: languageCode,
    p_cursor_created_at: cursor?.t ?? null,
    p_cursor_id: cursor?.i ?? null,
  });

  if (error) {
    if (isMissingFeedRpcError(error)) return null;
    throwSupabaseError(error);
  }

  const all = (data ?? []) as EpisodeFeedRpcRow[];
  const hasMore = all.length > lim;
  const pageRows = hasMore ? all.slice(0, lim) : all;
  const last = hasMore ? pageRows[pageRows.length - 1] : null;

  return {
    items: pageRows.map(toHydratedEpisodeFeedResponse),
    nextCursor: last
      ? encodeCursor({ t: last.created_at, i: last.id })
      : null,
  };
}

function toHydratedEpisodeFeedResponse(
  row: EpisodeFeedRpcRow,
): EpisodeFeedResponse {
  const feedRow = toEpisodeFeedRow(row);
  const videoSummary = toVideoSummary(row);
  const classroomAudio = Array.isArray(row.classroom_audio)
    ? row.classroom_audio
        .map(normalizeClassroomAudioTrack)
        .filter(
          (track): track is EpisodeClassroomTrackResponse => track !== null,
        )
    : [];

  return toEpisodeFeedResponse(
    feedRow,
    videoSummary?.video ?? null,
    videoSummary?.videoGeneration ?? null,
    classroomAudio,
  );
}

function toEpisodeFeedRow(row: EpisodeFeedRpcRow): EpisodeFeedRow {
  return {
    id: row.id,
    episode_id: row.episode_id,
    localization_id: row.localization_id,
    title: row.title,
    language_code: row.language_code,
    hls_url: row.hls_url,
    classroom_hls_url: row.classroom_hls_url,
    llm_model: row.llm_model,
    llm_thinking_model: row.llm_thinking_model,
    llm_provider: row.llm_provider,
    status: row.status,
    created_at: row.created_at,
  };
}

// jscpd:ignore-start -- this is the RPC projection of the same public video
// contract mapped in db.ts. Keeping the status/asset validation identical is a
// compatibility requirement; the progress math itself remains centralized in
// composeEpisodeVideoProgress rather than being copied into SQL.
function toVideoSummary(row: EpisodeFeedRpcRow): {
  video: EpisodeVideoResponse | null;
  videoGeneration: EpisodeVideoGenerationSummary;
} | null {
  if (!isPublicStatus(row.video_status)) return null;

  const videoStatus = row.video_status;
  const videoUrl = row.video_mp4_url?.trim();
  const thumbnailUrl = row.video_thumbnail_url?.trim();
  const video =
    videoStatus === 'completed' &&
    videoUrl &&
    thumbnailUrl &&
    typeof row.video_duration_seconds === 'number' &&
    Number.isFinite(row.video_duration_seconds) &&
    row.video_duration_seconds > 0
      ? {
          url: videoUrl,
          thumbnailUrl,
          durationSeconds: row.video_duration_seconds,
        }
      : null;

  const visual: EpisodeVideoProgressJobState | null = isPublicStatus(
    row.visual_status,
  )
    ? {
        status: row.visual_status,
        progressPercent: row.visual_progress_percent,
        progressStage: row.visual_progress_stage,
        updatedAt: row.visual_updated_at,
      }
    : null;
  const progress = composeEpisodeVideoProgress({
    render: {
      status: videoStatus,
      progressPercent: row.video_progress_percent,
      progressStage: row.video_progress_stage,
      updatedAt: row.video_updated_at,
    },
    visual,
  });

  return {
    video,
    videoGeneration: {
      status: videoStatus,
      updatedAt: progress.updatedAt,
      progressPercent: progress.progressPercent,
      stage: progress.stage,
    },
  };
}

function isPublicStatus(
  status: string | null,
): status is EpisodeVideoGenerationPublicStatus {
  return (
    status === 'queued' ||
    status === 'processing' ||
    status === 'completed' ||
    status === 'failed'
  );
}
// jscpd:ignore-end

function isMissingFeedRpcError(error: unknown): boolean {
  if (!error || typeof error !== 'object' || Array.isArray(error)) return false;
  const code = (error as Record<string, unknown>)['code'];
  return code === 'PGRST202' || code === '42883';
}
