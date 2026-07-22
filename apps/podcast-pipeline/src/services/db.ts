import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { getRequiredEnv } from '../lib/env.js';
import {
  normalizeLanguageClassroomKeywords,
  normalizeLanguageClassroomLesson,
} from '../lib/languageClassroom.js';
import { isRecord } from '../lib/typeGuards.js';
import type {
  Article,
  EpisodeListRow,
  EpisodeLocalizationRow,
  EpisodeResponse,
  EpisodeRow,
  EpisodeStatus,
  EpisodeVideoResponse,
  LanguageClassroomKeyword,
  LanguageClassroomLesson,
  LanguageClassroomRow,
  NewEpisode,
  NewEpisodeLocalization,
  NewLanguageClassroom,
} from '../types.js';

type PipelineSupabaseClient = SupabaseClient<any, any, any>;

let client: PipelineSupabaseClient | null = null;

const DEFAULT_SUPABASE_DB_SCHEMA = 'from_fed_to_chain';

interface CompletedEpisodeVideoProjection {
  episode_localization_id: string;
  mp4_url: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
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

function getSupabaseDbSchema(): string {
  return (
    process.env['SUPABASE_DB_SCHEMA']?.trim() || DEFAULT_SUPABASE_DB_SCHEMA
  );
}

function getSupabase(): PipelineSupabaseClient {
  client ??= createClient(
    getRequiredEnv('SUPABASE_URL'),
    getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
    {
      db: {
        schema: getSupabaseDbSchema(),
      },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );

  return client;
}

function throwSupabaseError(error: unknown): never {
  if (error instanceof Error) {
    throw error;
  }

  const normalized = new Error(formatSupabaseError(error), { cause: error });
  (normalized as { supabaseError?: unknown }).supabaseError = error;
  throw normalized;
}

function formatSupabaseError(error: unknown): string {
  if (!isRecord(error)) {
    return String(error);
  }

  const code = readOptionalString(error['code']);
  const message =
    readOptionalString(error['message']) ?? 'Supabase request failed';
  const details = readOptionalString(error['details']);
  const hint = readOptionalString(error['hint']);
  const parts = [code ? `[${code}] ${message}` : message];

  if (details) parts.push(`Details: ${details}`);
  if (hint) parts.push(`Hint: ${hint}`);

  return parts.join(' ');
}

function readOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function toEpisodeResponse(
  row: EpisodeListRow,
  languageClassrooms?: LanguageClassroomRow[] | LanguageClassroomLesson[],
  video: EpisodeVideoResponse | null = null,
): EpisodeResponse {
  return toEpisodeResponseWithClassrooms(
    row,
    languageClassrooms ?? parseClassroomsFromListRow(row),
    video,
  );
}

export function toEpisodeResponseFromLocalization(
  episode: EpisodeRow,
  localization: EpisodeLocalizationRow,
  languageClassrooms: LanguageClassroomRow[] | LanguageClassroomLesson[] = [],
  video: EpisodeVideoResponse | null = null,
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
      listened: episode.listened,
      like_count: 0,
      language_classrooms: [],
    },
    languageClassrooms,
    video,
  );
}

export function toEpisodeResponseWithClassrooms(
  row: EpisodeListRow,
  languageClassrooms: LanguageClassroomRow[] | LanguageClassroomLesson[],
  video: EpisodeVideoResponse | null = null,
): EpisodeResponse {
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
    listened: row.listened,
    script: row.script,
    llmModel: row.llm_model,
    llmThinkingModel: row.llm_thinking_model,
    llmProvider: row.llm_provider,
    status: row.status,
    video,
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

export async function listEpisodesPaged(
  limit: number,
  cursor: Cursor | null,
  languageCode?: string,
): Promise<{ rows: EpisodeListRow[]; nextCursor: string | null }> {
  const lim = Math.min(Math.max(limit | 0, 1), MAX_LIMIT);

  let q = getSupabase()
    .from('episodes_with_stats')
    .select('*')
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

  const { data, error } = await q.returns<EpisodeListRow[]>();
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

export async function listCompletedEpisodeVideosByLocalizationIds(
  episodeLocalizationIds: readonly string[],
): Promise<Map<string, EpisodeVideoResponse>> {
  const videos = new Map<string, EpisodeVideoResponse>();
  const uniqueIds = [...new Set(episodeLocalizationIds.filter(Boolean))];
  if (uniqueIds.length === 0) return videos;

  const { data, error } = await getSupabase()
    .from('episode_videos')
    .select('episode_localization_id, mp4_url, thumbnail_url, duration_seconds')
    .eq('status', 'completed')
    .in('episode_localization_id', uniqueIds)
    .returns<CompletedEpisodeVideoProjection[]>();

  if (error) {
    throwSupabaseError(error);
  }

  for (const row of data ?? []) {
    const url = row.mp4_url?.trim();
    const thumbnailUrl = row.thumbnail_url?.trim();
    if (
      !url ||
      !thumbnailUrl ||
      typeof row.duration_seconds !== 'number' ||
      !Number.isFinite(row.duration_seconds) ||
      row.duration_seconds <= 0
    ) {
      continue;
    }

    videos.set(row.episode_localization_id, {
      url,
      thumbnailUrl,
      durationSeconds: row.duration_seconds,
    });
  }

  return videos;
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

async function updateEpisodeFields(
  id: string,
  fields: Record<string, unknown>,
): Promise<EpisodeRow | null> {
  const { data, error } = await getSupabase()
    .from('episodes')
    .update(fields)
    .eq('id', id)
    .select('*')
    .maybeSingle<EpisodeRow>();

  if (error) {
    throwSupabaseError(error);
  }

  return data;
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

export async function markEpisodeListened(
  id: string,
): Promise<EpisodeRow | null> {
  return updateEpisodeFields(id, { listened: true });
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
