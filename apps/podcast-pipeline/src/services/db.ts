import {
  normalizeLanguageClassroomKeywords,
  normalizeLanguageClassroomLesson,
} from '../lib/languageClassroom.js';
import type {
  Article,
  EpisodeFeedResponse,
  EpisodeFeedRow,
  EpisodeListRow,
  EpisodeLocalizationRow,
  EpisodeResponse,
  EpisodeRow,
  EpisodeStatus,
  EpisodeVideoGenerationPublicStatus,
  EpisodeVideoGenerationSummary,
  EpisodeVideoResponse,
  LanguageClassroomKeyword,
  LanguageClassroomLesson,
  LanguageClassroomRow,
  NewEpisode,
  NewEpisodeLocalization,
  NewLanguageClassroom,
  PublishedEpisodeCatalog,
} from '../types.js';
import {
  getPipelineSupabase as getSupabase,
  throwSupabaseError,
} from './supabase-client.js';
import {
  composeEpisodeVideoProgress,
  type EpisodeVideoProgressJobState,
} from './video-progress.js';

interface EpisodeVideoStatusProjection {
  episode_localization_id: string;
  episode_id: string;
  status: string;
  progress_percent: number | null;
  progress_stage: string | null;
  updated_at: string | null;
  mp4_url: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
}

interface EpisodeVideoVisualStatusProjection {
  episode_id: string;
  status: string;
  progress_percent: number | null;
  progress_stage: string | null;
  updated_at: string | null;
}

type LocalizationStatusUpdates = Partial<
  Pick<
    NewEpisodeLocalization,
    | 'script'
    | 'llmModel'
    | 'llmThinkingModel'
    | 'llmProvider'
    | 'hlsUrl'
    | 'r2Prefix'
    | 'classroomHlsUrl'
    | 'classroomR2Prefix'
    | 'ttsLanguageCode'
    | 'ttsVoiceName'
  >
>;

const LOCALIZATION_UPDATE_COLUMNS: Record<
  keyof LocalizationStatusUpdates,
  string
> = {
  script: 'script',
  llmModel: 'llm_model',
  llmThinkingModel: 'llm_thinking_model',
  llmProvider: 'llm_provider',
  hlsUrl: 'hls_url',
  r2Prefix: 'r2_prefix',
  classroomHlsUrl: 'classroom_hls_url',
  classroomR2Prefix: 'classroom_r2_prefix',
  ttsLanguageCode: 'tts_language_code',
  ttsVoiceName: 'tts_voice_name',
};

export function toEpisodeResponse(
  row: EpisodeListRow,
  languageClassrooms?: LanguageClassroomRow[] | LanguageClassroomLesson[],
  video: EpisodeVideoResponse | null = null,
  videoGeneration: EpisodeVideoGenerationSummary | null = null,
): EpisodeResponse {
  return toEpisodeResponseWithClassrooms(
    row,
    languageClassrooms ?? parseClassroomsFromListRow(row),
    video,
    videoGeneration,
  );
}

export function toEpisodeResponseFromLocalization(
  episode: EpisodeRow,
  localization: EpisodeLocalizationRow,
  languageClassrooms: LanguageClassroomRow[] | LanguageClassroomLesson[] = [],
  video: EpisodeVideoResponse | null = null,
  videoGeneration: EpisodeVideoGenerationSummary | null = null,
): EpisodeResponse {
  return toEpisodeResponseWithClassrooms(
    {
      id: episode.id,
      episode_id: episode.id,
      localization_id: localization.id,
      title: localization.title,
      language_code: localization.language_code,
      hls_url: localization.hls_url,
      classroom_hls_url: localization.classroom_hls_url,
      script: localization.script,
      llm_model: localization.llm_model,
      llm_thinking_model: localization.llm_thinking_model,
      llm_provider: localization.llm_provider,
      status: localization.status,
      created_at: episode.created_at,
      like_count: 0,
      language_classrooms: [],
    },
    languageClassrooms,
    video,
    videoGeneration,
  );
}

export function toEpisodeFeedResponse(
  row: EpisodeFeedRow,
  video: EpisodeVideoResponse | null = null,
  videoGeneration: EpisodeVideoGenerationSummary | null = null,
): EpisodeFeedResponse {
  return {
    id: row.episode_id,
    localizationId: row.localization_id,
    title: row.title,
    languageCode: row.language_code,
    hlsUrl: row.hls_url,
    audioTracks: [
      {
        languageCode: row.language_code,
        title: row.title,
        hlsUrl: row.hls_url,
        classroomHlsUrl: row.classroom_hls_url,
      },
    ],
    createdAt: row.created_at,
    llmModel: row.llm_model,
    llmThinkingModel: row.llm_thinking_model,
    llmProvider: row.llm_provider,
    status: row.status,
    video,
    videoGeneration,
  };
}

