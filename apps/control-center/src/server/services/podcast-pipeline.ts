import { createClient } from '@supabase/supabase-js';

import type {
  PodcastPipelineEpisode,
  PodcastPipelineJobState,
  PodcastPipelineLocalization,
  PodcastPipelineRenderState,
  PodcastPipelineResponse,
  PodcastPipelineStatus,
} from '../../shared/podcast-pipeline.js';
import type { ControlCenterConfig } from '../config/env.js';

const EPISODE_LIMIT = 40;
const LANGUAGES = ['zh-Hant', 'ja', 'en'] as const;
type LanguageCode = (typeof LANGUAGES)[number];

interface EpisodeRow {
  id: string;
  source_title: string | null;
  source_url: string;
  created_at: string;
}

interface LocalizationRow {
  id: string;
  episode_id: string;
  language_code: string;
  status: string;
  script: string | null;
  hls_url: string;
  classroom_hls_url: string | null;
  updated_at: string;
}

interface VisualRow {
  episode_id: string;
  status: string;
  progress_percent: number | null;
  progress_stage: string | null;
  attempt_count: number;
  lease_expires_at: string | null;
  last_error: string | null;
  updated_at: string;
}

interface RenderRow {
  episode_localization_id: string;
  episode_id: string;
  status: string;
  progress_percent: number | null;
  progress_stage: string | null;
  attempt_count: number;
  lease_expires_at: string | null;
  last_error: string | null;
  updated_at: string;
}

export function createPodcastPipelineService(input: {
  config: ControlCenterConfig;
}) {
  const configured = Boolean(
    input.config.SUPABASE_URL && input.config.SUPABASE_SERVICE_ROLE_KEY,
  );

  const client = configured
    ? createClient(
        input.config.SUPABASE_URL!,
        input.config.SUPABASE_SERVICE_ROLE_KEY!,
        {
          db: { schema: input.config.SUPABASE_DB_SCHEMA },
          auth: { autoRefreshToken: false, persistSession: false },
        },
      )
    : null;

  return {
    async getPipeline(): Promise<PodcastPipelineResponse> {
      const generatedAt = new Date().toISOString();
      if (!client) {
        return {
          generatedAt,
          status: 'unconfigured',
          message: 'Supabase podcast pipeline is not connected',
          episodes: [],
        };
      }

      try {
        const { data: episodeData, error: episodeError } = await client
          .from('episodes')
          .select('id,source_title,source_url,created_at')
          .order('created_at', { ascending: false })
          .limit(EPISODE_LIMIT);
        if (episodeError) throw episodeError;

        const episodes = (episodeData ?? []) as EpisodeRow[];
        if (episodes.length === 0) {
          return { generatedAt, status: 'ok', message: null, episodes: [] };
        }
        const episodeIds = episodes.map(({ id }) => id);
        const [localizationsResult, visualsResult, rendersResult] =
          await Promise.all([
            client
              .from('episode_localizations')
              .select(
                'id,episode_id,language_code,status,script,hls_url,classroom_hls_url,updated_at',
              )
              .in('episode_id', episodeIds),
            client
              .from('episode_video_visuals')
              .select(
                'episode_id,status,progress_percent,progress_stage,attempt_count,lease_expires_at,last_error,updated_at',
              )
              .in('episode_id', episodeIds),
            client
              .from('episode_videos')
              .select(
                'episode_localization_id,episode_id,status,progress_percent,progress_stage,attempt_count,lease_expires_at,last_error,updated_at',
              )
              .in('episode_id', episodeIds),
          ]);
        if (localizationsResult.error) throw localizationsResult.error;
        if (visualsResult.error) throw visualsResult.error;
        if (rendersResult.error) throw rendersResult.error;

        return {
          generatedAt,
          status: 'ok',
          message: null,
          episodes: summarizePodcastPipeline(
            episodes,
            (localizationsResult.data ?? []) as LocalizationRow[],
            (visualsResult.data ?? []) as VisualRow[],
            (rendersResult.data ?? []) as RenderRow[],
            new Date(),
          ),
        };
      } catch (error) {
        return {
          generatedAt,
          status: 'error',
          message:
            error instanceof Error
              ? error.message
              : 'Podcast pipeline state unavailable',
          episodes: [],
        };
      }
    },

    async restartVideo(episodeId: string): Promise<void> {
      if (!client) {
        throw new Error('Supabase podcast pipeline is not connected');
      }
      const { data, error } = await client.rpc('retry_episode_video_generation', {
        p_episode_id: episodeId,
      });
      if (error) throw error;
      if (data !== true) {
        throw new Error('Video retry changed no episode');
      }
    },
  };
}

