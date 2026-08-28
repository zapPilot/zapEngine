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
const MAX_PUBLISH_ATTEMPTS = 8;

export type SocialMetricWindowLabel = '1h' | '6h' | '24h' | '72h' | '7d';

export interface SocialPublishCandidate {
  episode_id: string;
  ready_at: string;
  language_code: PrimaryLanguageCode;
  episode_created_at: string;
}

export interface SocialEpisodeLocalizationTitle {
  episode_id: string;
  language_code: PrimaryLanguageCode;
  title: string | null;
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
  attemptCount: number;
  attemptsExhausted: boolean;
}

export interface SocialQueueLaneItem extends SocialQueueItem {
  experiment: string | null;
}

export interface SocialQueueEpisodeLane {
  platform: SocialPlatform;
  languageCode: PrimaryLanguageCode;
}

export interface SocialQueueEpisode {
  episodeId: string;
  title: string | null;
  nextAt: string;
  laneCount: number;
  lanes: SocialQueueEpisodeLane[];
}

export interface SocialQueueSnapshot {
  pendingCount: number;
  episodeQueue: SocialQueueEpisode[];
  nextByPlatform: Partial<Record<SocialPlatform, SocialQueueItem>>;
  nextByLane: Record<string, SocialQueueLaneItem>;
  waitingVideos: SocialWaitingVideoItem[];
}

export interface SocialWaitingVideoItem {
  episodeId: string;
  title: string | null;
  languageCodes: PrimaryLanguageCode[];
}

export interface SocialPublishSlot {
  hour: number;
  minute: number;
}

export interface SocialStrategyConfig {
  publishSlotsJst?: SocialPublishSlot[];
  /** Max `(episode, platform)` cohorts that may be scheduled on one JST day. */
  dailyPublishCap?: number;
  /** Deterministic fraction of one-post days assigned to an alternate slot. */
  slotExplorationRate?: number;
  preferredHookTypes?: string[];
  preferredHashtags?: string[];
  avoidHashtags?: string[];
  /** ε-greedy copy exploration; independent from timing exploration. */
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

function unwrapCandidates(result: {
  data: SocialPublishCandidate[] | null;
  error: unknown;
}): SocialPublishCandidate[] {
  if (result.error) throwSupabaseError(result.error);
  return result.data ?? [];
}

export async function listSocialPublishCandidates(
  readySince: string,
): Promise<SocialPublishCandidate[]> {
  return unwrapCandidates(
    await getPipelineSupabase()
      .from('social_publish_candidates')
      .select('episode_id,ready_at,language_code,episode_created_at')
      .gte('ready_at', readySince)
      .order('ready_at', { ascending: true })
      .returns<SocialPublishCandidate[]>(),
  );
}

export async function listSocialPublishCandidatesForEpisodes(
  episodeIds: readonly string[],
): Promise<SocialPublishCandidate[]> {
  if (episodeIds.length === 0) return [];
  return unwrapCandidates(
    await getPipelineSupabase()
      .from('social_publish_candidates')
      .select('episode_id,ready_at,language_code,episode_created_at')
      .in('episode_id', [...episodeIds])
      .order('ready_at', { ascending: true })
      .returns<SocialPublishCandidate[]>(),
  );
}

export async function listSocialEpisodeLocalizationTitles(
  episodeIds: readonly string[],
): Promise<SocialEpisodeLocalizationTitle[]> {
  if (episodeIds.length === 0) return [];
  const { data, error } = await getPipelineSupabase()
    .from('episode_localizations')
    .select('episode_id,language_code,title')
    .in('episode_id', [...episodeIds])
    .returns<SocialEpisodeLocalizationTitle[]>();
  if (error) throwSupabaseError(error);
  return data ?? [];
}

async function affectedSocialPublishJobRow(
  mutation: PromiseLike<{ data: { id: string } | null; error: unknown }>,
): Promise<boolean> {
  const { data, error } = await mutation;
  if (error) throwSupabaseError(error);
  return data !== null;
}

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
  platform: SocialPlatform;
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
    .select(
      'episode_id,platform,language_code,scheduled_at,completed_at,status',
    )
    .in('status', ['queued', 'failed', 'processing', 'completed'])
    .order('scheduled_at', { ascending: true })
    .returns<PendingSocialPublishSchedule[]>();
  if (error) throwSupabaseError(error);
  return data ?? [];
}