export function toEpisodeResponseWithClassrooms(
  row: EpisodeListRow,
  languageClassrooms: LanguageClassroomRow[] | LanguageClassroomLesson[],
  video: EpisodeVideoResponse | null = null,
  videoGeneration: EpisodeVideoGenerationSummary | null = null,
): EpisodeResponse {
  return {
    ...toEpisodeFeedResponse(row, video, videoGeneration),
    script: row.script,
    languageClassrooms: languageClassrooms.map(toLanguageClassroomLesson),
  };
}

export function toLanguageClassroomLesson(
  row: LanguageClassroomRow | LanguageClassroomLesson,
): LanguageClassroomLesson {
  if ('targetLanguageCode' in row) {
    return {
      ...row,
      keywords: normalizeKeywords(row.keywords),
    };
  }

  return {
    sourceLanguageCode: row.source_language_code,
    targetLanguageCode: row.target_language_code,
    oneLiner: row.one_liner,
    keywords: normalizeKeywords(row.keywords),
  };
}

export async function findEpisodeBySourceUrl(
  url: string,
): Promise<EpisodeRow | null> {
  const { data, error } = await getSupabase()
    .from('episodes')
    .select('*')
    .eq('source_url', url)
    .maybeSingle<EpisodeRow>();

  if (error) {
    throwSupabaseError(error);
  }

  return data;
}

export async function findEpisodeById(id: string): Promise<EpisodeRow | null> {
  const { data, error } = await getSupabase()
    .from('episodes')
    .select('*')
    .eq('id', id)
    .maybeSingle<EpisodeRow>();

  if (error) {
    throwSupabaseError(error);
  }

  return data;
}

export async function findEpisodeLocalizationByEpisodeId(
  episodeId: string,
  languageCode: string,
): Promise<EpisodeLocalizationRow | null> {
  const { data, error } = await getSupabase()
    .from('episode_localizations')
    .select('*')
    .eq('episode_id', episodeId)
    .eq('language_code', languageCode)
    .maybeSingle<EpisodeLocalizationRow>();

  if (error) {
    throwSupabaseError(error);
  }

  return data;
}

export async function listEpisodeLocalizationsByEpisodeId(
  episodeId: string,
  languageCodes: readonly string[],
): Promise<EpisodeLocalizationRow[]> {
  const uniqueLanguageCodes = [...new Set(languageCodes.filter(Boolean))];
  if (uniqueLanguageCodes.length === 0) return [];

  const { data, error } = await getSupabase()
    .from('episode_localizations')
    .select('*')
    .eq('episode_id', episodeId)
    .in('language_code', uniqueLanguageCodes)
    .returns<EpisodeLocalizationRow[]>();

  if (error) {
    throwSupabaseError(error);
  }

  return data ?? [];
}

export async function findEpisodeListRowByLocalizationId(
  episodeLocalizationId: string,
): Promise<EpisodeListRow | null> {
  const { data, error } = await getSupabase()
    .from('episodes_with_stats')
    .select('*')
    .eq('localization_id', episodeLocalizationId)
    .maybeSingle<EpisodeListRow>();

  if (error) {
    throwSupabaseError(error);
  }

  return data;
}

export async function listEpisodes(): Promise<EpisodeListRow[]> {
  const { data, error } = await getSupabase()
    .from('episodes_with_stats')
    .select('*')
    .order('created_at', { ascending: false })
    .returns<EpisodeListRow[]>();

  if (error) {
    throwSupabaseError(error);
  }

  return data ?? [];
}

interface PublishedEpisodeCatalogRow {
  localization_id: string;
  language_code: string;
}

const EPISODE_CATALOG_PAGE_SIZE = 1_000;
// Revisit response pagination or compression at tens of thousands of episodes.

