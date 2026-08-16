import {
  getPipelineSupabase,
  throwSupabaseError,
} from '../services/supabase-client.js';
import type { SocialPostMetricRow, SocialPostRow } from '../types.js';
import type { SocialPlatform } from './platforms.js';

export const SOCIAL_DAEMON_STATE_ID = 'local-social-daemon-v1';

export type SocialMetricWindowLabel = '1h' | '6h' | '24h' | '72h' | '7d';

export interface SocialPublishCandidate {
  episode_id: string;
  ready_at: string;
}

export interface SocialPublishJobRow {
  id: string;
  episode_id: string;
  platform: SocialPlatform;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  scheduled_at: string;
  next_attempt_at: string;
  strategy_version_id: string | null;
  social_post_id: string | null;
  attempt_count: number;
  lease_owner: string | null;
  lease_expires_at: string | null;
  last_error: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SocialStrategyConfig {
  publishHoursJst?: number[];
  preferredHookTypes?: string[];
  preferredHashtags?: string[];
  avoidHashtags?: string[];
  explorationRate?: number;
}

export interface SocialStrategyVersionRow {
  id: string;
  platform: SocialPlatform;
  version: number;
  config: SocialStrategyConfig;
  based_on_samples: number;
  active: boolean;
  activated_at: string | null;
  created_at: string;
}

export async function ensureSocialDaemonStart(now: Date): Promise<string> {
  const supabase = getPipelineSupabase();
  const { data: existing, error: readError } = await supabase
    .from('social_daemon_state')
    .select('first_started_at')
    .eq('id', SOCIAL_DAEMON_STATE_ID)
    .maybeSingle<{ first_started_at: string }>();
  if (readError) throwSupabaseError(readError);
  if (existing) return existing.first_started_at;

  const startedAt = now.toISOString();
  const { data, error } = await supabase
    .from('social_daemon_state')
    .upsert(
      {
        id: SOCIAL_DAEMON_STATE_ID,
        first_started_at: startedAt,
        updated_at: startedAt,
      },
      { onConflict: 'id', ignoreDuplicates: true },
    )
    .select('first_started_at')
    .maybeSingle<{ first_started_at: string }>();
  if (error) throwSupabaseError(error);
  if (data) return data.first_started_at;

  const { data: raced, error: racedError } = await supabase
    .from('social_daemon_state')
    .select('first_started_at')
    .eq('id', SOCIAL_DAEMON_STATE_ID)
    .single<{ first_started_at: string }>();
  if (racedError) throwSupabaseError(racedError);
  return raced.first_started_at;
}

export async function listSocialPublishCandidates(
  readySince: string,
): Promise<SocialPublishCandidate[]> {
  const { data, error } = await getPipelineSupabase()
    .from('social_publish_candidates')
    .select('episode_id,ready_at')
    .gte('ready_at', readySince)
    .order('ready_at', { ascending: true })
    .returns<SocialPublishCandidate[]>();
  if (error) throwSupabaseError(error);
  return data ?? [];
}

export async function enqueueSocialPublishJob(input: {
  episodeId: string;
  platform: SocialPlatform;
  scheduledAt: string;
  strategyVersionId?: string | null;
}): Promise<boolean> {
  const { data, error } = await getPipelineSupabase()
    .from('social_publish_jobs')
    .upsert(
      {
        episode_id: input.episodeId,
        platform: input.platform,
        scheduled_at: input.scheduledAt,
        next_attempt_at: input.scheduledAt,
        strategy_version_id: input.strategyVersionId ?? null,
      },
      { onConflict: 'episode_id,platform', ignoreDuplicates: true },
    )
    .select('id')
    .maybeSingle<{ id: string }>();
  if (error) throwSupabaseError(error);
  return data !== null;
}

export async function latestScheduledSocialJobs(): Promise<
  Partial<Record<SocialPlatform, string>>
> {
  const { data, error } = await getPipelineSupabase()
    .from('social_publish_jobs')
    .select('platform,scheduled_at')
    .order('scheduled_at', { ascending: false })
    .limit(100)
    .returns<{ platform: SocialPlatform; scheduled_at: string }[]>();
  if (error) throwSupabaseError(error);
  const latest: Partial<Record<SocialPlatform, string>> = {};
  for (const row of data ?? []) {
    latest[row.platform] ??= row.scheduled_at;
  }
  return latest;
}

export async function claimSocialPublishJob(input: {
  owner: string;
  now: Date;
}): Promise<SocialPublishJobRow | null> {
  const { data, error } = await getPipelineSupabase().rpc(
    'claim_social_publish_job',
    {
      p_owner: input.owner,
      p_now: input.now.toISOString(),
    },
  );
  if (error) throwSupabaseError(error);
  const rows = (data ?? []) as SocialPublishJobRow[];
  return rows[0] ?? null;
}

async function updateSocialPublishJob(
  jobId: string,
  owner: string,
  update: Record<string, unknown>,
): Promise<void> {
  const { data, error } = await getPipelineSupabase()
    .from('social_publish_jobs')
    .update(update)
    .eq('id', jobId)
    .eq('lease_owner', owner)
    .select('id')
    .maybeSingle<{ id: string }>();
  if (error) throwSupabaseError(error);
  if (!data) throw new Error(`Social publish job ${jobId} lease was lost.`);
}

export async function completeSocialPublishJob(input: {
  jobId: string;
  owner: string;
  completedAt: Date;
  socialPostId?: string | null;
}): Promise<void> {
  const completedAt = input.completedAt.toISOString();
  await updateSocialPublishJob(input.jobId, input.owner, {
    status: 'completed',
    completed_at: completedAt,
    social_post_id: input.socialPostId ?? null,
    lease_owner: null,
    lease_expires_at: null,
    last_error: null,
    updated_at: completedAt,
  });
}

export async function failSocialPublishJob(input: {
  jobId: string;
  owner: string;
  now: Date;
  attemptCount: number;
  error: string;
}): Promise<void> {
  const nextAttemptAt = new Date(
    input.now.getTime() + publishRetryDelayMs(input.attemptCount),
  ).toISOString();
  await updateSocialPublishJob(input.jobId, input.owner, {
    status: 'failed',
    next_attempt_at: nextAttemptAt,
    lease_owner: null,
    lease_expires_at: null,
    last_error: input.error.slice(0, 4_000),
    updated_at: input.now.toISOString(),
  });
}

export function publishRetryDelayMs(attemptCount: number): number {
  const exponent = Math.max(0, Math.min(7, attemptCount - 1));
  return Math.min(6 * 60 * 60_000, 5 * 60_000 * 2 ** exponent);
}

export async function getActiveSocialStrategies(): Promise<
  SocialStrategyVersionRow[]
> {
  const { data, error } = await getPipelineSupabase()
    .from('social_strategy_versions')
    .select('*')
    .eq('active', true)
    .returns<SocialStrategyVersionRow[]>();
  if (error) throwSupabaseError(error);
  return data ?? [];
}

export async function getSocialStrategyById(
  id: string,
): Promise<SocialStrategyVersionRow | null> {
  const { data, error } = await getPipelineSupabase()
    .from('social_strategy_versions')
    .select('*')
    .eq('id', id)
    .maybeSingle<SocialStrategyVersionRow>();
  if (error) throwSupabaseError(error);
  return data;
}

export async function activateSocialStrategy(input: {
  platform: SocialPlatform;
  config: SocialStrategyConfig;
  basedOnSamples: number;
  now: Date;
}): Promise<SocialStrategyVersionRow> {
  const supabase = getPipelineSupabase();
  const { data: current, error: versionError } = await supabase
    .from('social_strategy_versions')
    .select('version')
    .eq('platform', input.platform)
    .order('version', { ascending: false })
    .limit(1)
    .returns<{ version: number }[]>();
  if (versionError) throwSupabaseError(versionError);
  const version = (current?.[0]?.version ?? 0) + 1;
  const nowIso = input.now.toISOString();

  const { error: deactivateError } = await supabase
    .from('social_strategy_versions')
    .update({ active: false })
    .eq('platform', input.platform)
    .eq('active', true);
  if (deactivateError) throwSupabaseError(deactivateError);

  const { data, error } = await supabase
    .from('social_strategy_versions')
    .insert({
      platform: input.platform,
      version,
      config: input.config,
      based_on_samples: input.basedOnSamples,
      active: true,
      activated_at: nowIso,
    })
    .select('*')
    .single<SocialStrategyVersionRow>();
  if (error) throwSupabaseError(error);
  return data;
}

export async function listLearningSocialPosts(
  publishedSince: string,
): Promise<SocialPostRow[]> {
  const { data, error } = await getPipelineSupabase()
    .from('social_posts')
    .select('*')
    .gte('published_at', publishedSince)
    .order('published_at', { ascending: true })
    .returns<SocialPostRow[]>();
  if (error) throwSupabaseError(error);
  return data ?? [];
}

export async function listLearningSocialMetrics(
  capturedSince: string,
): Promise<SocialPostMetricRow[]> {
  const { data, error } = await getPipelineSupabase()
    .from('social_post_metrics')
    .select('*')
    .gte('captured_at', capturedSince)
    .order('captured_at', { ascending: true })
    .returns<SocialPostMetricRow[]>();
  if (error) throwSupabaseError(error);
  return data ?? [];
}

export async function listDueMetricPosts(
  publishedSince: string,
): Promise<SocialPostRow[]> {
  return listLearningSocialPosts(publishedSince);
}

export async function listMetricWindowsForPosts(
  postIds: readonly string[],
): Promise<{ social_post_id: string; measurement_window: string | null }[]> {
  if (postIds.length === 0) return [];
  const { data, error } = await getPipelineSupabase()
    .from('social_post_metrics')
    .select('social_post_id,measurement_window')
    .in('social_post_id', [...postIds])
    .not('measurement_window', 'is', null)
    .returns<{ social_post_id: string; measurement_window: string | null }[]>();
  if (error) throwSupabaseError(error);
  return data ?? [];
}
