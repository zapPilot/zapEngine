import { EPISODE_VIDEO_VISUAL_VERSION } from '@zapengine/types/shared';

import type {
  PodcastPipelineEpisode,
  PodcastPipelineJobState,
  PodcastPipelineLocalization,
  PodcastPipelineRenderState,
  PodcastPipelineResponse,
  PodcastPipelineStatus,
  PodcastPipelineVisualDebug,
} from '../../shared/podcast-pipeline.js';
import type { ControlCenterConfig } from '../config/env.js';
import { createServiceRoleClient } from './supabase.js';

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

interface LifecycleRow {
  status: string;
  attempt_count: number;
  lease_expires_at: string | null;
  last_error: string | null;
  updated_at: string;
  progress_percent?: number | null;
  progress_stage?: string | null;
}

interface IngestRow extends LifecycleRow {
  source_url: string;
}

interface VisualRow extends LifecycleRow {
  episode_id: string;
  visual_payload: Record<string, unknown> | null;
}

interface RenderRow extends LifecycleRow {
  episode_localization_id: string;
  episode_id: string;
}

export function createPodcastPipelineService(input: {
  config: ControlCenterConfig;
}) {
  const configured = Boolean(
    input.config.SUPABASE_URL && input.config.SUPABASE_SERVICE_ROLE_KEY,
  );

  const client = configured
    ? createServiceRoleClient(
        input.config.SUPABASE_URL!,
        input.config.SUPABASE_SERVICE_ROLE_KEY!,
        input.config.SUPABASE_DB_SCHEMA,
      )
    : null;

  return {
    async getPipeline(): Promise<PodcastPipelineResponse> {
      const generatedAt = new Date().toISOString();
      if (!client) {
        return unconfiguredPipeline(generatedAt);
      }

      try {
        const { data: episodeData, error: episodeError } = await client
          .from('episodes')
          .select('id,source_title,source_url,created_at')
          .order('created_at', { ascending: false })
          .limit(EPISODE_LIMIT);
        if (episodeError) {
          throw episodeError;
        }

        const episodes = (episodeData ?? []) as EpisodeRow[];
        if (episodes.length === 0) {
          return emptyPipeline(generatedAt);
        }

        const episodeIds = episodes.map(({ id }) => id);
        const sourceUrls = [
          ...new Set(episodes.map(({ source_url }) => source_url)),
        ];
        const [
          ingestsResult,
          localizationsResult,
          visualsResult,
          rendersResult,
        ] = await Promise.all([
          client
            .from('podcast_ingest_jobs')
            .select(
              'source_url,status,attempt_count,lease_expires_at,last_error,updated_at',
            )
            .in('source_url', sourceUrls),
          client
            .from('episode_localizations')
            .select(
              'id,episode_id,language_code,status,script,hls_url,classroom_hls_url,updated_at',
            )
            .in('episode_id', episodeIds),
          client
            .from('episode_video_visuals')
            .select(
              'episode_id,status,progress_percent,progress_stage,attempt_count,lease_expires_at,last_error,visual_payload,updated_at',
            )
            .in('episode_id', episodeIds),
          client
            .from('episode_videos')
            .select(
              'episode_localization_id,episode_id,status,progress_percent,progress_stage,attempt_count,lease_expires_at,last_error,updated_at',
            )
            .in('episode_id', episodeIds),
        ]);

        const queryError = [
          ingestsResult.error,
          localizationsResult.error,
          visualsResult.error,
          rendersResult.error,
        ].find((error) => error !== null);
        if (queryError) {
          throw queryError;
        }

        return {
          generatedAt,
          status: 'ok',
          message: null,
          episodes: summarizePodcastPipeline(
            episodes,
            (ingestsResult.data ?? []) as IngestRow[],
            (localizationsResult.data ?? []) as LocalizationRow[],
            (visualsResult.data ?? []) as VisualRow[],
            (rendersResult.data ?? []) as RenderRow[],
            new Date(),
          ),
        };
      } catch (cause) {
        return failedPipeline(generatedAt, cause);
      }
    },

    async restartVideo(episodeId: string): Promise<void> {
      if (!client) {
        throw new Error('Supabase podcast pipeline is not connected');
      }
      // Both claim RPCs fence on visual_version, so a requeue that does not
      // stamp the version the deployed workers pass is never claimed again.
      const { data, error } = await client.rpc(
        'retry_episode_video_generation',
        {
          p_episode_id: episodeId,
          p_visual_version: EPISODE_VIDEO_VISUAL_VERSION,
        },
      );
      if (error) {
        throw error;
      }
      if (data !== true) {
        throw new Error('Video retry changed no episode');
      }
    },
  };
}

