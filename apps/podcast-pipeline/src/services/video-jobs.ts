import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { getRequiredEnv } from '../lib/env.js';

export type EpisodeVideoJobStatus =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed';

export interface EpisodeVideoJobRow {
  episode_localization_id: string;
  status: EpisodeVideoJobStatus;
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

export interface EpisodeVideoSource {
  episodeId: string;
  localizationId: string;
  languageCode: 'zh-Hant';
  title: string;
  script: string;
  hlsUrl: string;
  sourceUrl: string;
  sourceTitle: string | null;
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

interface EpisodeVideoSourceLocalizationRow {
  id: string;
  episode_id: string;
  language_code: string;
  title: string;
  script: string | null;
  hls_url: string;
  status: string;
}

interface EpisodeVideoSourceEpisodeRow {
  id: string;
  source_url: string;
  source_title: string | null;
}

export function createVideoJobRepository(
  supabase: PipelineSupabaseClient,
): VideoJobRepository {
  return {
    async enqueue(
      episodeLocalizationId: string,
      telegramChatId?: string | null,
    ): Promise<EpisodeVideoJobRow> {
      const row = await callRowRpc(supabase, 'enqueue_episode_video', {
        p_episode_localization_id: episodeLocalizationId,
        p_telegram_chat_id: telegramChatId == null ? null : telegramChatId,
      });
      if (!row) throw new Error('Video enqueue RPC returned no job');
      return row;
    },

    claim(leaseOwner: string): Promise<EpisodeVideoJobRow | null> {
      return callRowRpc(supabase, 'claim_episode_video', {
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
      return callRowRpc(supabase, 'fail_episode_video', {
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

    async loadSource(
      episodeLocalizationId: string,
    ): Promise<EpisodeVideoSource> {
      const { data: localization, error: localizationError } = await supabase
        .from('episode_localizations')
        .select('id, episode_id, language_code, title, script, hls_url, status')
        .eq('id', episodeLocalizationId)
        .maybeSingle<EpisodeVideoSourceLocalizationRow>();
      if (localizationError) throwSupabaseError(localizationError);
      if (!localization) throw new Error('Video job localization not found');
      if (
        localization.language_code !== 'zh-Hant' ||
        localization.status !== 'completed' ||
        !localization.hls_url.trim() ||
        !localization.script?.trim()
      ) {
        throw new Error('Video job localization is not renderable');
      }

      const { data: episode, error: episodeError } = await supabase
        .from('episodes')
        .select('id, source_url, source_title')
        .eq('id', localization.episode_id)
        .maybeSingle<EpisodeVideoSourceEpisodeRow>();
      if (episodeError) throwSupabaseError(episodeError);
      if (!episode) throw new Error('Video job episode not found');

      return {
        episodeId: episode.id,
        localizationId: localization.id,
        languageCode: 'zh-Hant',
        title: localization.title,
        script: localization.script,
        hlsUrl: localization.hls_url,
        sourceUrl: episode.source_url,
        sourceTitle: episode.source_title,
      };
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

export function getVideoJobRepository(): VideoJobRepository {
  defaultRepository ??= createVideoJobRepository(getSupabase());
  return defaultRepository;
}

export function enqueueEpisodeVideoJob(
  episodeLocalizationId: string,
  telegramChatId?: string | null,
): Promise<EpisodeVideoJobRow> {
  return getVideoJobRepository().enqueue(episodeLocalizationId, telegramChatId);
}

async function callRowRpc(
  supabase: PipelineSupabaseClient,
  name: string,
  parameters: Record<string, unknown>,
): Promise<EpisodeVideoJobRow | null> {
  const { data, error } = await supabase.rpc(name, parameters);
  if (error) throwSupabaseError(error);
  if (!Array.isArray(data)) return null;
  return (data[0] as EpisodeVideoJobRow | undefined) ?? null;
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