function platformCohortKey(episodeId: string, platform: SocialPlatform): string {
  return `${episodeId}|${platform}`;
}

/**
 * Language lanes remain atomic within one platform, but different platforms
 * intentionally schedule independently. Align only `(episode, platform)` so a
 * Rednote 14:30 slot cannot drag X or YouTube to the same timestamp.
 */
export async function alignPendingSocialPublishSchedules(
  now: Date,
): Promise<number> {
  const { data, error } = await getPipelineSupabase()
    .from('social_publish_jobs')
    .select('id,episode_id,platform,status,scheduled_at,next_attempt_at')
    .in('status', ['queued', 'failed', 'processing', 'completed'])
    .returns<
      Pick<
        SocialPublishJobRow,
        | 'id'
        | 'episode_id'
        | 'platform'
        | 'status'
        | 'scheduled_at'
        | 'next_attempt_at'
      >[]
    >();
  if (error) throwSupabaseError(error);

  const jobs = data ?? [];
  const earliestByCohort = new Map<string, string>();
  for (const job of jobs) {
    const key = platformCohortKey(job.episode_id, job.platform);
    const current = earliestByCohort.get(key);
    if (!current || Date.parse(job.scheduled_at) < Date.parse(current)) {
      earliestByCohort.set(key, job.scheduled_at);
    }
  }

  let aligned = 0;
  for (const job of jobs) {
    if (job.status !== 'queued' && job.status !== 'failed') continue;
    const scheduledAt = earliestByCohort.get(
      platformCohortKey(job.episode_id, job.platform),
    );
    if (!scheduledAt) continue;
    const patch = alignmentPatch(job, scheduledAt, now);
    if (!patch) continue;
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

function alignmentPatch(
  job: Pick<SocialPublishJobRow, 'status' | 'scheduled_at' | 'next_attempt_at'>,
  scheduledAt: string,
  now: Date,
): Partial<SocialPublishJobRow> | null {
  if (job.status === 'failed') {
    if (Date.parse(job.scheduled_at) <= now.getTime()) return null;
    if (scheduledAt === job.scheduled_at) return null;
    return { scheduled_at: scheduledAt };
  }

  const blockedUntil = Date.parse(jobNextAt(job));
  if (blockedUntil <= now.getTime()) return null;
  if (blockedUntil <= Date.parse(scheduledAt)) return null;
  return { scheduled_at: scheduledAt, next_attempt_at: scheduledAt };
}

export async function getSocialQueueSnapshot(
  options: { includeWaitingMedia?: boolean } = {},
): Promise<SocialQueueSnapshot> {
  const supabase = getPipelineSupabase();
  const { data, error } = await supabase
    .from('social_publish_jobs')
    .select(
      'episode_id,platform,language_code,experiment_key,experiment_variant,status,scheduled_at,next_attempt_at,attempt_count',
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
        | 'attempt_count'
      >[]
    >();
  if (error) throwSupabaseError(error);

  const jobs = data ?? [];
  const waitingVideos = options.includeWaitingMedia
    ? await listWaitingSocialVideos()
    : [];
  if (jobs.length === 0) {
    return withQueueLanes(
      {
        pendingCount: 0,
        episodeQueue: [],
        nextByPlatform: {},
      },
      {},
      waitingVideos,
    );
  }

  const episodeIds = [...new Set(jobs.map((job) => job.episode_id))];
  const localizations = await listSocialEpisodeLocalizationTitles(episodeIds);
  const titleByEpisodeLanguage = new Map(
    localizations.map((row) => [
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
  const lanesByEpisode = new Map<string, SocialQueueEpisodeLane[]>();
  for (const job of jobs) {
    const lanes = lanesByEpisode.get(job.episode_id) ?? [];
    lanes.push({
      platform: job.platform,
      languageCode: job.language_code ?? 'zh-Hant',
    });
    lanesByEpisode.set(job.episode_id, lanes);
  }
  for (const job of sortedJobs) {
    const languageCode = job.language_code ?? 'zh-Hant';
    if (!queuedEpisodes.has(job.episode_id)) {
      queuedEpisodes.add(job.episode_id);
      const episode = {
        episodeId: job.episode_id,
        title:
          titleByEpisodeLanguage.get(`${job.episode_id}|${languageCode}`) ??
          null,
        nextAt: jobNextAt(job),
      } as SocialQueueEpisode;
      const lanes = lanesByEpisode.get(job.episode_id) ?? [];
      Object.defineProperties(episode, {
        laneCount: { value: lanes.length || 1, enumerable: false },
        lanes: { value: lanes, enumerable: false },
      });
      episodeQueue.push(episode);
    }
    const item: SocialQueueItem = {
      episodeId: job.episode_id,
      platform: job.platform,
      languageCode,
      status: job.status,
      title:
        titleByEpisodeLanguage.get(`${job.episode_id}|${languageCode}`) ?? null,
      nextAt: jobNextAt(job),
      attemptCount: job.attempt_count,
      attemptsExhausted: job.attempt_count >= MAX_PUBLISH_ATTEMPTS,
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
    waitingVideos,
  );
}

function withQueueLanes(
  snapshot: Omit<SocialQueueSnapshot, 'nextByLane' | 'waitingVideos'>,
  nextByLane: SocialQueueSnapshot['nextByLane'],
  waitingVideos: SocialWaitingVideoItem[],
): SocialQueueSnapshot {
  Object.defineProperties(snapshot, {
    nextByLane: { value: nextByLane, enumerable: false },
    waitingVideos: { value: waitingVideos, enumerable: false },
  });
  return snapshot as SocialQueueSnapshot;
}

async function listWaitingSocialVideos(): Promise<SocialWaitingVideoItem[]> {
  const { data, error } = await getPipelineSupabase()
    .from('social_waiting_media')
    .select('episode_id,language_code')
    .returns<
      { episode_id: string; language_code: PrimaryLanguageCode }[]
    >();
  if (error) throwSupabaseError(error);

  const rows = data ?? [];
  if (rows.length === 0) return [];
  const episodeIds = [...new Set(rows.map((row) => row.episode_id))];
  const titles = await listSocialEpisodeLocalizationTitles(episodeIds);
  const titleByEpisodeLanguage = new Map(
    titles.map((row) => [
      `${row.episode_id}|${row.language_code ?? 'zh-Hant'}`,
      row.title,
    ]),
  );
  const languagesByEpisode = new Map<string, Set<PrimaryLanguageCode>>();
  for (const row of rows) {
    const languages = languagesByEpisode.get(row.episode_id) ?? new Set();
    languages.add(row.language_code);
    languagesByEpisode.set(row.episode_id, languages);
  }
  const languageOrder: PrimaryLanguageCode[] = ['zh-Hant', 'ja', 'en'];

  return [...languagesByEpisode.entries()].map(([episodeId, languages]) => ({
    episodeId,
    title:
      titleByEpisodeLanguage.get(`${episodeId}|zh-Hant`) ??
      [...languages]
        .map((language) =>
          titleByEpisodeLanguage.get(`${episodeId}|${language}`),
        )
        .find((title) => title != null) ??
      null,
    languageCodes: languageOrder.filter((language) => languages.has(language)),
  }));
}

function jobNextAt(
  job: Pick<SocialPublishJobRow, 'scheduled_at' | 'next_attempt_at'>,
): string {
  return Date.parse(job.next_attempt_at) > Date.parse(job.scheduled_at)
    ? job.next_attempt_at
    : job.scheduled_at;
}

export interface UnfinishedSocialPublishJob {
  id: string;
  episode_id: string;
  platform: SocialPlatform;
  language_code: PrimaryLanguageCode;
  status: 'queued' | 'failed';
}

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
  const supabase = getPipelineSupabase();

  const { data: completedRows, error: completedError } = await supabase
    .from('social_publish_jobs')
    .select('episode_id,platform')
    .in('status', ['completed'])
    .returns<{ episode_id: string; platform: SocialPlatform }[]>();
  if (completedError) throwSupabaseError(completedError);

  const { data: candidateRows, error: candidateError } = await supabase
    .from('social_publish_jobs')
    .select('id,episode_id,platform')
    .in('status', ['queued', 'failed'])
    .lt('scheduled_at', cutoff)
    .returns<{ id: string; episode_id: string; platform: SocialPlatform }[]>();
  if (candidateError) throwSupabaseError(candidateError);

  const completedCohorts = new Set(
    (completedRows ?? []).map((row) =>
      platformCohortKey(row.episode_id, row.platform),
    ),
  );
  const overdueIds = (candidateRows ?? [])
    .filter(
      (row) =>
        !completedCohorts.has(platformCohortKey(row.episode_id, row.platform)),
    )
    .map((row) => row.id);
  if (overdueIds.length === 0) return 0;

  const { data, error } = await supabase
    .from('social_publish_jobs')
    .update({
      status: 'completed',
      completed_at: completedAt,
      lease_owner: null,
      lease_expires_at: null,
      last_error: `skipped: overdue; grace_ms=${input.graceMs}; cutoff=${cutoff}`,
      updated_at: completedAt,
    })
    .in('id', overdueIds)
    .select('id')
    .returns<{ id: string }[]>();
  if (error) throwSupabaseError(error);
  return data?.length ?? 0;
}

export async function claimSocialPublishBatch(input: {
  owner: string;
  now: Date;
  episodeId?: string;
  platform?: SocialPlatform;
}): Promise<SocialPublishJobRow[]> {
  const { data, error } = await getPipelineSupabase().rpc(
    'claim_social_publish_batch',
    {
      p_owner: input.owner,
      p_now: input.now.toISOString(),
      ...(input.episodeId ? { p_episode_id: input.episodeId } : {}),
      ...(input.platform ? { p_platform: input.platform } : {}),
    },
  );
  if (error) throwSupabaseError(error);
  return (data ?? []) as SocialPublishJobRow[];
}

export interface PartiallyPublishedSocialCohort {
  episodeId: string;
  platform: SocialPlatform;
}

/** completed + still-pending lanes inside one `(episode, platform)` cohort. */
export async function listPartiallyPublishedCohorts(): Promise<
  PartiallyPublishedSocialCohort[]
> {
  const { data, error } = await getPipelineSupabase()
    .from('social_publish_jobs')
    .select('episode_id,platform,status')
    .in('status', ['queued', 'processing', 'failed', 'completed'])
    .returns<
      {
        episode_id: string;
        platform: SocialPlatform;
        status: SocialPublishJobRow['status'];
      }[]
    >();
  if (error) throwSupabaseError(error);

  const completed = new Set<string>();
  const pending = new Map<string, PartiallyPublishedSocialCohort>();
  for (const row of data ?? []) {
    const key = platformCohortKey(row.episode_id, row.platform);
    if (row.status === 'completed') completed.add(key);
    else pending.set(key, { episodeId: row.episode_id, platform: row.platform });
  }
  return [...pending.entries()]
    .filter(([key]) => completed.has(key))
    .map(([, cohort]) => cohort);
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

export async function releaseSocialPublishJobLease(input: {
  jobId: string;
  owner: string;
  scheduledAt: string;
  now: Date;
}): Promise<void> {
  await updateOwnedSocialPublishJob(input.jobId, input.owner, {
    status: 'queued',
    next_attempt_at: input.scheduledAt,
    lease_owner: null,
    lease_expires_at: null,
    updated_at: input.now.toISOString(),
  });
}

export function publishRetryDelayMs(attemptCount: number): number {
  const exponent = Math.max(0, Math.min(7, attemptCount - 1));
  return Math.min(6 * 60 * 60_000, 5 * 60_000 * 2 ** exponent);
}

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
  const rows = data ?? [];
  return rows.filter(
    (post) =>
      post.review_status === null ||
      post.review_status === undefined ||
      post.review_status === 'visible' ||
      post.review_status === 'under_review',
  );
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