export async function listPublishedEpisodeCatalog(): Promise<PublishedEpisodeCatalog> {
  const catalog: PublishedEpisodeCatalog = {
    'zh-Hant': [],
    ja: [],
    en: [],
  };
  let lastLocalizationId: string | null = null;

  for (;;) {
    let query = getSupabase()
      .from('episodes_with_stats')
      .select('localization_id,language_code')
      .order('localization_id', { ascending: true })
      .limit(EPISODE_CATALOG_PAGE_SIZE);

    if (lastLocalizationId !== null) {
      query = query.gt('localization_id', lastLocalizationId);
    }

    const { data, error } = await query.returns<PublishedEpisodeCatalogRow[]>();
    if (error) throwSupabaseError(error);

    const rows = data ?? [];
    for (const row of rows) {
      switch (row.language_code) {
        case 'zh-Hant':
        case 'ja':
        case 'en':
          catalog[row.language_code].push(row.localization_id);
      }
    }

    if (rows.length < EPISODE_CATALOG_PAGE_SIZE) return catalog;
    lastLocalizationId = rows[rows.length - 1]!.localization_id;
  }
}

// ---------------------------------------------------------------------------
// Cursor pagination
// ---------------------------------------------------------------------------

export const MAX_LIMIT = 50;
export const DEFAULT_LIMIT = 20;

export interface Cursor {
  t: string;
  i: string;
}

export function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c), 'utf8').toString('base64url');
}

export function decodeCursor(raw: string): Cursor {
  const obj = JSON.parse(
    Buffer.from(raw, 'base64url').toString('utf8'),
  ) as Cursor;
  if (typeof obj?.t !== 'string' || typeof obj?.i !== 'string') {
    throw new Error('bad cursor shape');
  }
  if (Number.isNaN(Date.parse(obj.t))) throw new Error('bad cursor ts');
  if (!/^[0-9a-f-]{36}$/i.test(obj.i)) throw new Error('bad cursor id');
  return obj;
}

// Everything the feed responds with, and nothing TOASTed: script and
// language_classrooms_jsonb stay out so the view query never detoasts them,
// and like_count stays out so Postgres can eliminate the likes aggregate join.
const EPISODE_FEED_COLUMNS =
  'id,episode_id,localization_id,title,language_code,hls_url,classroom_hls_url,llm_model,llm_thinking_model,llm_provider,status,created_at';

export async function listEpisodesPaged(
  limit: number,
  cursor: Cursor | null,
  languageCode?: string,
): Promise<{ rows: EpisodeListRow[]; nextCursor: string | null }> {
  return pageEpisodesWithStats<EpisodeListRow>(
    '*',
    limit,
    cursor,
    languageCode,
  );
}

export async function listEpisodeFeedPaged(
  limit: number,
  cursor: Cursor | null,
  languageCode?: string,
): Promise<{ rows: EpisodeFeedRow[]; nextCursor: string | null }> {
  return pageEpisodesWithStats<EpisodeFeedRow>(
    EPISODE_FEED_COLUMNS,
    limit,
    cursor,
    languageCode,
  );
}

async function pageEpisodesWithStats<
  Row extends { created_at: string; id: string },
>(
  columns: string,
  limit: number,
  cursor: Cursor | null,
  languageCode?: string,
): Promise<{ rows: Row[]; nextCursor: string | null }> {
  const lim = Math.min(Math.max(limit | 0, 1), MAX_LIMIT);

  let q = getSupabase()
    .from('episodes_with_stats')
    .select(columns)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(lim + 1);

  if (languageCode) {
    q = q.eq('language_code', languageCode);
  }

  if (cursor) {
    q = q.or(
      `created_at.lt.${cursor.t},and(created_at.eq.${cursor.t},id.lt.${cursor.i})`,
    );
  }

  const { data, error } = await q.returns<Row[]>();
  if (error) throwSupabaseError(error);

  const all = data ?? [];
  const hasMore = all.length > lim;
  const rows = hasMore ? all.slice(0, lim) : all;
  const last = hasMore ? rows[rows.length - 1] : null;

  return {
    rows,
    nextCursor: last ? encodeCursor({ t: last.created_at, i: last.id }) : null,
  };
}

export interface EpisodeVideoSummary {
  video: EpisodeVideoResponse | null;
  videoGeneration: EpisodeVideoGenerationSummary;
}

