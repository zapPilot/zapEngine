import {
  getPipelineSupabase,
  throwSupabaseError,
} from '../services/supabase-client.js';
import type {
  NewSocialAccountSnapshot,
  PrimaryLanguageCode,
  SocialAccountSnapshotRow,
  SocialDistributionMetadata,
  SocialPostMetricRow,
  SocialPostRow,
} from '../types.js';
import type { SocialPlatform } from './platforms.js';

export const SOCIAL_DAEMON_STATE_ID = 'local-social-daemon-v1';

export type SocialMetricWindowLabel = '1h' | '6h' | '24h' | '72h' | '7d';

export interface SocialPublishCandidate {
  episode_id: string;
  ready_at: string;
  language_code: PrimaryLanguageCode;
  episode_created_at: string;
}

export interface SocialPublishJobRow {
  id: string;
  episode_id: string;
  platform: SocialPlatform;
  language_code: PrimaryLanguageCode;
  experiment_key: string | null;
  experiment_variant: string | null;
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

export interface SocialQueueItem {
  episodeId: string;
  platform: SocialPlatform;
  languageCode: PrimaryLanguageCode;
  status: SocialPublishJobRow['status'];
  title: string | null;
  nextAt: string;
}

export interface SocialQueueLaneItem extends SocialQueueItem {
  experiment: string | null;
}

export interface SocialQueueEpisode {
  episodeId: string;
  languageCode: PrimaryLanguageCode;
  title: string | null;
  nextAt: string;
}

export interface SocialQueueSnapshot {
  pendingCount: number;
  episodeQueue: SocialQueueEpisode[];
  nextByPlatform: Partial<Record<SocialPlatform, SocialQueueItem>>;
  nextByLane: Record<string, SocialQueueLaneItem>;
  waitingMedia: SocialWaitingMediaItem[];
}

export interface SocialWaitingMediaItem {
  episodeId: string;
  platform: SocialPlatform;
  languageCode: PrimaryLanguageCode;
  title: string | null;
  experiment: string | null;
}

export interface SocialPublishSlot {
  hour: number;
  minute: number;
}

export interface SocialStrategyConfig {
  publishSlotsJst?: SocialPublishSlot[];
  preferredHookTypes?: string[];
  preferredHashtags?: string[];
  avoidHashtags?: string[];
  explorationRate?: number;
}

export interface SocialStrategyVersionRow {
  id: string;
  platform: SocialPlatform;
  language_code?: PrimaryLanguageCode;
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
    .select('episode_id,ready_at,language_code,episode_created_at')
    .gte('ready_at', readySince)
    .order('ready_at', { ascending: true })
    .returns<SocialPublishCandidate[]>();
  if (error) throwSupabaseError(error);
  return data ?? [];
}

// A conflict-ignoring upsert and a status-fenced update both ask the same
// question -- did this actually touch a row? -- so they share the answer, not
// the builder: `upsert` and `update` produce POST and PATCH builders whose
// types do not unify.
async function affectedSocialPublishJobRow(
  mutation: PromiseLike<{ data: { id: string } | null; error: unknown }>,
): Promise<boolean> {
  const { data, error } = await mutation;
  if (error) throwSupabaseError(error);
  return data !== null;
}

// No strategy version is stamped here. A job can be queued days before it is
// due -- or before any version exists at all -- so the version it publishes
// under is resolved at claim time and recorded on completion.
export async function enqueueSocialPublishJob(
  input: SocialDistributionMetadata & {
    episodeId: string;
    platform: SocialPlatform;
    scheduledAt: string;
  },
): Promise<boolean> {
  return affectedSocialPublishJobRow(
    getPipelineSupabase()
      .from('social_publish_jobs')
      .upsert(
        {
          episode_id: input.episodeId,
          platform: input.platform,
          language_code: input.languageCode ?? 'zh-Hant',
          experiment_key: input.experimentKey ?? null,
          experiment_variant: input.experimentVariant ?? null,
          scheduled_at: input.scheduledAt,
          next_attempt_at: input.scheduledAt,
        },
        {
          onConflict: 'episode_id,platform,language_code',
          ignoreDuplicates: true,
        },
      )
      .select('id')
      .maybeSingle<{ id: string }>(),
  );
}

export async function latestPendingSocialPublishSchedule(): Promise<
  string | null
> {
  const { data, error } = await getPipelineSupabase()
    .from('social_publish_jobs')
    .select('scheduled_at')
    .in('status', ['queued', 'failed', 'processing'])
    .order('scheduled_at', { ascending: false })
    .limit(1)
    .maybeSingle<{ scheduled_at: string }>();
  if (error) throwSupabaseError(error);
  return data?.scheduled_at ?? null;
}

export interface PendingSocialPublishSchedule {
  episode_id: string;
  language_code: PrimaryLanguageCode;
  scheduled_at: string;
  completed_at: string | null;
  status: SocialPublishJobRow['status'];
}

export async function listPendingSocialPublishSchedules(): Promise<
  PendingSocialPublishSchedule[]
> {
  const { data, error } = await getPipelineSupabase()
    .from('social_publish_jobs')
    .select('episode_id,language_code,scheduled_at,completed_at,status')
    .in('status', ['queued', 'failed', 'processing', 'completed'])
    .order('scheduled_at', { ascending: true })
    .returns<PendingSocialPublishSchedule[]>();
  if (error) throwSupabaseError(error);
  return data ?? [];
}

export async function alignPendingSocialPublishSchedules(): Promise<number> {
  const { data, error } = await getPipelineSupabase()
    .from('social_publish_jobs')
    .select('id,episode_id,language_code,status,scheduled_at,next_attempt_at')
    .in('status', ['queued', 'failed'])
    .returns<
      Pick<
        SocialPublishJobRow,
        | 'id'
        | 'episode_id'
        | 'status'
        | 'scheduled_at'
        | 'next_attempt_at'
        | 'language_code'
      >[]
    >();
  if (error) throwSupabaseError(error);

  const jobs = data ?? [];
  const earliestByEpisodeLanguage = new Map<string, string>();
  for (const job of jobs) {
    const key = `${job.episode_id}|${job.language_code ?? 'zh-Hant'}`;
    const current = earliestByEpisodeLanguage.get(key);
    if (!current || Date.parse(job.scheduled_at) < Date.parse(current)) {
      earliestByEpisodeLanguage.set(key, job.scheduled_at);
    }
  }

  let aligned = 0;
  for (const job of jobs) {
    const scheduledAt = earliestByEpisodeLanguage.get(
      `${job.episode_id}|${job.language_code ?? 'zh-Hant'}`,
    );
    if (!scheduledAt || scheduledAt === job.scheduled_at) continue;
    const patch: Partial<SocialPublishJobRow> = { scheduled_at: scheduledAt };
    if (job.status === 'queued') patch.next_attempt_at = scheduledAt;
    const { data: updated, error: updateError } = await getPipelineSupabase()
      .from('social_publish_jobs')
      .update(patch)
      .eq('id', job.id)
      .eq('status', job.status)
      .select('id')
      .maybeSingle<{ id: string }>();
    if (updateError) throwSupabaseError(updateError);
    if (updated) aligned += 1;
  }
  return aligned;
}

export async function getSocialQueueSnapshot(
  options: { includeWaitingMedia?: boolean } = {},
): Promise<SocialQueueSnapshot> {
  const supabase = getPipelineSupabase();
  const { data, error } = await supabase
    .from('social_publish_jobs')
    .select(
      'episode_id,platform,language_code,experiment_key,experiment_variant,status,scheduled_at,next_attempt_at',
    )
    .in('status', ['queued', 'failed', 'processing'])
    .returns<
      Pick<
        SocialPublishJobRow,
        | 'episode_id'
        | 'platform'
        | 'language_code'
        | 'experiment_key'
        | 'experiment_variant'
        | 'status'
        | 'scheduled_at'
        | 'next_attempt_at'
      >[]
    >();
  if (error) throwSupabaseError(error);

  const jobs = data ?? [];
  const waitingMedia = options.includeWaitingMedia
    ? await listWaitingSocialMedia()
    : [];
  if (jobs.length === 0) {
    return withQueueLanes(
      {
        pendingCount: 0,
        episodeQueue: [],
        nextByPlatform: {},
      },
      {},
      waitingMedia,
    );
  }

  const episodeIds = [...new Set(jobs.map((job) => job.episode_id))];
  const { data: localizations, error: localizationError } = await supabase
    .from('episode_localizations')
    .select('episode_id,language_code,title')
    .in('episode_id', episodeIds)
    .returns<
      {
        episode_id: string;
        language_code: PrimaryLanguageCode;
        title: string | null;
      }[]
    >();
  if (localizationError) throwSupabaseError(localizationError);

  const titleByEpisodeLanguage = new Map(
    (localizations ?? []).map((row) => [
      `${row.episode_id}|${row.language_code ?? 'zh-Hant'}`,
      row.title,
    ]),
  );
  const nextByPlatform: Partial<Record<SocialPlatform, SocialQueueItem>> = {};
  const nextByLane: Record<string, SocialQueueLaneItem> = {};
  const sortedJobs = [...jobs].sort(
    (left, right) => Date.parse(jobNextAt(left)) - Date.parse(jobNextAt(right)),
  );
  const episodeQueue: SocialQueueEpisode[] = [];
  const queuedEpisodes = new Set<string>();
  for (const job of sortedJobs) {
    const languageCode = job.language_code ?? 'zh-Hant';
    const episodeLanguage = `${job.episode_id}|${languageCode}`;
    if (!queuedEpisodes.has(episodeLanguage)) {
      queuedEpisodes.add(episodeLanguage);
      episodeQueue.push({
        episodeId: job.episode_id,
        languageCode,
        title:
          titleByEpisodeLanguage.get(`${job.episode_id}|${languageCode}`) ??
          null,
        nextAt: jobNextAt(job),
      });
    }
    const item: SocialQueueItem = {
      episodeId: job.episode_id,
      platform: job.platform,
      languageCode,
      status: job.status,
      title:
        titleByEpisodeLanguage.get(`${job.episode_id}|${languageCode}`) ?? null,
      nextAt: jobNextAt(job),
    };
    nextByPlatform[job.platform] ??= item;
    nextByLane[`${job.platform}|${languageCode}`] ??= {
      ...item,
      experiment:
        job.experiment_key && job.experiment_variant
          ? `${job.experiment_key}:${job.experiment_variant}`
          : null,
    };
  }

  return withQueueLanes(
    { pendingCount: jobs.length, episodeQueue, nextByPlatform },
    nextByLane,
    waitingMedia,
  );
}

function withQueueLanes(
  snapshot: Omit<SocialQueueSnapshot, 'nextByLane' | 'waitingMedia'>,
  nextByLane: SocialQueueSnapshot['nextByLane'],
  waitingMedia: SocialWaitingMediaItem[],
): SocialQueueSnapshot {
  // Keep the historical enumerable snapshot shape stable for existing log and
  // monitoring consumers while exposing the multilingual lane index directly.
  Object.defineProperties(snapshot, {
    nextByLane: { value: nextByLane, enumerable: false },
    waitingMedia: { value: waitingMedia, enumerable: false },
  });
  return snapshot as SocialQueueSnapshot;
}

async function listWaitingSocialMedia(): Promise<SocialWaitingMediaItem[]> {
  const { data, error } = await getPipelineSupabase()
    .from('social_waiting_media')
    .select(
      'episode_id,platform,language_code,title,experiment_key,experiment_variant',
    )
    .returns<
      {
        episode_id: string;
        platform: SocialPlatform;
        language_code: PrimaryLanguageCode;
        title: string | null;
        experiment_key: string | null;
        experiment_variant: string | null;
      }[]
    >();
  if (error) throwSupabaseError(error);
  return (data ?? []).map((row) => ({
    episodeId: row.episode_id,
    platform: row.platform,
    languageCode: row.language_code,
    title: row.title,
    experiment:
      row.experiment_key && row.experiment_variant
        ? `${row.experiment_key}:${row.experiment_variant}`
        : null,
  }));
}

function jobNextAt(
  job: Pick<SocialPublishJobRow, 'status' | 'scheduled_at' | 'next_attempt_at'>,
): string {
  return job.status === 'failed' ? job.next_attempt_at : job.scheduled_at;
}

export interface UnfinishedSocialPublishJob {
  id: string;
  episode_id: string;
  platform: SocialPlatform;
  language_code: PrimaryLanguageCode;
  status: 'queued' | 'failed';
}

// `processing` rows are deliberately excluded: their lease owner may be
// mid-publish, and the claim RPC is the only thing allowed to take an expired
// lease back.
export async function listUnfinishedSocialPublishJobs(): Promise<
  UnfinishedSocialPublishJob[]
> {
  const { data, error } = await getPipelineSupabase()
    .from('social_publish_jobs')
    .select('id,episode_id,platform,language_code,status')
    .in('status', ['queued', 'failed'])
    .returns<UnfinishedSocialPublishJob[]>();
  if (error) throwSupabaseError(error);
  return data ?? [];
}

export async function skipOverdueSocialPublishJobs(input: {
  now: Date;
  graceMs: number;
}): Promise<number> {
  if (!Number.isSafeInteger(input.graceMs) || input.graceMs <= 0) {
    throw new Error('Social publish overdue grace must be a positive integer.');
  }

  const completedAt = input.now.toISOString();
  const cutoff = new Date(input.now.getTime() - input.graceMs).toISOString();
  const { data, error } = await getPipelineSupabase()
    .from('social_publish_jobs')
    .update({
      status: 'completed',
      completed_at: completedAt,
      lease_owner: null,
      lease_expires_at: null,
      last_error: `skipped: overdue; grace_ms=${input.graceMs}; cutoff=${cutoff}`,
      updated_at: completedAt,
    })
    .in('status', ['queued', 'failed'])
    .lt('scheduled_at', cutoff)
    .select('id')
    .returns<{ id: string }[]>();
  if (error) throwSupabaseError(error);
  return data?.length ?? 0;
}

export async function claimSocialPublishBatch(input: {
  owner: string;
  now: Date;
}): Promise<SocialPublishJobRow[]> {
  const { data, error } = await getPipelineSupabase().rpc(
    'claim_social_publish_batch',
    {
      p_owner: input.owner,
      p_now: input.now.toISOString(),
    },
  );
  if (error) throwSupabaseError(error);
  return (data ?? []) as SocialPublishJobRow[];
}

async function updateOwnedSocialPublishJob(
  jobId: string,
  owner: string,
  patch: Partial<SocialPublishJobRow>,
): Promise<void> {
  const { data, error } = await getPipelineSupabase()
    .from('social_publish_jobs')
    .update(patch)
    .eq('id', jobId)
    .eq('lease_owner', owner)
    .select('id')
    .maybeSingle<{ id: string }>();
  if (error) throwSupabaseError(error);
  if (!data) throw new Error(`Social publish job ${jobId} lease was lost.`);
}

function completedSocialPublishJobPatch(
  completedAt: string,
  socialPostId: string | null,
  strategyVersionId?: string | null,
): Partial<SocialPublishJobRow> {
  return {
    status: 'completed',
    completed_at: completedAt,
    social_post_id: socialPostId,
    lease_owner: null,
    lease_expires_at: null,
    last_error: null,
    updated_at: completedAt,
    // Left untouched when absent: a job completed from evidence in
    // `social_posts` was not published under any guidance this daemon applied.
    ...(strategyVersionId !== undefined
      ? { strategy_version_id: strategyVersionId }
      : {}),
  };
}

export async function completeSocialPublishJob(input: {
  jobId: string;
  owner: string;
  completedAt: Date;
  socialPostId?: string | null;
  /** The strategy version whose guidance this publish actually used. */
  strategyVersionId?: string | null;
}): Promise<void> {
  const completedAt = input.completedAt.toISOString();
  await updateOwnedSocialPublishJob(
    input.jobId,
    input.owner,
    completedSocialPublishJobPatch(
      completedAt,
      input.socialPostId ?? null,
      input.strategyVersionId,
    ),
  );
}

// Completes a job from evidence in `social_posts` rather than from a publish
// this daemon performed, so a manual `social:publish` -- or a crash after the
// post row was written -- cannot leave the queue retrying a platform that is
// already live. The status filter is the fence: a `processing` row belongs to
// whoever holds its lease.
export async function reconcileSocialPublishJob(input: {
  jobId: string;
  socialPostId: string;
  completedAt: Date;
}): Promise<boolean> {
  const completedAt = input.completedAt.toISOString();
  return affectedSocialPublishJobRow(
    getPipelineSupabase()
      .from('social_publish_jobs')
      .update(completedSocialPublishJobPatch(completedAt, input.socialPostId))
      .eq('id', input.jobId)
      .in('status', ['queued', 'failed'])
      .select('id')
      .maybeSingle<{ id: string }>(),
  );
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
  await updateOwnedSocialPublishJob(input.jobId, input.owner, {
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

// Newest row per platform: the same query answers the 24h staleness gate and
// the dashboard's current follower counts.
export async function latestSocialAccountSnapshots(): Promise<
  Partial<Record<SocialPlatform, SocialAccountSnapshotRow>>
> {
  const { data, error } = await getPipelineSupabase()
    .from('social_account_snapshots')
    .select('*')
    .order('captured_at', { ascending: false })
    .limit(100)
    .returns<SocialAccountSnapshotRow[]>();
  if (error) throwSupabaseError(error);
  const latest: Partial<Record<SocialPlatform, SocialAccountSnapshotRow>> = {};
  for (const row of data ?? []) latest[row.platform] ??= row;
  return latest;
}

export async function insertSocialAccountSnapshot(
  input: NewSocialAccountSnapshot,
): Promise<void> {
  const { error } = await getPipelineSupabase()
    .from('social_account_snapshots')
    .insert({
      platform: input.platform,
      followers: input.followers,
      details: input.details ?? {},
    });
  if (error) throwSupabaseError(error);
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

export async function activateSocialStrategy(input: {
  platform: SocialPlatform;
  languageCode?: PrimaryLanguageCode;
  config: SocialStrategyConfig;
  basedOnSamples: number;
  now: Date;
}): Promise<SocialStrategyVersionRow> {
  const supabase = getPipelineSupabase();
  const languageCode = input.languageCode ?? 'zh-Hant';
  const { data: current, error: versionError } = await supabase
    .from('social_strategy_versions')
    .select('version')
    .eq('platform', input.platform)
    .eq('language_code', languageCode)
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
    .eq('language_code', languageCode)
    .eq('active', true);
  if (deactivateError) throwSupabaseError(deactivateError);

  const { data, error } = await supabase
    .from('social_strategy_versions')
    .insert({
      platform: input.platform,
      language_code: languageCode,
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
