import { EPISODE_VIDEO_VISUAL_VERSION } from '@zapengine/types/shared';

import type {
  PodcastPipelineEpisode,
  PodcastPipelineIngestFailure,
  PodcastPipelineIngestState,
  PodcastPipelineJobState,
  PodcastPipelineLocalization,
  PodcastPipelineRenderState,
  PodcastPipelineResponse,
  PodcastPipelineStatus,
} from '../../shared/podcast-pipeline.js';
import type { ControlCenterConfig } from '../config/env.js';
import {
  canRestartRender,
  leaseIsActive,
  visualIsRenderable,
} from './podcast-retry-eligibility.js';
import {
  createConfiguredServiceRoleClient,
  isMissingColumnError,
} from './supabase.js';

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
  failure_history?: unknown;
}

interface LegacyIngestRunRow {
  episode_id: string | null;
  status: string;
  finished_at: string | null;
  created_at: string;
}

interface VisualRow extends LifecycleRow {
  episode_id: string;
  visual_payload: Record<string, unknown> | null;
  visual_version?: string | null;
  abandoned_at?: string | null;
  abandoned_reason?: string | null;
}

interface RenderRow extends LifecycleRow {
  episode_localization_id: string;
  episode_id: string;
  visual_version?: string | null;
}

export function createPodcastPipelineService(input: {
  config: ControlCenterConfig;
}) {
  const client = createConfiguredServiceRoleClient(input.config);

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
          legacyIngestRunsResult,
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
              'episode_id,status,progress_percent,progress_stage,attempt_count,lease_expires_at,last_error,visual_payload,visual_version,updated_at',
            )
            .in('episode_id', episodeIds),
          client
            .from('episode_videos')
            .select(
              'episode_localization_id,episode_id,status,progress_percent,progress_stage,attempt_count,lease_expires_at,last_error,visual_version,updated_at',
            )
            .in('episode_id', episodeIds),
          client
            .from('ops_pipeline_runs')
            .select('episode_id,status,finished_at,created_at')
            .eq('pipeline', 'ingest')
            .in('episode_id', episodeIds),
        ]);

        const queryError = [
          ingestsResult.error,
          localizationsResult.error,
          visualsResult.error,
          rendersResult.error,
          legacyIngestRunsResult.error,
        ].find((error) => error !== null);
        if (queryError) {
          throw queryError;
        }

        const ingestRows = (ingestsResult.data ?? []) as IngestRow[];
        const historyResult = await client
          .from('podcast_ingest_jobs')
          .select('source_url,failure_history')
          .in('source_url', sourceUrls);
        if (historyResult.error && !isMissingColumnError(historyResult.error)) {
          throw historyResult.error;
        }
        if (!historyResult.error) {
          const historyBySource = new Map(
            (
              (historyResult.data ?? []) as {
                source_url: string;
                failure_history: unknown;
              }[]
            ).map((row) => [row.source_url, row.failure_history] as const),
          );
          for (const row of ingestRows) {
            row.failure_history = historyBySource.get(row.source_url) ?? [];
          }
        }

        // Read in its own request so the page keeps rendering between the
        // Control Center deploy and the migration that adds these columns.
        const abandonResult = await client
          .from('episode_video_visuals')
          .select('episode_id,abandoned_at,abandoned_reason')
          .in('episode_id', episodeIds);
        if (abandonResult.error && !isMissingColumnError(abandonResult.error)) {
          throw abandonResult.error;
        }
        const visualRows = (visualsResult.data ?? []) as VisualRow[];
        if (!abandonResult.error) {
          const abandonByEpisode = new Map(
            (
              (abandonResult.data ?? []) as {
                episode_id: string;
                abandoned_at: string | null;
                abandoned_reason: string | null;
              }[]
            ).map((row) => [row.episode_id, row] as const),
          );
          for (const row of visualRows) {
            const abandon = abandonByEpisode.get(row.episode_id);
            row.abandoned_at = abandon?.abandoned_at ?? null;
            row.abandoned_reason = abandon?.abandoned_reason ?? null;
          }
        }

        return {
          generatedAt,
          status: 'ok',
          message: null,
          episodes: summarizePodcastPipeline(
            episodes,
            ingestRows,
            (localizationsResult.data ?? []) as LocalizationRow[],
            visualRows,
            (rendersResult.data ?? []) as RenderRow[],
            new Date(),
            (legacyIngestRunsResult.data ?? []) as LegacyIngestRunRow[],
          ),
        };
      } catch (cause) {
        return failedPipeline(generatedAt, cause);
      }
    },

    async restartIngest(episodeId: string): Promise<void> {
      if (!client) {
        throw new Error('Supabase podcast pipeline is not connected');
      }
      const { data, error } = await client.rpc('restart_podcast_ingest', {
        p_episode_id: episodeId,
        p_language_code: 'zh-Hant',
      });
      if (error) {
        throw error;
      }
      if (!data) {
        throw new Error('Ingest retry changed no episode');
      }
    },

    async restartVideo(
      episodeId: string,
      options: { forceReplan?: boolean } = {},
    ): Promise<void> {
      if (!client) {
        throw new Error('Supabase podcast pipeline is not connected');
      }
      const parameters: Record<string, unknown> = {
        p_episode_id: episodeId,
        p_visual_version: EPISODE_VIDEO_VISUAL_VERSION,
      };
      // Omitting the new parameter on the ordinary retry keeps this call
      // resolvable while code is deployed before the migration.
      if (options.forceReplan === true) {
        parameters['p_force_replan'] = true;
      }
      const { data, error } = await client.rpc(
        'retry_episode_video_generation',
        parameters,
      );
      if (error) {
        throw error;
      }
      if (data !== true) {
        throw new Error('Video retry changed no episode');
      }
    },

    async restartRender(
      episodeId: string,
      localizationId: string,
    ): Promise<void> {
      if (!client) {
        throw new Error('Supabase podcast pipeline is not connected');
      }
      const { data, error } = await client.rpc('retry_episode_video_render', {
        p_episode_id: episodeId,
        p_episode_localization_id: localizationId,
        p_visual_version: EPISODE_VIDEO_VISUAL_VERSION,
      });
      if (error) {
        throw error;
      }
      if (data !== true) {
        throw new Error('Render retry changed no episode');
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
  legacyIngestRunRows: LegacyIngestRunRow[] = [],
): PodcastPipelineEpisode[] {
  const latestIngestBySourceUrl = latestRowBy(
    ingestRows,
    (row) => row.source_url,
    (row) => row.updated_at,
  );
  const latestLegacyIngestByEpisode = latestRowBy(
    legacyIngestRunRows.filter(
      (row): row is LegacyIngestRunRow & { episode_id: string } =>
        Boolean(row.episode_id),
    ),
    (row) => row.episode_id,
    (row) => row.finished_at ?? row.created_at,
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
    const legacyIngestRun = latestLegacyIngestByEpisode.get(episode.id) ?? null;
    const ingest = ingestRow
      ? ingestState(ingestRow, now)
      : legacyIngestRun
        ? legacyIngestState(legacyIngestRun, now)
        : null;
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
    const visual = visualRow ? visualJobState(visualRow, now) : null;
    const renderByLocalizationId = new Map(
      (rendersByEpisode.get(episode.id) ?? []).map((row) => [
        row.episode_localization_id,
        row,
      ]),
    );
    const abandoned = abandonState(visualRow);
    const renders = LANGUAGES.flatMap((languageCode) => {
      const localization = localizationByLanguage.get(languageCode);
      if (!localization) {
        return [];
      }
      const render = renderByLocalizationId.get(localization.id);
      const state = render
        ? renderState(render, languageCode, now, visual)
        : emptyRenderState(localization.id, languageCode, visual);
      return [abandoned ? { ...state, canRestart: false } : state];
    });
    const videoStatus = abandoned
      ? ('abandoned' as const)
      : videoState(visual, renders, ttsStatus);
    const currentPhase = currentPhaseFor(
      translationStatus,
      ttsStatus,
      videoStatus,
    );
    const activeVideoLease = [visual, ...renders].some(
      (job) =>
        job?.status === 'processing' && leaseIsActive(job.leaseExpiresAt, now),
    );
    const ingestIsActive =
      ingest?.status === 'queued' || ingest?.status === 'processing';

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
      renders,
      canRestartIngest: ttsStatus !== 'completed' && !ingestIsActive,
      canRestartVideo:
        !abandoned &&
        ttsStatus === 'completed' &&
        visual !== null &&
        videoStatus !== 'completed' &&
        !activeVideoLease,
      abandoned,
    };
  });
}

