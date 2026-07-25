import { createHash } from 'node:crypto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { getRequiredEnv } from '../lib/env.js';
import type { LanguageClassroomLanguageCode } from '../types.js';

export const EPISODE_VIDEO_VISUAL_VERSION =
  'podcast-image-visual-plan.v3' as const;

export type EpisodeVideoJobStatus =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed';

/* jscpd:ignore-start -- DB row interfaces share common Supabase columns; irreducible by design */
export interface EpisodeVideoVisualJobRow {
  episode_id: string;
  status: EpisodeVideoJobStatus;
  visual_payload: Record<string, unknown> | null;
  visual_hash: string | null;
  visual_version: string;
  source_hash: string;
  r2_prefix: string | null;
  telegram_chat_id: string | null;
  attempt_count: number;
  next_attempt_at: string;
  lease_owner: string | null;
  lease_expires_at: string | null;
  last_error: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EpisodeVideoJobRow {
  episode_localization_id: string;
  episode_id: string;
  status: EpisodeVideoJobStatus;
  visual_hash: string | null;
  visual_version: string;
  manifest: Record<string, unknown> | null;
  manifest_hash: string | null;
  renderer_version: string | null;
  storyboard_provider: string | null;
  storyboard_model: string | null;
  storyboard_prompt_version: string | null;
  script_hash: string | null;
  mp4_url: string | null;
  thumbnail_url: string | null;
  manifest_url: string | null;
  captions_ass_url: string | null;
  r2_prefix: string | null;
  duration_seconds: number | null;
  telegram_chat_id: string | null;
  attempt_count: number;
  next_attempt_at: string;
  lease_owner: string | null;
  lease_expires_at: string | null;
  last_error: string | null;
  failure_notified_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}
/* jscpd:ignore-end */

export interface EpisodeVideoJobRow {
  episode_localization_id: string;
  episode_id: string;
  status: EpisodeVideoJobStatus;
  visual_hash: string | null;
  visual_version: string;
  manifest: Record<string, unknown> | null;
  manifest_hash: string | null;
  renderer_version: string | null;
  storyboard_provider: string | null;
  storyboard_model: string | null;
  storyboard_prompt_version: string | null;
  script_hash: string | null;
  mp4_url: string | null;
  thumbnail_url: string | null;
  manifest_url: string | null;
  captions_ass_url: string | null;
  r2_prefix: string | null;
  duration_seconds: number | null;
  telegram_chat_id: string | null;
  attempt_count: number;
  next_attempt_at: string;
  lease_owner: string | null;
  lease_expires_at: string | null;
  last_error: string | null;
  failure_notified_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EpisodeVideoVisualSource {
  episodeId: string;
  canonicalLocalizationId: string;
  title: string;
  script: string;
  englishTitle: string;
  englishScript: string;
  hlsUrl: string;
  sourceUrl: string;
  sourceTitle: string | null;
}

export interface ProcessEpisodeVideoVisualJobContext {
  signal: AbortSignal;
  runId: string;
}

export interface EpisodeVideoSource {
  episodeId: string;
  localizationId: string;
  languageCode: LanguageClassroomLanguageCode;
  title: string;
  script: string;
  hlsUrl: string;
  sourceUrl: string;
  sourceTitle: string | null;
  canonicalLocalizationId: string;
  canonicalScript: string;
  visualManifest: Record<string, unknown>;
  visualHash: string;
  visualVersion: string;
  visualR2Prefix: string;
}

export interface EpisodeVideoVisualEnqueue {
  visualVersion: string;
  sourceHash: string;
  telegramChatId?: string | null;
}

export interface EpisodeVideoVisualCompletion {
  visualPayload: Record<string, unknown>;
  visualHash: string;
  visualVersion: string;
  sourceHash: string;
  r2Prefix: string;
}

export interface EpisodeVideoManifestPersistence {
  manifest: Record<string, unknown>;
  manifestHash: string;
  rendererVersion: string;
  storyboardProvider: string;
  storyboardModel: string | null;
  storyboardPromptVersion: string;
  scriptHash: string;
}

export interface EpisodeVideoCompletion {
  mp4Url: string;
  thumbnailUrl: string;
  manifestUrl: string;
  captionsAssUrl: string;
  r2Prefix: string;
  durationSeconds: number;
}

export interface EpisodeVideoFailureNotification {
  episodeLocalizationId: string;
  telegramChatId: string;
  episodeId: string;
  lastError: string | null;
}

interface EpisodeVideoFailureNotificationRow {
  episode_localization_id: string;
  telegram_chat_id: string | null;
  episode_id: string | null;
  last_error: string | null;
}

export interface VisualJobRepository {
  enqueue(
    episodeId: string,
    input: EpisodeVideoVisualEnqueue,
  ): Promise<EpisodeVideoVisualJobRow>;
  claim(leaseOwner: string): Promise<EpisodeVideoVisualJobRow | null>;
  renewLease(episodeId: string, leaseOwner: string): Promise<boolean>;
  complete(
    episodeId: string,
    leaseOwner: string,
    input: EpisodeVideoVisualCompletion,
  ): Promise<boolean>;
  fail(
    episodeId: string,
    leaseOwner: string,
    error: string,
  ): Promise<EpisodeVideoVisualJobRow | null>;
  find(episodeId: string): Promise<EpisodeVideoVisualJobRow | null>;
  loadSource(episodeId: string): Promise<EpisodeVideoVisualSource>;
}

export interface VideoJobRepository {
  enqueue(
    episodeLocalizationId: string,
    telegramChatId?: string | null,
  ): Promise<EpisodeVideoJobRow>;
  claim(leaseOwner: string): Promise<EpisodeVideoJobRow | null>;
  renewLease(
    episodeLocalizationId: string,
    leaseOwner: string,
  ): Promise<boolean>;
  saveManifest(
    episodeLocalizationId: string,
    leaseOwner: string,
    input: EpisodeVideoManifestPersistence,
  ): Promise<boolean>;
  complete(
    episodeLocalizationId: string,
    leaseOwner: string,
    input: EpisodeVideoCompletion,
  ): Promise<boolean>;
  fail(
    episodeLocalizationId: string,
    leaseOwner: string,
    error: string,
  ): Promise<EpisodeVideoJobRow | null>;
  find(episodeLocalizationId: string): Promise<EpisodeVideoJobRow | null>;
  loadSource(episodeLocalizationId: string): Promise<EpisodeVideoSource>;
  reapFailedNotifications(
    limit?: number,
  ): Promise<EpisodeVideoFailureNotification[]>;
  markFailureNotified(episodeLocalizationId: string): Promise<boolean>;
}

type PipelineSupabaseClient = SupabaseClient<any, any, any>;
const DEFAULT_SUPABASE_DB_SCHEMA = 'from_fed_to_chain';
let defaultClient: PipelineSupabaseClient | null = null;
let defaultRepository: VideoJobRepository | null = null;
let defaultVisualRepository: VisualJobRepository | null = null;

interface EpisodeVideoSourceLocalizationRow {
  id: string;
  episode_id: string;
  language_code: string;
  title: string;
  script: string | null;
  hls_url: string;
  classroom_hls_url: string | null;
  status: string;
}

interface EpisodeVideoSourceEpisodeRow {
  id: string;
  source_url: string;
  source_title: string | null;
}

/* jscpd:ignore-start -- CompletedEpisodeVideoVisualRow is a DB row type that shares Supabase columns with EpisodeVideoVisualJobRow; irreducible by design */
interface CompletedEpisodeVideoVisualRow {
  episode_id: string;
  status: string;
  visual_payload: Record<string, unknown> | null;
  visual_hash: string | null;
  visual_version: string;
  source_hash: string;
  r2_prefix: string | null;
}
/* jscpd:ignore-end */

export function createVideoVisualJobRepository(
  supabase: PipelineSupabaseClient,
): VisualJobRepository {
  return {
    async enqueue(
      episodeId: string,
      input: EpisodeVideoVisualEnqueue,
    ): Promise<EpisodeVideoVisualJobRow> {
      const row = await callRowRpc<EpisodeVideoVisualJobRow>(
        supabase,
        'enqueue_episode_video_visual',
        {
          p_episode_id: episodeId,
          p_visual_version: input.visualVersion,
          p_source_hash: input.sourceHash,
          p_telegram_chat_id:
            input.telegramChatId == null ? null : input.telegramChatId,
        },
      );
      if (!row) throw new Error('Video visual enqueue RPC returned no job');
      return row;
    },

    claim(leaseOwner: string): Promise<EpisodeVideoVisualJobRow | null> {
      return callRowRpc<EpisodeVideoVisualJobRow>(
        supabase,
        'claim_episode_video_visual',
        {
          p_lease_owner: leaseOwner,
        },
      );
    },

    renewLease(episodeId: string, leaseOwner: string): Promise<boolean> {
      return callBooleanRpc(supabase, 'renew_episode_video_visual_lease', {
        p_episode_id: episodeId,
        p_lease_owner: leaseOwner,
      });
    },

    complete(
      episodeId: string,
      leaseOwner: string,
      input: EpisodeVideoVisualCompletion,
    ): Promise<boolean> {
      return callBooleanRpc(supabase, 'complete_episode_video_visual', {
        p_episode_id: episodeId,
        p_lease_owner: leaseOwner,
        p_visual_payload: input.visualPayload,
        p_visual_hash: input.visualHash,
        p_visual_version: input.visualVersion,
        p_source_hash: input.sourceHash,
        p_r2_prefix: input.r2Prefix,
      });
    },

    fail(
      episodeId: string,
      leaseOwner: string,
      error: string,
    ): Promise<EpisodeVideoVisualJobRow | null> {
      return callRowRpc<EpisodeVideoVisualJobRow>(
        supabase,
        'fail_episode_video_visual',
        {
          p_episode_id: episodeId,
          p_lease_owner: leaseOwner,
          p_last_error: error,
        },
      );
    },

    async find(episodeId: string): Promise<EpisodeVideoVisualJobRow | null> {
      const { data, error } = await supabase
        .from('episode_video_visuals')
        .select('*')
        .eq('episode_id', episodeId)
        .maybeSingle<EpisodeVideoVisualJobRow>();
      if (error) throwSupabaseError(error);
      return data;
    },

    loadSource(episodeId: string): Promise<EpisodeVideoVisualSource> {
      return loadVisualSource(supabase, episodeId);
    },
  };
}

export function createVideoJobRepository(
  supabase: PipelineSupabaseClient,
): VideoJobRepository {
  return {
    async enqueue(
      episodeLocalizationId: string,
      telegramChatId?: string | null,
    ): Promise<EpisodeVideoJobRow> {
      const row = await callRowRpc<EpisodeVideoJobRow>(
        supabase,
        'enqueue_episode_video',
        {
          p_episode_localization_id: episodeLocalizationId,
          p_telegram_chat_id: telegramChatId == null ? null : telegramChatId,
        },
      );
      if (!row) throw new Error('Video enqueue RPC returned no job');
      return row;
    },

    claim(leaseOwner: string): Promise<EpisodeVideoJobRow | null> {
      return callRowRpc<EpisodeVideoJobRow>(supabase, 'claim_episode_video', {
        p_lease_owner: leaseOwner,
      });
    },

    renewLease(
      episodeLocalizationId: string,
      leaseOwner: string,
    ): Promise<boolean> {
      return callBooleanRpc(supabase, 'renew_episode_video_lease', {
        p_episode_localization_id: episodeLocalizationId,
        p_lease_owner: leaseOwner,
      });
    },

    saveManifest(
      episodeLocalizationId: string,
      leaseOwner: string,
      input: EpisodeVideoManifestPersistence,
    ): Promise<boolean> {
      return callBooleanRpc(supabase, 'save_episode_video_manifest', {
        p_episode_localization_id: episodeLocalizationId,
        p_lease_owner: leaseOwner,
        p_manifest: input.manifest,
        p_manifest_hash: input.manifestHash,
        p_renderer_version: input.rendererVersion,
        p_storyboard_provider: input.storyboardProvider,
        p_storyboard_model: input.storyboardModel,
        p_storyboard_prompt_version: input.storyboardPromptVersion,
        p_script_hash: input.scriptHash,
      });
    },

    complete(
      episodeLocalizationId: string,
      leaseOwner: string,
      input: EpisodeVideoCompletion,
    ): Promise<boolean> {
      return callBooleanRpc(supabase, 'complete_episode_video', {
        p_episode_localization_id: episodeLocalizationId,
        p_lease_owner: leaseOwner,
        p_mp4_url: input.mp4Url,
        p_thumbnail_url: input.thumbnailUrl,
        p_manifest_url: input.manifestUrl,
        p_captions_ass_url: input.captionsAssUrl,
        p_r2_prefix: input.r2Prefix,
        p_duration_seconds: input.durationSeconds,
      });
    },

    fail(
      episodeLocalizationId: string,
      leaseOwner: string,
      error: string,
    ): Promise<EpisodeVideoJobRow | null> {
      return callRowRpc<EpisodeVideoJobRow>(supabase, 'fail_episode_video', {
        p_episode_localization_id: episodeLocalizationId,
        p_lease_owner: leaseOwner,
        p_last_error: error,
      });
    },

    async find(
      episodeLocalizationId: string,
    ): Promise<EpisodeVideoJobRow | null> {
      const { data, error } = await supabase
        .from('episode_videos')
        .select('*')
        .eq('episode_localization_id', episodeLocalizationId)
        .maybeSingle<EpisodeVideoJobRow>();
      if (error) throwSupabaseError(error);
      return data;
    },

    loadSource(episodeLocalizationId: string): Promise<EpisodeVideoSource> {
      return loadLocalizationSource(supabase, episodeLocalizationId);
    },

    async reapFailedNotifications(
      limit = 20,
    ): Promise<EpisodeVideoFailureNotification[]> {
      const { data, error } = await supabase.rpc(
        'reap_failed_episode_video_notifications',
        { p_limit: limit },
      );
      if (error) throwSupabaseError(error);
      if (!Array.isArray(data)) return [];
      return (data as EpisodeVideoFailureNotificationRow[]).flatMap((row) => {
        if (!row.telegram_chat_id || !row.episode_id) return [];
        return [
          {
            episodeLocalizationId: row.episode_localization_id,
            telegramChatId: row.telegram_chat_id,
            episodeId: row.episode_id,
            lastError: row.last_error,
          },
        ];
      });
    },

    markFailureNotified(episodeLocalizationId: string): Promise<boolean> {
      return callBooleanRpc(supabase, 'mark_episode_video_failure_notified', {
        p_episode_localization_id: episodeLocalizationId,
      });
    },
  };
}

export function getVideoVisualJobRepository(): VisualJobRepository {
  defaultVisualRepository ??= createVideoVisualJobRepository(getSupabase());
  return defaultVisualRepository;
}

export function getVideoJobRepository(): VideoJobRepository {
  defaultRepository ??= createVideoJobRepository(getSupabase());
  return defaultRepository;
}

export function enqueueEpisodeVideoVisualJob(
  episodeId: string,
  input: EpisodeVideoVisualEnqueue,
): Promise<EpisodeVideoVisualJobRow> {
  return getVideoVisualJobRepository().enqueue(episodeId, input);
}

export function enqueueEpisodeVideoJob(
  episodeLocalizationId: string,
  telegramChatId?: string | null,
): Promise<EpisodeVideoJobRow> {
  return getVideoJobRepository().enqueue(episodeLocalizationId, telegramChatId);
}

export function hashEpisodeVideoVisualSource(
  canonicalScript: string,
  englishScript: string,
): string {
  return createHash('sha256')
    .update(JSON.stringify([canonicalScript, englishScript]))
    .digest('hex');
}

async function loadVisualSource(
  supabase: PipelineSupabaseClient,
  episodeId: string,
): Promise<EpisodeVideoVisualSource> {
  const canonical = await loadLocalizationByLanguage(
    supabase,
    episodeId,
    'zh-Hant',
    'Canonical',
  );
  const english = await loadLocalizationByLanguage(
    supabase,
    episodeId,
    'en',
    'English',
  );
  const episode = await loadEpisode(supabase, episodeId);
  return {
    episodeId: episode.id,
    canonicalLocalizationId: canonical.id,
    title: canonical.title,
    script: canonical.script!,
    englishTitle: english.title,
    englishScript: english.script!,
    hlsUrl: canonical.hls_url,
    sourceUrl: episode.source_url,
    sourceTitle: episode.source_title,
  };
}

async function loadLocalizationSource(
  supabase: PipelineSupabaseClient,
  episodeLocalizationId: string,
): Promise<EpisodeVideoSource> {
  const localization = await loadLocalization(supabase, episodeLocalizationId);
  assertRenderableLocalization(localization);

  const canonical =
    localization.language_code === 'zh-Hant'
      ? localization
      : await loadLocalizationByLanguage(
          supabase,
          localization.episode_id,
          'zh-Hant',
          'Canonical',
        );
  const episode = await loadEpisode(supabase, localization.episode_id);
  const visual = await loadCompletedVisual(supabase, localization.episode_id);

  return {
    episodeId: episode.id,
    localizationId: localization.id,
    languageCode: localization.language_code as LanguageClassroomLanguageCode,
    title: localization.title,
    script: localization.script!,
    hlsUrl: localization.hls_url,
    sourceUrl: episode.source_url,
    sourceTitle: episode.source_title,
    canonicalLocalizationId: canonical.id,
    canonicalScript: canonical.script!,
    visualManifest: visual.visual_payload!,
    visualHash: visual.visual_hash!,
    visualVersion: visual.visual_version,
    visualR2Prefix: visual.r2_prefix!,
  };
}

const LOCALIZATION_SELECT_FIELDS =
  'id, episode_id, language_code, title, script, hls_url, classroom_hls_url, status' as const;

function localizationBaseQuery(supabase: PipelineSupabaseClient) {
  return supabase
    .from('episode_localizations')
    .select(LOCALIZATION_SELECT_FIELDS);
}

async function loadLocalization(
  supabase: PipelineSupabaseClient,
  episodeLocalizationId: string,
): Promise<EpisodeVideoSourceLocalizationRow> {
  const { data, error } = await localizationBaseQuery(supabase)
    .eq('id', episodeLocalizationId)
    .maybeSingle<EpisodeVideoSourceLocalizationRow>();
  if (error) throwSupabaseError(error);
  if (!data) throw new Error('Video job localization not found');
  return data;
}

async function loadLocalizationByLanguage(
  supabase: PipelineSupabaseClient,
  episodeId: string,
  languageCode: string,
  label: string,
): Promise<EpisodeVideoSourceLocalizationRow> {
  const { data, error } = await localizationBaseQuery(supabase)
    .eq('episode_id', episodeId)
    .eq('language_code', languageCode)
    .maybeSingle<EpisodeVideoSourceLocalizationRow>();
  if (error) throwSupabaseError(error);
  if (!data) throw new Error(`${label} video localization not found`);
  assertRenderableLocalization(data);
  return data;
}

async function loadEpisode(
  supabase: PipelineSupabaseClient,
  episodeId: string,
): Promise<EpisodeVideoSourceEpisodeRow> {
  const { data, error } = await supabase
    .from('episodes')
    .select('id, source_url, source_title')
    .eq('id', episodeId)
    .maybeSingle<EpisodeVideoSourceEpisodeRow>();
  if (error) throwSupabaseError(error);
  if (!data) throw new Error('Video job episode not found');
  return data;
}

async function loadCompletedVisual(
  supabase: PipelineSupabaseClient,
  episodeId: string,
): Promise<CompletedEpisodeVideoVisualRow> {
  const { data, error } = await supabase
    .from('episode_video_visuals')
    .select(
      'episode_id, status, visual_payload, visual_hash, visual_version, source_hash, r2_prefix',
    )
    .eq('episode_id', episodeId)
    .maybeSingle<CompletedEpisodeVideoVisualRow>();
  if (error) throwSupabaseError(error);
  if (
    data?.status !== 'completed' ||
    !data.visual_payload ||
    !data.visual_hash?.trim() ||
    !data.visual_version.trim() ||
    !data.source_hash.trim() ||
    !data.r2_prefix?.trim()
  ) {
    throw new Error('Episode video visuals are not complete');
  }
  return data;
}

function assertRenderableLocalization(
  localization: EpisodeVideoSourceLocalizationRow,
): void {
  const supportedLanguage =
    localization.language_code === 'zh-Hant' ||
    localization.language_code === 'ja' ||
    localization.language_code === 'en';
  const canonicalAudioReady =
    localization.language_code !== 'zh-Hant' ||
    Boolean(localization.classroom_hls_url?.trim());
  if (
    !supportedLanguage ||
    localization.status !== 'completed' ||
    !localization.hls_url.trim() ||
    !canonicalAudioReady ||
    !localization.script?.trim()
  ) {
    throw new Error('Video job localization is not renderable');
  }
}

async function callRowRpc<T>(
  supabase: PipelineSupabaseClient,
  name: string,
  parameters: Record<string, unknown>,
): Promise<T | null> {
  const { data, error } = await supabase.rpc(name, parameters);
  if (error) throwSupabaseError(error);
  if (!Array.isArray(data)) return null;
  return (data[0] as T | undefined) ?? null;
}

async function callBooleanRpc(
  supabase: PipelineSupabaseClient,
  name: string,
  parameters: Record<string, unknown>,
): Promise<boolean> {
  const { data, error } = await supabase.rpc(name, parameters);
  if (error) throwSupabaseError(error);
  return data === true;
}

function getSupabase(): PipelineSupabaseClient {
  defaultClient ??= createClient(
    getRequiredEnv('SUPABASE_URL'),
    getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
    {
      db: {
        schema:
          process.env['SUPABASE_DB_SCHEMA']?.trim() ||
          DEFAULT_SUPABASE_DB_SCHEMA,
      },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
  return defaultClient;
}

function throwSupabaseError(error: unknown): never {
  if (error instanceof Error) throw error;
  const message =
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
      ? error.message
      : 'Supabase video job request failed';
  throw new Error(message, { cause: error });
}