export async function listEpisodeVideoSummariesByLocalizationIds(
  episodeLocalizationIds: readonly string[],
): Promise<Map<string, EpisodeVideoSummary>> {
  const summaries = new Map<string, EpisodeVideoSummary>();
  const uniqueIds = [...new Set(episodeLocalizationIds.filter(Boolean))];
  if (uniqueIds.length === 0) return summaries;

  const { data, error } = await getSupabase()
    .from('episode_videos')
    .select(
      'episode_localization_id, episode_id, status, progress_percent, progress_stage, updated_at, mp4_url, thumbnail_url, duration_seconds',
    )
    .in('episode_localization_id', uniqueIds)
    .returns<EpisodeVideoStatusProjection[]>();

  if (error) {
    throwSupabaseError(error);
  }

  const rows = data ?? [];
  const visuals = await loadVisualProgressForQueuedRows(rows);

  for (const row of rows) {
    if (!isEpisodeVideoGenerationPublicStatus(row.status)) {
      continue;
    }

    const url = row.mp4_url?.trim();
    const thumbnailUrl = row.thumbnail_url?.trim();
    const video =
      row.status === 'completed' &&
      url &&
      thumbnailUrl &&
      typeof row.duration_seconds === 'number' &&
      Number.isFinite(row.duration_seconds) &&
      row.duration_seconds > 0
        ? {
            url,
            thumbnailUrl,
            durationSeconds: row.duration_seconds,
          }
        : null;

    const progress = composeEpisodeVideoProgress({
      render: {
        status: row.status,
        progressPercent: row.progress_percent,
        progressStage: row.progress_stage,
        updatedAt: row.updated_at,
      },
      visual: visuals.get(row.episode_id) ?? null,
    });

    summaries.set(row.episode_localization_id, {
      video,
      videoGeneration: {
        status: row.status,
        // Deliberately the composed timestamp, not the render row's: during the
        // visual phase that row has not been touched since it was enqueued, so
        // using it would freeze the client's freshness check and the bar with it.
        updatedAt: progress.updatedAt,
        progressPercent: progress.progressPercent,
        stage: progress.stage,
      },
    });
  }

  return summaries;
}

/**
 * The shared visual checkpoint is where the work actually is while a render row
 * is still `queued`, so its progress is what the bar has to show. Any other
 * status makes the render row self-sufficient, and the query is skipped.
 */
async function loadVisualProgressForQueuedRows(
  rows: readonly EpisodeVideoStatusProjection[],
): Promise<Map<string, EpisodeVideoProgressJobState>> {
  const visuals = new Map<string, EpisodeVideoProgressJobState>();
  const episodeIds = [
    ...new Set(
      rows
        .filter((row) => row.status === 'queued')
        .map((row) => row.episode_id),
    ),
  ].filter(Boolean);
  if (episodeIds.length === 0) return visuals;

  const { data, error } = await getSupabase()
    .from('episode_video_visuals')
    .select('episode_id, status, progress_percent, progress_stage, updated_at')
    .in('episode_id', episodeIds)
    .returns<EpisodeVideoVisualStatusProjection[]>();

  if (error) {
    throwSupabaseError(error);
  }

  for (const row of data ?? []) {
    if (!isEpisodeVideoGenerationPublicStatus(row.status)) continue;
    visuals.set(row.episode_id, {
      status: row.status,
      progressPercent: row.progress_percent,
      progressStage: row.progress_stage,
      updatedAt: row.updated_at,
    });
  }

  return visuals;
}

function isEpisodeVideoGenerationPublicStatus(
  status: string,
): status is EpisodeVideoGenerationPublicStatus {
  return (
    status === 'queued' ||
    status === 'processing' ||
    status === 'completed' ||
    status === 'failed'
  );
}

export async function insertEpisode(episode: NewEpisode): Promise<EpisodeRow> {
  const { data, error } = await getSupabase()
    .from('episodes')
    .insert({
      id: episode.id,
      source_url: episode.sourceUrl,
      source_title: episode.sourceTitle,
    })
    .select('*')
    .single<EpisodeRow>();

  if (error) {
    throwSupabaseError(error);
  }

  return data;
}

export async function insertEpisodeLocalization(
  localization: NewEpisodeLocalization,
): Promise<EpisodeLocalizationRow> {
  const { data, error } = await getSupabase()
    .from('episode_localizations')
    .insert(toLocalizationPayload(localization))
    .select('*')
    .single<EpisodeLocalizationRow>();

  if (error) {
    throwSupabaseError(error);
  }

  return data;
}

export async function listLanguageClassroomsByLocalizationId(
  episodeLocalizationId: string,
): Promise<LanguageClassroomRow[]> {
  const classroomsByLocalizationId =
    await listLanguageClassroomsByLocalizationIds([episodeLocalizationId]);
  return classroomsByLocalizationId.get(episodeLocalizationId) ?? [];
}