function abandonState(
  row: VisualRow | null,
): { at: string; reason: string } | null {
  const at = row?.abandoned_at;
  if (!at) {
    return null;
  }
  return { at, reason: row?.abandoned_reason?.trim() || 'No reason recorded' };
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
    visual?.status === 'stale' ||
    renders.some(({ status }) => status === 'stale')
  ) {
    return 'stale';
  }
  if (renders.some(({ status }) => status === 'unscheduled')) {
    return 'unscheduled';
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
  return videoStatus === 'completed' || videoStatus === 'abandoned'
    ? 'done'
    : 'video';
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
  const status = normalizeJobStatus(row.status, row.lease_expires_at, now);
  return {
    status,
    progressPercent:
      status === 'completed' ? null : (row.progress_percent ?? null),
    stage: status === 'completed' ? null : (row.progress_stage ?? null),
    attempts: row.attempt_count,
    lastError: row.last_error,
    leaseExpiresAt: row.lease_expires_at,
    updatedAt: row.updated_at,
  };
}

function versionedJobState(
  base: PodcastPipelineJobState,
  visualVersion: string | null | undefined,
): PodcastPipelineJobState {
  return {
    ...base,
    status: normalizeVersionedJobStatus(base.status, visualVersion),
    visualVersion: visualVersion ?? null,
  };
}