export function summarizePodcastPipeline(
  episodes: EpisodeRow[],
  ingestRows: IngestRow[],
  localizationRows: LocalizationRow[],
  visualRows: VisualRow[],
  renderRows: RenderRow[],
  now: Date,
): PodcastPipelineEpisode[] {
  const latestIngestBySourceUrl = latestRowBy(
    ingestRows,
    (row) => row.source_url,
    (row) => row.updated_at,
  );
  const localizationsByEpisode = groupBy(
    localizationRows,
    (row) => row.episode_id,
  );
  const visualByEpisode = new Map(
    visualRows.map((row) => [row.episode_id, row]),
  );
  const rendersByEpisode = groupBy(renderRows, (row) => row.episode_id);

  return episodes.map((episode) => {
    const ingestRow = latestIngestBySourceUrl.get(episode.source_url) ?? null;
    const ingest = ingestRow ? jobState(ingestRow, now) : null;
    const localizationRowsForEpisode =
      localizationsByEpisode.get(episode.id) ?? [];
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

    const translationStatus = applyIngestStatus(
      translationState(localizationByLanguage),
      ingest,
    );
    const ttsBaseStatus = ttsState(localizationByLanguage, translationStatus);
    const ttsStatus =
      translationStatus === 'completed'
        ? applyIngestStatus(ttsBaseStatus, ingest)
        : ttsBaseStatus;
    const visualRow = visualByEpisode.get(episode.id) ?? null;
    const visual = visualRow ? jobState(visualRow, now) : null;
    const renderByLocalizationId = new Map(
      (rendersByEpisode.get(episode.id) ?? []).map((row) => [
        row.episode_localization_id,
        row,
      ]),
    );
    const renders = LANGUAGES.flatMap((languageCode) => {
      const localization = localizationByLanguage.get(languageCode);
      if (!localization) {
        return [];
      }
      const render = renderByLocalizationId.get(localization.id);
      return render
        ? [renderState(render, languageCode, now)]
        : [emptyRenderState(localization.id, languageCode)];
    });
    const videoStatus = videoState(visual, renders, ttsStatus);
    const currentPhase = currentPhaseFor(
      translationStatus,
      ttsStatus,
      videoStatus,
    );
    const activeVideoLease = [visual, ...renders].some(
      (job) =>
        job?.status === 'processing' && leaseIsActive(job.leaseExpiresAt, now),
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
      ingest,
      localizations,
      visual,
      visualDebug: visualSearchDebug(visualRow?.visual_payload ?? null),
      renders,
      // `renders` carries one entry per audio-complete language, and a language
      // with no `episode_videos` row is synthesised as 'pending'. The retry RPC
      // only updates existing rows, so those episodes -- legacy single-language
      // renders, and partial enqueues -- can never be repaired by it. Offering
      // the button there produces a 409 that claims the video is already
      // completed while this same view shows it queued.
      canRestartVideo:
        ttsStatus === 'completed' &&
        visual !== null &&
        videoStatus !== 'completed' &&
        !activeVideoLease &&
        renders.length === LANGUAGES.length &&
        renders.every(({ updatedAt }) => updatedAt !== null),
    };
  });
}

