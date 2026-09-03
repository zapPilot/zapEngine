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
  PodcastPipelineVisualDebug,
} from '../../shared/podcast-pipeline.js';
import type { ControlCenterConfig } from '../config/env.js';
import { record, records, stringArray } from './json.js';
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
}

interface RenderRow extends LifecycleRow {
  episode_localization_id: string;
  episode_id: string;
  visual_version?: string | null;
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
            ((historyResult.data ?? []) as { source_url: string; failure_history: unknown }[]).map(
              (row) => [row.source_url, row.failure_history] as const,
            ),
          );
          for (const row of ingestRows) {
            row.failure_history = historyBySource.get(row.source_url) ?? [];
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
            (visualsResult.data ?? []) as VisualRow[],
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
      if (error) throw error;
      if (!data) throw new Error('Ingest retry changed no episode');
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
      if (error) throw error;
      if (data !== true) throw new Error('Video retry changed no episode');
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
      if (error) throw error;
      if (data !== true) throw new Error('Render retry changed no episode');
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
    const renders = LANGUAGES.flatMap((languageCode) => {
      const localization = localizationByLanguage.get(languageCode);
      if (!localization) {
        return [];
      }
      const render = renderByLocalizationId.get(localization.id);
      return render
        ? [renderState(render, languageCode, now, visual)]
        : [emptyRenderState(localization.id, languageCode, visual)];
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
      visualDebug: visualSearchDebug(visualRow?.visual_payload ?? null),
      renders,
      canRestartIngest: ttsStatus !== 'completed' && !ingestIsActive,
      canRestartVideo:
        ttsStatus === 'completed' &&
        visual !== null &&
        videoStatus !== 'completed' &&
        !activeVideoLease,
      canForceReplanVisual:
        ttsStatus === 'completed' && visual !== null && !activeVideoLease,
    };
  });
}

function visualSearchDebug(
  payload: Record<string, unknown> | null,
): PodcastPipelineVisualDebug | null {
  if (!payload) {
    return null;
  }
  const catalog = record(payload['subjectCatalog']);
  const subjects = records(catalog?.['subjects']).flatMap((subject) => {
    const id = subject['id'];
    const name = subject['canonicalName'];
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

  // One column carries two payload shapes over a job's life. While the job
  // runs, `saveEpisodeVideoVisualDebug` writes the transient
  // `visual-search-debug-v1` checkpoint: top-level `plannedQueries` and
  // `searchTrace`. Completion overwrites it with `episodeVisualPayloadSchema`,
  // where the trace moved to `provenance.searchTrace` and the per-scene
  // queries survive only as `visualPlan.scenes[].imageSearchIntent`.
  const debugQueries = parsePlannedQueries(payload['plannedQueries']);
  // The transient rows win: they also carry the subject ids and the assignment
  // reason, which the completed payload's scenes no longer hold.
  const plannedQueries =
    debugQueries.length > 0
      ? debugQueries
      : parseSceneSearchIntents(record(payload['visualPlan'])?.['scenes']);
  const actualSearches = parseActualSearches(
    payload['searchTrace'] ?? record(payload['provenance'])?.['searchTrace'],
  );
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

function mapSceneRows<T>(
  value: unknown,
  mapRow: (row: Record<string, unknown>, sceneId: string) => T | null,
): T[] {
  return records(value).flatMap((row) => {
    const sceneId = row['sceneId'];
    if (typeof sceneId !== 'string') {
      return [];
    }
    const mapped = mapRow(row, sceneId);
    return mapped ? [mapped] : [];
  });
}

function parsePlannedQueries(
  value: unknown,
): PodcastPipelineVisualDebug['plannedQueries'] {
  return mapSceneRows(value, (row, sceneId) => {
    const queries = stringArray(row['queries']);
    if (queries.length === 0) {
      return null;
    }
    const selectionReason = row['selectionReason'];
    return {
      sceneId,
      subjectIds: stringArray(row['subjectIds']),
      selectionReason:
        typeof selectionReason === 'string' ? selectionReason : null,
      queries,
    };
  });
}

function parseSceneSearchIntents(
  value: unknown,
): PodcastPipelineVisualDebug['plannedQueries'] {
  return mapSceneRows(value, (row, sceneId) => {
    const queries = stringArray(row['imageSearchIntent']);
    // A completed plan keeps every scene, including the intro/outro brand
    // cards, whose intent is the `brand:` marker the renderer swaps for a
    // bundled PNG. Image search never runs for those, so listing them as
    // planned queries would invent a search on every packaged episode.
    if (queries.length === 0 || queries.some(isBrandVisualIntent)) {
      return null;
    }
    return { sceneId, subjectIds: [], selectionReason: null, queries };
  });
}

function isBrandVisualIntent(query: string): boolean {
  return query.startsWith('brand:');
}

function parseActualSearches(
  value: unknown,
): PodcastPipelineVisualDebug['actualSearches'] {
  return mapSceneRows(value, (row, sceneId) => {
    const provider = row['provider'];
    const query = row['intent'];
    if (!isImageSearchProvider(provider) || typeof query !== 'string') {
      return null;
    }
    return {
      sceneId,
      provider,
      query,
      returned: numericCount(row['returned']),
      accepted: numericCount(row['accepted']),
      entityFiltered: numericCount(row['entityFiltered']),
      rejected: numericCount(row['rejected']),
    };
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
  const status = normalizeJobStatus(row.status, row.lease_expires_at, now);
  return {
    status,
    progressPercent: status === 'completed' ? null : (row.progress_percent ?? null),
    stage: status === 'completed' ? null : (row.progress_stage ?? null),
    attempts: row.attempt_count,
    lastError: row.last_error,
    leaseExpiresAt: row.lease_expires_at,
    updatedAt: row.updated_at,
  };
}

function visualJobState(row: VisualRow, now: Date): PodcastPipelineJobState {
  const base = jobState(row, now);
  const status = normalizeVersionedJobStatus(
    base.status,
    row.visual_version,
  );
  return {
    ...base,
    status,
    visualVersion: row.visual_version ?? null,
  };
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
  const base = jobState(row, now);
  const status = normalizeVersionedJobStatus(base.status, row.visual_version);
  return {
    ...base,
    status,
    visualVersion: row.visual_version ?? null,
    localizationId: row.episode_localization_id,
    languageCode,
    canRestart: canRestartRender(status, base.leaseExpiresAt, visual, now),
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
    canRestart:
      visual?.status === 'completed' &&
      visual.visualVersion === EPISODE_VIDEO_VISUAL_VERSION,
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
  if (status === 'failed' || status === 'completed') return status;
  if (
    (status === 'queued' || status === 'stuck') &&
    visualVersion &&
    visualVersion !== EPISODE_VIDEO_VISUAL_VERSION
  ) {
    return 'stale';
  }
  return status;
}

function canRestartRender(
  status: PodcastPipelineStatus,
  leaseExpiresAt: string | null,
  visual: PodcastPipelineJobState | null,
  now: Date,
): boolean {
  if (
    !visual ||
    visual.status !== 'completed' ||
    visual.visualVersion !== EPISODE_VIDEO_VISUAL_VERSION ||
    status === 'completed'
  ) {
    return false;
  }
  return !leaseIsActive(leaseExpiresAt, now);
}

function parseIngestFailureHistory(
  value: unknown,
): PodcastPipelineIngestFailure[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
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

function isMissingColumnError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: unknown }).code === '42703',
  );
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