export function summarizePodcastPipeline(
  episodes: EpisodeRow[],
  localizationRows: LocalizationRow[],
  visualRows: VisualRow[],
  renderRows: RenderRow[],
  now: Date,
): PodcastPipelineEpisode[] {
  const localizationsByEpisode = groupBy(localizationRows, (row) => row.episode_id);
  const visualByEpisode = new Map(visualRows.map((row) => [row.episode_id, row]));
  const rendersByEpisode = groupBy(renderRows, (row) => row.episode_id);

  return episodes.map((episode) => {
    const localizationRowsForEpisode = localizationsByEpisode.get(episode.id) ?? [];
    const localizationByLanguage = new Map(
      localizationRowsForEpisode.flatMap((row) =>
        isLanguage(row.language_code)
          ? [[row.language_code, row] as const]
          : [],
      ),
    );
    const localizations = LANGUAGES.flatMap((languageCode) => {
      const row = localizationByLanguage.get(languageCode);
      return row ? [localizationState(row, languageCode)] : [];
    });
    const translationStatus = translationState(localizationByLanguage);
    const ttsStatus = ttsState(localizationByLanguage, translationStatus);
    const visualRow = visualByEpisode.get(episode.id) ?? null;
    const visual = visualRow ? jobState(visualRow) : null;
    const renderByLocalizationId = new Map(
      (rendersByEpisode.get(episode.id) ?? []).map((row) => [
        row.episode_localization_id,
        row,
      ]),
    );
    const renders = LANGUAGES.flatMap((languageCode) => {
      const localization = localizationByLanguage.get(languageCode);
      if (!localization) return [];
      const render = renderByLocalizationId.get(localization.id);
      return render
        ? [renderState(render, languageCode)]
        : [emptyRenderState(localization.id, languageCode)];
    });
    const videoStatus = videoState(visual, renders, ttsStatus);
    const currentPhase =
      translationStatus !== 'completed'
        ? 'translation'
        : ttsStatus !== 'completed'
          ? 'tts'
          : videoStatus !== 'completed'
            ? 'video'
            : 'done';
    const activeVideoLease = [visual, ...renders].some(
      (job) => job?.status === 'processing' && leaseIsActive(job.leaseExpiresAt, now),
    );

    return {
      episodeId: episode.id,
      title: episode.source_title,
      sourceUrl: episode.source_url,
      createdAt: episode.created_at,
      currentPhase,
      translationStatus,
      ttsStatus,
      videoStatus,
      localizations,
      visual,
      renders,
      canRestartVideo: ttsStatus === 'completed' && !activeVideoLease,
    };
  });
}

function translationState(
  rows: ReadonlyMap<LanguageCode, LocalizationRow>,
): PodcastPipelineStatus {
  if (
    LANGUAGES.every((language) => Boolean(rows.get(language)?.script?.trim()))
  ) {
    return 'completed';
  }
  return rows.size > 0 ? 'processing' : 'pending';
}

function ttsState(
  rows: ReadonlyMap<LanguageCode, LocalizationRow>,
  translationStatus: PodcastPipelineStatus,
): PodcastPipelineStatus {
  const completed = LANGUAGES.every((language) => {
    const row = rows.get(language);
    if (!row || row.status !== 'completed' || !row.hls_url.trim()) return false;
    return language !== 'zh-Hant' || Boolean(row.classroom_hls_url?.trim());
  });
  if (completed) return 'completed';
  return translationStatus === 'completed' ? 'processing' : 'pending';
}

function videoState(
  visual: PodcastPipelineJobState | null,
  renders: PodcastPipelineRenderState[],
  ttsStatus: PodcastPipelineStatus,
): PodcastPipelineStatus {
  if (ttsStatus !== 'completed') return 'pending';
  if (visual?.status === 'failed') return 'failed';
  if (renders.some(({ status }) => status === 'failed')) return 'failed';
  if (
    renders.length === LANGUAGES.length &&
    renders.every(({ status }) => status === 'completed')
  ) {
    return 'completed';
  }
  if (
    visual?.status === 'processing' ||
    renders.some(({ status }) => status === 'processing')
  ) {
    return 'processing';
  }
  return visual || renders.length > 0 ? 'queued' : 'pending';
}

function localizationState(
  row: LocalizationRow,
  languageCode: LanguageCode,
): PodcastPipelineLocalization {
  return {
    languageCode,
    status: row.status,
    hasScript: Boolean(row.script?.trim()),
    hasAudio:
      Boolean(row.hls_url.trim()) &&
      (languageCode !== 'zh-Hant' || Boolean(row.classroom_hls_url?.trim())),
    updatedAt: row.updated_at,
  };
}

function jobState(row: VisualRow): PodcastPipelineJobState {
  return {
    status: normalizeJobStatus(row.status),
    progressPercent: row.progress_percent,
    stage: row.progress_stage,
    attempts: row.attempt_count,
    lastError: row.last_error,
    leaseExpiresAt: row.lease_expires_at,
    updatedAt: row.updated_at,
  };
}

function renderState(
  row: RenderRow,
  languageCode: LanguageCode,
): PodcastPipelineRenderState {
  return {
    ...jobState(row),
    localizationId: row.episode_localization_id,
    languageCode,
  };
}

function emptyRenderState(
  localizationId: string,
  languageCode: LanguageCode,
): PodcastPipelineRenderState {
  return {
    localizationId,
    languageCode,
    status: 'pending',
    progressPercent: null,
    stage: null,
    attempts: 0,
    lastError: null,
    leaseExpiresAt: null,
    updatedAt: null,
  };
}

function normalizeJobStatus(status: string): PodcastPipelineStatus {
  return ['queued', 'processing', 'completed', 'failed'].includes(status)
    ? (status as PodcastPipelineStatus)
    : 'pending';
}

function leaseIsActive(value: string | null, now: Date): boolean {
  if (!value) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp > now.getTime();
}

function isLanguage(value: string): value is LanguageCode {
  return (LANGUAGES as readonly string[]).includes(value);
}

function groupBy<T, K>(
  rows: readonly T[],
  keyOf: (row: T) => K,
): Map<K, T[]> {
  const grouped = new Map<K, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const existing = grouped.get(key) ?? [];
    existing.push(row);
    grouped.set(key, existing);
  }
  return grouped;
}