export async function listLanguageClassroomsByLocalizationIds(
  episodeLocalizationIds: string[],
): Promise<Map<string, LanguageClassroomRow[]>> {
  const map = new Map<string, LanguageClassroomRow[]>();
  if (episodeLocalizationIds.length === 0) return map;

  const { data, error } = await getSupabase()
    .from('language_classrooms')
    .select('*')
    .in('episode_localization_id', episodeLocalizationIds)
    .order('target_language_code', { ascending: true })
    .returns<LanguageClassroomRow[]>();

  if (error) {
    throwSupabaseError(error);
  }

  for (const row of normalizeLanguageClassroomRows(data)) {
    const rows = map.get(row.episode_localization_id) ?? [];
    rows.push(row);
    map.set(row.episode_localization_id, rows);
  }

  return map;
}

export async function upsertLanguageClassrooms(
  lessons: NewLanguageClassroom[],
): Promise<LanguageClassroomRow[]> {
  if (lessons.length === 0) return [];

  const now = new Date().toISOString();
  const payload = lessons.map((lesson) => ({
    episode_localization_id: lesson.episodeLocalizationId,
    source_language_code: lesson.sourceLanguageCode,
    target_language_code: lesson.targetLanguageCode,
    one_liner: lesson.oneLiner,
    keywords: lesson.keywords,
    llm_model: lesson.llmModel,
    llm_thinking_model: lesson.llmThinkingModel,
    llm_provider: lesson.llmProvider,
    updated_at: now,
  }));

  const { data, error } = await getSupabase()
    .from('language_classrooms')
    .upsert(payload, {
      onConflict: 'episode_localization_id,target_language_code',
    })
    .select('*')
    .returns<LanguageClassroomRow[]>();

  if (error) {
    throwSupabaseError(error);
  }

  return normalizeLanguageClassroomRows(data);
}

async function updateLocalizationFields(
  id: string,
  fields: Record<string, unknown>,
): Promise<EpisodeLocalizationRow | null> {
  const { data, error } = await getSupabase()
    .from('episode_localizations')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .maybeSingle<EpisodeLocalizationRow>();

  if (error) {
    throwSupabaseError(error);
  }

  return data;
}

export async function updateEpisodeLocalizationArticleContent(
  id: string,
  article: Article,
): Promise<EpisodeLocalizationRow | null> {
  return updateLocalizationFields(id, {
    title: article.title,
    raw_text: article.text,
  });
}

export async function updateEpisodeLocalizationStatus(
  id: string,
  status: EpisodeStatus,
  updates?: LocalizationStatusUpdates,
): Promise<EpisodeLocalizationRow | null> {
  const setFields: Record<string, unknown> = { status };
  for (const [field, column] of Object.entries(LOCALIZATION_UPDATE_COLUMNS)) {
    const value = updates?.[field as keyof LocalizationStatusUpdates];
    if (value !== undefined) setFields[column] = value;
  }

  return updateLocalizationFields(id, setFields);
}

function toLocalizationPayload(
  localization: NewEpisodeLocalization,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    id: localization.id,
    episode_id: localization.episodeId,
    language_code: localization.languageCode,
    title: localization.title,
    hls_url: localization.hlsUrl,
    raw_text: localization.rawText,
    script: localization.script,
    llm_model: localization.llmModel,
    llm_thinking_model: localization.llmThinkingModel,
    llm_provider: localization.llmProvider,
    tts_language_code: localization.ttsLanguageCode,
    tts_voice_name: localization.ttsVoiceName,
    r2_prefix: localization.r2Prefix,
    status: localization.status,
  };

  if (localization.classroomHlsUrl != null) {
    payload['classroom_hls_url'] = localization.classroomHlsUrl;
  }
  if (localization.classroomR2Prefix != null) {
    payload['classroom_r2_prefix'] = localization.classroomR2Prefix;
  }

  return payload;
}

function parseClassroomsFromListRow(
  row: EpisodeListRow,
): LanguageClassroomLesson[] {
  const value = row.language_classrooms;
  if (!Array.isArray(value)) return [];

  return value
    .map((raw) => normalizeLanguageClassroomLesson(raw))
    .filter((lesson): lesson is LanguageClassroomLesson => lesson !== null);
}

function normalizeLanguageClassroomRow(
  row: LanguageClassroomRow,
): LanguageClassroomRow {
  return {
    ...row,
    keywords: normalizeKeywords(row.keywords),
  };
}

function normalizeLanguageClassroomRows(
  data: LanguageClassroomRow[] | null,
): LanguageClassroomRow[] {
  return (data ?? []).map(normalizeLanguageClassroomRow);
}

function normalizeKeywords(value: unknown): LanguageClassroomKeyword[] {
  return normalizeLanguageClassroomKeywords(value);
}