function visualSearchDebug(
  payload: Record<string, unknown> | null,
): PodcastPipelineVisualDebug | null {
  if (!payload) return null;
  const catalog = asRecord(payload['subjectCatalog']);
  const rawSubjects = Array.isArray(catalog?.['subjects'])
    ? catalog['subjects']
    : [];
  const subjects = rawSubjects.flatMap((value) => {
    const subject = asRecord(value);
    const id = subject?.['id'];
    const name = subject?.['canonicalName'];
    return typeof id === 'string' && typeof name === 'string'
      ? [{ id, name }]
      : [];
  });
  const primarySubjectId = catalog?.['primarySubjectId'];
  const primarySubject =
    typeof primarySubjectId === 'string'
      ? (subjects.find(({ id }) => id === primarySubjectId)?.name ??
        primarySubjectId)
      : null;

  const debugQueries = parsePlannedQueries(payload['plannedQueries']);
  const storyboard = asRecord(payload['storyboard']);
  const completedQueries =
    debugQueries.length > 0
      ? []
      : parseStoryboardQueries(storyboard?.['scenes']);
  const plannedQueries =
    debugQueries.length > 0 ? debugQueries : completedQueries;
  const actualSearches = parseActualSearches(payload['searchTrace']);
  if (
    subjects.length === 0 &&
    plannedQueries.length === 0 &&
    actualSearches.length === 0
  ) {
    return null;
  }

  return {
    phase: typeof payload['phase'] === 'string' ? payload['phase'] : null,
    primarySubject,
    subjects,
    plannedQueries,
    actualSearches,
  };
}

function parsePlannedQueries(
  value: unknown,
): PodcastPipelineVisualDebug['plannedQueries'] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const row = asRecord(entry);
    const sceneId = row?.['sceneId'];
    if (typeof sceneId !== 'string') return [];
    const subjectIds = stringArray(row['subjectIds']);
    const queries = stringArray(row['queries']);
    if (queries.length === 0) return [];
    return [
      {
        sceneId,
        subjectIds,
        selectionReason:
          typeof row['selectionReason'] === 'string'
            ? row['selectionReason']
            : null,
        queries,
      },
    ];
  });
}

function parseStoryboardQueries(
  value: unknown,
): PodcastPipelineVisualDebug['plannedQueries'] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const row = asRecord(entry);
    const sceneId = row?.['sceneId'];
    if (typeof sceneId !== 'string') return [];
    const queries = stringArray(row['imageSearchIntent']);
    if (queries.length === 0) return [];
    return [
      {
        sceneId,
        subjectIds: [],
        selectionReason: null,
        queries,
      },
    ];
  });
}

function parseActualSearches(
  value: unknown,
): PodcastPipelineVisualDebug['actualSearches'] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const row = asRecord(entry);
    const sceneId = row?.['sceneId'];
    const provider = row?.['provider'];
    const query = row?.['intent'];
    if (
      typeof sceneId !== 'string' ||
      !isImageSearchProvider(provider) ||
      typeof query !== 'string'
    ) {
      return [];
    }
    return [
      {
        sceneId,
        provider,
        query,
        returned: numericCount(row['returned']),
        accepted: numericCount(row['accepted']),
        entityFiltered: numericCount(row['entityFiltered']),
        rejected: numericCount(row['rejected']),
      },
    ];
  });
}

function isImageSearchProvider(
  value: unknown,
): value is 'pexels' | 'pixabay' | 'brave' {
  return value === 'pexels' || value === 'pixabay' || value === 'brave';
}

function numericCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, value)
    : 0;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
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
    if (!row || row.status !== 'completed' || !row.hls_url.trim()) {
      return false;
    }
    return language !== 'zh-Hant' || Boolean(row.classroom_hls_url?.trim());
  });
  if (completed) {
    return 'completed';
  }
  return translationStatus === 'completed' ? 'processing' : 'pending';
}

