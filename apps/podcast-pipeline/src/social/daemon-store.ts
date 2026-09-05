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

// Mirrors the `attempt_count < 8` fence inside `claim_social_publish_batch`. A
// lane that has burned every attempt is never claimable again, so the queue
// snapshot flags it rather than reporting a time that will never arrive, and
// the partial-cohort fence stops treating it as recoverable work.
export const MAX_PUBLISH_ATTEMPTS = 8;

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
  leaseExpiresAt?: string;
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

/**
 * Learned copy guidance only. Publish timing used to live here too and was
 * never read -- the scheduler always used its own defaults -- so it is now
 * code-owned in `policy.ts`, where a learner cannot widen a daily cap by
 * writing a row. Extra keys on historical rows are simply ignored.
 */
export interface SocialStrategyConfig {
  preferredHookTypes?: string[];
  preferredHashtags?: string[];
  avoidHashtags?: string[];
  /** ε-greedy copy exploration. */
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

const CANDIDATE_PAGE_SIZE = 1000;
/**
 * A uuid costs 39 bytes inside an `in.(...)` filter and supabase-js never falls
 * back to POST for a select, so an unchunked list walks the request line into
 * the gateway's header buffer at a couple of hundred episodes.
 */
const CANDIDATE_ID_CHUNK_SIZE = 100;
const CANDIDATE_FIELDS = 'episode_id,ready_at,language_code,episode_created_at';

/**
 * `social_publish_candidates` grows monotonically -- it has no exclusion for
 * episodes that already have a job or a post -- so this has to be paged.
 * PostgREST truncates at its configured row cap without an error, and because
 * the order is ascending, an unpaged read would eventually return only the
 * oldest rows and silently stop discovering new episodes.
 *
 * Paging is keyed on `(ready_at, episode_id, language_code)` rather than
 * `ready_at` alone: the view exposes no unique column, sibling languages of one
 * episode routinely share a `ready_at`, and rows that tie would shift between
 * pages.
 */
export async function listSocialPublishCandidates(
  readySince: string,
): Promise<SocialPublishCandidate[]> {
  const rows: SocialPublishCandidate[] = [];
  for (let offset = 0; ; offset += CANDIDATE_PAGE_SIZE) {
    const page = unwrapCandidates(
      await getPipelineSupabase()
        .from('social_publish_candidates')
        .select(CANDIDATE_FIELDS)
        .gte('ready_at', readySince)
        .order('ready_at', { ascending: true })
        .order('episode_id', { ascending: true })
        .order('language_code', { ascending: true })
        .range(offset, offset + CANDIDATE_PAGE_SIZE - 1)
        .returns<SocialPublishCandidate[]>(),
    );
    rows.push(...page);
    if (page.length < CANDIDATE_PAGE_SIZE) return rows;
  }
}

// The anchor filter above is applied per lane, not per episode: a canonical
// zh-Hant localization that finished ready before `readySince` would
// otherwise never appear here, so an episode discovered through one recently
// ready language always looks permanently incomplete. Callers that already
// know which episodes matter use this instead, unfiltered by anchor, to see
// every ready language for exactly those episodes.
export async function listSocialPublishCandidatesForEpisodes(
  episodeIds: readonly string[],
): Promise<SocialPublishCandidate[]> {
  const ids = [...new Set(episodeIds)];
  const rows: SocialPublishCandidate[] = [];
  for (let start = 0; start < ids.length; start += CANDIDATE_ID_CHUNK_SIZE) {
    const chunk = ids.slice(start, start + CANDIDATE_ID_CHUNK_SIZE);
    rows.push(
      ...unwrapCandidates(
        await getPipelineSupabase()
          .from('social_publish_candidates')
          .select(CANDIDATE_FIELDS)
          .in('episode_id', chunk)
          .order('ready_at', { ascending: true })
          .returns<SocialPublishCandidate[]>(),
      ),
    );
  }
  return rows;
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

/**
 * Observational preflight only: this does not claim or mutate a lane. A slightly
 * wider predicate than the cohort publish preflight is intentional; an extra
 * recent baseline is harmless, while missing one weakens follower attribution.
 */
export async function listDueSocialPublishPlatforms(
  now: Date,
): Promise<SocialPlatform[]> {
  const nowIso = now.toISOString();
  const { data, error } = await getPipelineSupabase()
    .from('social_publish_jobs')
    .select('platform')
    .in('status', ['queued', 'failed'])
    .lte('scheduled_at', nowIso)
    .lte('next_attempt_at', nowIso)
    .lt('attempt_count', MAX_PUBLISH_ATTEMPTS)
    .returns<{ platform: SocialPlatform }[]>();
  if (error) throwSupabaseError(error);
  return [...new Set((data ?? []).map((row) => row.platform))];
}

export interface PendingSocialPublishSchedule {
  episode_id: string;
  platform: SocialPlatform;
  language_code: PrimaryLanguageCode;
  scheduled_at: string;
  completed_at: string | null;
  status: SocialPublishJobRow['status'];
  experiment_key?: string | null;
  experiment_variant?: string | null;
}

export async function listPendingSocialPublishSchedules(): Promise<
  PendingSocialPublishSchedule[]
> {
  const { data, error } = await getPipelineSupabase()
    .from('social_publish_jobs')
    .select(
      'episode_id,platform,language_code,scheduled_at,completed_at,status,experiment_key,experiment_variant',
    )
    .in('status', ['queued', 'failed', 'processing', 'completed'])
    .order('scheduled_at', { ascending: true })
    .returns<PendingSocialPublishSchedule[]>();
  if (error) throwSupabaseError(error);
  return data ?? [];
}

export interface PastDueSocialPublishJob {
  id: string;
  episode_id: string;
  platform: SocialPlatform;
  language_code: PrimaryLanguageCode | null;
  status: 'queued' | 'failed';
  scheduled_at: string;
}

/**
 * Lanes whose slot has already passed. `processing` is excluded on purpose: a
 * lease owner may be mid-publish, and only the claim RPC may take an expired
 * lease back.
 */
export async function listPastDueSocialPublishJobs(
  cutoff: Date,
): Promise<PastDueSocialPublishJob[]> {
  const { data, error } = await getPipelineSupabase()
    .from('social_publish_jobs')
    .select('id,episode_id,platform,language_code,status,scheduled_at')
    .in('status', ['queued', 'failed'])
    .lt('scheduled_at', cutoff.toISOString())
    .order('scheduled_at', { ascending: true })
    .returns<PastDueSocialPublishJob[]>();
  if (error) throwSupabaseError(error);
  return data ?? [];
}

/**
 * Moves one lane to a later slot. Nothing is ever dropped or brought forward:
 * a missed slot is a slot the account did not spend, and publishing a backlog
 * the moment it is noticed is exactly the burst the daily caps exist to stop.
 *
 * `next_attempt_at` follows `scheduled_at` because the claim RPC fences on
 * both, and a retry backoff left behind the new slot would make the lane
 * unclaimable at a time it is supposed to be due. The status fence is what
 * makes this safe beside a live claim: a claimed row is `processing` and no
 * longer matches.
 */
export async function rescheduleSocialPublishJob(input: {
  jobId: string;
  status: 'queued' | 'failed';
  scheduledAt: Date;
  now: Date;
}): Promise<boolean> {
  const scheduledAt = input.scheduledAt.toISOString();
  return affectedSocialPublishJobRow(
    getPipelineSupabase()
      .from('social_publish_jobs')
      .update({
        scheduled_at: scheduledAt,
        next_attempt_at: scheduledAt,
        updated_at: input.now.toISOString(),
      })
      .eq('id', input.jobId)
      .eq('status', input.status)
      .select('id')
      .maybeSingle<{ id: string }>(),
  );
}

export async function getSocialQueueSnapshot(
  options: { includeWaitingMedia?: boolean } = {},
): Promise<SocialQueueSnapshot> {
  const supabase = getPipelineSupabase();
  const { data, error } = await supabase
    .from('social_publish_jobs')
    .select(
      'episode_id,platform,language_code,experiment_key,experiment_variant,status,scheduled_at,next_attempt_at,attempt_count,lease_expires_at',
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
        | 'lease_expires_at'
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
      ...(job.status === 'processing' && job.lease_expires_at
        ? { leaseExpiresAt: job.lease_expires_at }
        : {}),
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

// Keep the historical enumerable snapshot shape stable for existing log and
// monitoring consumers while exposing the multilingual lane index directly.
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
    .returns<{ episode_id: string; language_code: PrimaryLanguageCode }[]>();
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

// `claim_social_publish_batch` gates a pending lane on `scheduled_at <= now`
// AND `next_attempt_at <= now`, so the soonest it can be picked up is the later
// of the two. Reporting `scheduled_at` alone made a lane whose
// `next_attempt_at` sat further out render as `due now` every tick while the
// claim kept skipping it.
function jobNextAt(
  job: Pick<
    SocialPublishJobRow,
    'scheduled_at' | 'next_attempt_at' | 'status' | 'lease_expires_at'
  >,
): string {
  const nextAt =
    Date.parse(job.next_attempt_at) > Date.parse(job.scheduled_at)
      ? job.next_attempt_at
      : job.scheduled_at;
  return job.status === 'processing' &&
    job.lease_expires_at &&
    Date.parse(job.lease_expires_at) > Date.parse(nextAt)
    ? job.lease_expires_at
    : nextAt;
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

// Used to hand back a claimed-but-never-attempted lane when a sibling lane in
// the same release cohort fails fatally: the lane goes straight back to
// `queued`, immediately claimable, with no backoff applied -- it was never
// actually tried, so there is nothing to retry-delay.
export async function releaseSocialPublishJobLease(input: {
  jobId: string;
  owner: string;
  scheduledAt: string;
  attemptCount: number;
  now: Date;
}): Promise<void> {
  await updateOwnedSocialPublishJob(input.jobId, input.owner, {
    status: 'queued',
    next_attempt_at: input.scheduledAt,
    lease_owner: null,
    lease_expires_at: null,
    ...refundedAttempt(input.attemptCount),
    updated_at: input.now.toISOString(),
  });
}

/**
 * `claim_social_publish_batch` claims an episode's whole cohort in one UPDATE,
 * so it increments `attempt_count` on every due lane before anyone knows which
 * lanes will actually be handed to a transport. A lane that never reached
 * `publish()` must give its attempt back, or a platform that keeps failing
 * walks its siblings to the `attempt_count < 8` claim ceiling and they become
 * permanently unclaimable without ever having been tried.
 *
 * The caller passes the post-claim value it holds, and the write is already
 * fenced on `lease_owner`, so this cannot refund an attempt for a lane some
 * other owner has since claimed.
 */
function refundedAttempt(
  attemptCount: number,
): Pick<SocialPublishJobRow, 'attempt_count'> | Record<string, never> {
  return attemptCount > 0 ? { attempt_count: attemptCount - 1 } : {};
}

/**
 * A lane that sits after the failing one inside the SAME episode|language group
 * is deliberately NOT released: a sibling platform may already be live from
 * that batch call, and requeueing it risks a duplicate publish. It still never
 * reached a transport, so it still has to get its attempt back -- otherwise the
 * one lane that cannot be released is the one that silently exhausts.
 */
export async function refundSocialPublishJobAttempt(input: {
  jobId: string;
  owner: string;
  attemptCount: number;
  now: Date;
}): Promise<void> {
  if (input.attemptCount <= 0) return;
  await updateOwnedSocialPublishJob(input.jobId, input.owner, {
    ...refundedAttempt(input.attemptCount),
    updated_at: input.now.toISOString(),
  });
}

export function publishRetryDelayMs(attemptCount: number): number {
  const exponent = Math.max(0, Math.min(7, attemptCount - 1));
  return Math.min(6 * 60 * 60_000, 5 * 60_000 * 2 ** exponent);
}

// Newest row per platform: the same query answers the staleness gate and the
// dashboard's current follower counts.
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

/**
 * Retires a strategy row whose lane the publish policy no longer ships, so the
 * refresh can heal itself instead of waiting for someone to run SQL.
 */
export async function deactivateSocialStrategy(id: string): Promise<void> {
  const { error } = await getPipelineSupabase()
    .from('social_strategy_versions')
    .update({ active: false })
    .eq('id', id)
    .eq('active', true);
  if (error) throwSupabaseError(error);
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
  // Suppressed posts were never shown to anyone. Learning from their zero
  // snapshots is moderation, not audience feedback; metric collection also
  // has no reason to open a browser for a post the platform hid.
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