function visualJobState(row: VisualRow, now: Date): PodcastPipelineJobState {
  return versionedJobState(jobState(row, now), row.visual_version);
}

function ingestState(row: IngestRow, now: Date): PodcastPipelineIngestState {
  return {
    ...jobState(row, now),
    failureHistory: parseIngestFailureHistory(row.failure_history),
  };
}

function legacyIngestState(
  row: LegacyIngestRunRow,
  now: Date,
): PodcastPipelineIngestState {
  return {
    status: normalizeJobStatus(row.status, null, now),
    progressPercent: null,
    stage: null,
    attempts: 0,
    lastError: null,
    leaseExpiresAt: null,
    updatedAt: row.finished_at ?? row.created_at,
    failureHistory: [],
  };
}

function renderState(
  row: RenderRow,
  languageCode: LanguageCode,
  now: Date,
  visual: PodcastPipelineJobState | null,
): PodcastPipelineRenderState {
  const versioned = versionedJobState(jobState(row, now), row.visual_version);
  return {
    ...versioned,
    localizationId: row.episode_localization_id,
    languageCode,
    canRestart: canRestartRender({
      renderStatus: versioned.status,
      renderLeaseExpiresAt: versioned.leaseExpiresAt,
      visualStatus: visual?.status,
      visualVersion: visual?.visualVersion,
      now,
    }),
  };
}

function emptyRenderState(
  localizationId: string,
  languageCode: LanguageCode,
  visual: PodcastPipelineJobState | null,
): PodcastPipelineRenderState {
  return {
    localizationId,
    languageCode,
    status: 'unscheduled',
    progressPercent: null,
    stage: null,
    attempts: 0,
    lastError: null,
    leaseExpiresAt: null,
    updatedAt: null,
    visualVersion: null,
    canRestart: visualIsRenderable(visual?.status, visual?.visualVersion),
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

function normalizeVersionedJobStatus(
  status: PodcastPipelineStatus,
  visualVersion: string | null | undefined,
): PodcastPipelineStatus {
  if (status === 'failed' || status === 'completed') {
    return status;
  }
  if (
    (status === 'queued' || status === 'stuck') &&
    visualVersion &&
    visualVersion !== EPISODE_VIDEO_VISUAL_VERSION
  ) {
    return 'stale';
  }
  return status;
}

function parseIngestFailureHistory(
  value: unknown,
): PodcastPipelineIngestFailure[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return [];
    }
    const row = entry as Record<string, unknown>;
    const kind = row['kind'];
    const at = row['at'];
    const attempt = row['attempt'];
    if (
      (kind !== 'failed' && kind !== 'lease_expired' && kind !== 'requeued') ||
      typeof at !== 'string' ||
      typeof attempt !== 'number' ||
      !Number.isInteger(attempt)
    ) {
      return [];
    }
    return [
      {
        kind,
        at,
        attempt,
        owner: typeof row['owner'] === 'string' ? row['owner'] : null,
        error: typeof row['error'] === 'string' ? row['error'] : null,
      },
    ];
  });
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