function applyIngestStatus(
  base: PodcastPipelineStatus,
  ingest: PodcastPipelineJobState | null,
): PodcastPipelineStatus {
  if (base === 'completed' || !ingest) {
    return base;
  }
  if (ingest.status === 'failed' || ingest.status === 'stuck') {
    return ingest.status;
  }
  if (base === 'pending' && ingest.status === 'queued') {
    return 'queued';
  }
  if (base === 'pending' && ingest.status === 'processing') {
    return 'processing';
  }
  return base;
}

function videoState(
  visual: PodcastPipelineJobState | null,
  renders: PodcastPipelineRenderState[],
  ttsStatus: PodcastPipelineStatus,
): PodcastPipelineStatus {
  if (ttsStatus !== 'completed') {
    return 'pending';
  }
  if (
    visual?.status === 'failed' ||
    renders.some(({ status }) => status === 'failed')
  ) {
    return 'failed';
  }
  if (
    visual?.status === 'stuck' ||
    renders.some(({ status }) => status === 'stuck')
  ) {
    return 'stuck';
  }
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

function currentPhaseFor(
  translationStatus: PodcastPipelineStatus,
  ttsStatus: PodcastPipelineStatus,
  videoStatus: PodcastPipelineStatus,
): PodcastPipelineEpisode['currentPhase'] {
  if (translationStatus !== 'completed') {
    return 'translation';
  }
  if (ttsStatus !== 'completed') {
    return 'tts';
  }
  return videoStatus === 'completed' ? 'done' : 'video';
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

function jobState(row: LifecycleRow, now: Date): PodcastPipelineJobState {
  return {
    status: normalizeJobStatus(row.status, row.lease_expires_at, now),
    progressPercent: row.progress_percent ?? null,
    stage: row.progress_stage ?? null,
    attempts: row.attempt_count,
    lastError: row.last_error,
    leaseExpiresAt: row.lease_expires_at,
    updatedAt: row.updated_at,
  };
}

function renderState(
  row: RenderRow,
  languageCode: LanguageCode,
  now: Date,
): PodcastPipelineRenderState {
  return {
    ...jobState(row, now),
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

function normalizeJobStatus(
  status: string,
  leaseExpiresAt: string | null,
  now: Date,
): PodcastPipelineStatus {
  if (
    status === 'processing' &&
    leaseExpiresAt !== null &&
    !leaseIsActive(leaseExpiresAt, now)
  ) {
    return 'stuck';
  }
  if (status === 'queued' || status === 'processing') {
    return status;
  }
  if (status === 'completed' || status === 'failed') {
    return status;
  }
  return 'pending';
}

function leaseIsActive(value: string | null, now: Date): boolean {
  if (!value) {
    return false;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp > now.getTime();
}

function isLanguage(value: string): value is LanguageCode {
  return (LANGUAGES as readonly string[]).includes(value);
}

function groupBy<T, K>(rows: readonly T[], keyOf: (row: T) => K): Map<K, T[]> {
  const grouped = new Map<K, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const existing = grouped.get(key) ?? [];
    existing.push(row);
    grouped.set(key, existing);
  }
  return grouped;
}

function latestRowBy<T, K>(
  rows: readonly T[],
  keyOf: (row: T) => K,
  timestampOf: (row: T) => string,
): Map<K, T> {
  const latest = new Map<K, T>();
  for (const row of rows) {
    const key = keyOf(row);
    const current = latest.get(key);
    if (!current || timestampOf(row) > timestampOf(current)) {
      latest.set(key, row);
    }
  }
  return latest;
}

function unconfiguredPipeline(generatedAt: string): PodcastPipelineResponse {
  return {
    generatedAt,
    status: 'unconfigured',
    message: 'Supabase podcast pipeline is not connected',
    episodes: [],
  };
}

function emptyPipeline(generatedAt: string): PodcastPipelineResponse {
  return { generatedAt, status: 'ok', message: null, episodes: [] };
}

function failedPipeline(
  generatedAt: string,
  cause: unknown,
): PodcastPipelineResponse {
  const message =
    cause instanceof Error
      ? cause.message
      : 'Podcast pipeline state unavailable';
  return { generatedAt, status: 'error', message, episodes: [] };
}
