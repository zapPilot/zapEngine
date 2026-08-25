import { hostname } from 'node:os';

import { errorMessage, toError } from '../lib/errorMessage.js';
import { sleep as defaultSleep } from '../lib/sleep.js';
import {
  insertSocialPostMetric,
  listSocialPostIdentitiesByEpisodes,
  listSocialPostsByEpisode,
  updateSocialPostIdentity,
  updateSocialPostReviewStatus,
} from '../services/db.js';
import type { SocialPostRow } from '../types.js';
import { captureDueAccountSnapshots } from './account-snapshots.js';
import {
  acquireSocialDaemonLock,
  SocialDaemonAlreadyRunningError,
} from './daemon-lock.js';
import {
  alignPendingSocialPublishSchedules,
  claimSocialPublishBatch,
  completeSocialPublishJob,
  enqueueSocialPublishJob,
  ensureSocialDaemonStart,
  failSocialPublishJob,
  getActiveSocialStrategies,
  getSocialQueueSnapshot,
  listLearningSocialMetrics,
  listLearningSocialPosts,
  listMetricWindowsForPosts,
  listPendingSocialPublishSchedules,
  listSocialPublishCandidates,
  listUnfinishedSocialPublishJobs,
  type PendingSocialPublishSchedule,
  reconcileSocialPublishJob,
  skipOverdueSocialPublishJobs,
  type SocialMetricWindowLabel,
  type SocialPublishCandidate,
  type SocialPublishJobRow,
  type SocialStrategyVersionRow,
} from './daemon-store.js';
import { buildSocialExperimentReports } from './experiment-report.js';
import { getOrCreateExperimentAssignment } from './experiments.js';
import { isMainModule } from './is-main-module.js';
import {
  createMetricCollectors,
  createMetricsBrowserSession,
} from './metric-collectors.js';
import { buildSocialPostMetric, collectPostMetrics } from './metrics.js';
import type { SocialPlatform } from './platforms.js';
import { policyEntriesForLanguage } from './policy.js';
import { publishSocialBatch } from './publish-batch.js';
import {
  activeStrategyMap,
  buildStrategyGuidance,
  defaultSocialStrategy,
  nextPublishSlot,
  refreshSocialStrategies,
  startOfJstDay,
  strategyMapKey,
} from './strategy.js';

const POLL_INTERVAL_MS = 60_000;
const METRIC_LOOKBACK_DAYS = 8;
const STRATEGY_REFRESH_INTERVAL_MS = 6 * 60 * 60_000;
export const MIN_CROSS_LANGUAGE_GAP_MS = 2 * 60 * 60_000;
const OWNER = `${hostname()}:${process.pid}`;
const SOCIAL_PUBLISH_SKIP_OVERDUE_MINUTES =
  'SOCIAL_PUBLISH_SKIP_OVERDUE_MINUTES';

const METRIC_WINDOWS: readonly {
  label: SocialMetricWindowLabel;
  targetHours: number;
}[] = [
  { label: '1h', targetHours: 1 },
  { label: '6h', targetHours: 6 },
  { label: '24h', targetHours: 24 },
  { label: '72h', targetHours: 72 },
  { label: '7d', targetHours: 168 },
];

export interface SocialDaemonDependencies {
  now?: () => Date;
  sleep?: (milliseconds: number) => Promise<void>;
  log?: (message: string) => void;
}

export function readSocialPublishOverdueGraceMs(
  env: NodeJS.ProcessEnv = process.env,
): number | null {
  const raw = env[SOCIAL_PUBLISH_SKIP_OVERDUE_MINUTES]?.trim();
  if (!raw) return null;

  if (!/^\d+$/.test(raw)) {
    throw new Error(
      `${SOCIAL_PUBLISH_SKIP_OVERDUE_MINUTES} must be a positive integer number of minutes.`,
    );
  }
  const minutes = Number(raw);
  const maxMinutes = Math.floor(Number.MAX_SAFE_INTEGER / 60_000);
  if (!Number.isSafeInteger(minutes) || minutes <= 0 || minutes > maxMinutes) {
    throw new Error(
      `${SOCIAL_PUBLISH_SKIP_OVERDUE_MINUTES} must be a positive integer number of minutes.`,
    );
  }
  return minutes * 60_000;
}

export async function runSocialDaemon(
  dependencies: SocialDaemonDependencies = {},
): Promise<never> {
  const now = dependencies.now ?? (() => new Date());
  const sleep = dependencies.sleep ?? defaultSleep;
  const log = dependencies.log ?? console.log;
  const overdueGraceMs = readSocialPublishOverdueGraceMs();
  let lastStrategyRefresh = 0;

  const firstStartedAt = await ensureSocialDaemonStart(now());
  log(
    `[social-daemon] started as ${OWNER}; discovery begins at ${firstStartedAt}.`,
  );

  for (;;) {
    const tickStartedAt = now();
    log(
      `[social-daemon] checking discovery, publishing, metrics${
        tickStartedAt.getTime() - lastStrategyRefresh >=
        STRATEGY_REFRESH_INTERVAL_MS
          ? ', and strategy'
          : ''
      }...`,
    );
    await runSocialDaemonTick({
      now: tickStartedAt,
      firstStartedAt,
      log,
      refreshStrategy:
        tickStartedAt.getTime() - lastStrategyRefresh >=
        STRATEGY_REFRESH_INTERVAL_MS,
      overdueGraceMs,
    });
    if (
      tickStartedAt.getTime() - lastStrategyRefresh >=
      STRATEGY_REFRESH_INTERVAL_MS
    ) {
      lastStrategyRefresh = tickStartedAt.getTime();
    }
    await isolate('queue summary', log, async () => {
      logQueueSnapshot(
        await getSocialQueueSnapshot({ includeWaitingMedia: true }),
        tickStartedAt,
        log,
      );
    });
    log(
      `[social-daemon] check complete; next check in ${POLL_INTERVAL_MS / 1_000}s.`,
    );
    await sleep(POLL_INTERVAL_MS);
  }
}

export async function runSocialDaemonTick(input: {
  now: Date;
  firstStartedAt: string;
  log?: (message: string) => void;
  refreshStrategy?: boolean;
  overdueGraceMs?: number | null;
}): Promise<void> {
  const log = input.log ?? (() => void 0);

  await isolate('reconcile', log, () =>
    reconcileAlreadyPublishedJobs(input.now, log),
  );
  await isolate('align schedules', log, async () => {
    const aligned = await alignPendingSocialPublishSchedules();
    if (aligned > 0) {
      log(
        `[social-daemon] aligned ${aligned} pending platform job${aligned === 1 ? '' : 's'} to article publish slots.`,
      );
    }
  });
  await isolate('discover', log, () =>
    discoverAndEnqueue({
      now: input.now,
      firstStartedAt: input.firstStartedAt,
      log,
    }),
  );
  await isolate('publish', log, async () => {
    if (input.overdueGraceMs != null) {
      const cutoff = new Date(
        input.now.getTime() - input.overdueGraceMs,
      ).toISOString();
      const skipped = await skipOverdueSocialPublishJobs({
        now: input.now,
        graceMs: input.overdueGraceMs,
      });
      if (skipped > 0) {
        log(
          `[social-daemon] skipped ${skipped} overdue publish job${skipped === 1 ? '' : 's'} (${input.overdueGraceMs / 60_000}m grace; cutoff ${cutoff}).`,
        );
      }
    }
    await publishDueJobs(input.now, log);
  });
  await isolate('metrics', log, async () => {
    await collectDueMetricWindows(input.now, log);
  });
  await isolate('account snapshots', log, async () => {
    await captureAccountSnapshots(input.now, log);
  });
  if (input.refreshStrategy) {
    await isolate('strategy', log, () =>
      refreshSocialStrategies({ now: input.now, log }),
    );
    await isolate('experiment report', log, () =>
      logExperimentReports(input.now, log),
    );
  }
}

async function logExperimentReports(
  now: Date,
  log: (message: string) => void,
): Promise<void> {
  const cutoff = new Date(now.getTime() - 60 * 24 * 60 * 60_000).toISOString();
  const [posts, metrics] = await Promise.all([
    listLearningSocialPosts(cutoff),
    listLearningSocialMetrics(cutoff),
  ]);
  for (const report of buildSocialExperimentReports({ posts, metrics })) {
    const arms = report.arms
      .map(
        (arm) =>
          `${arm.variant}: n=${arm.samples}, median reach=${arm.medianReach}, engagement=${(arm.medianEngagementRate * 100).toFixed(2)}%, profile visits=${(arm.medianProfileVisitRate * 100).toFixed(2)}%`,
      )
      .join('; ');
    log(
      `[experiment] ${report.experimentKey} ${report.evaluable ? 'evaluable' : 'report-only'} (${report.durationDays.toFixed(1)}d, telemetry ${report.telemetryComplete ? 'complete' : 'gapped'}): ${arms}.`,
    );
  }
}

async function discoverAndEnqueue(input: {
  now: Date;
  firstStartedAt: string;
  log: (message: string) => void;
}): Promise<void> {
  const [candidates, schedules] = await Promise.all([
    listSocialPublishCandidates(input.firstStartedAt),
    listPendingSocialPublishSchedules(),
  ]);
  if (candidates.length === 0) return;

  const latestPending = schedules
    .filter(({ status }) => status !== 'completed')
    .at(-1)?.scheduled_at;
  let rollingLast = latestPending ? new Date(latestPending) : null;

  for (const candidate of candidates) {
    const readyAt = new Date(candidate.ready_at);
    if (Number.isNaN(readyAt.getTime())) continue;
    const policyEntries = policyEntriesForLanguage(
      candidate.language_code,
    ).filter(
      ({ policy }) =>
        Date.parse(candidate.episode_created_at) >=
        Date.parse(policy.activeSince),
    );
    if (policyEntries.length === 0) continue;
    const scheduledAt = scheduleCandidate({
      candidate,
      schedules,
      rollingLast,
      readyAt,
      now: input.now,
    });
    const insertedAny = await enqueueCandidateJobs({
      candidate,
      policyEntries,
      readyAt,
      scheduledAt,
      log: input.log,
    });
    if (insertedAny) rollingLast = scheduledAt;
  }
}

function scheduleCandidate(input: {
  candidate: SocialPublishCandidate;
  schedules: readonly PendingSocialPublishSchedule[];
  rollingLast: Date | null;
  readyAt: Date;
  now: Date;
}): Date {
  let after = input.readyAt;
  if (input.rollingLast) {
    after = new Date(input.rollingLast.getTime() + 60_000);
  } else if (input.now > input.readyAt) {
    after = startOfJstDay(input.now);
  }
  const siblingAnchors = input.schedules
    .filter(
      (schedule) =>
        schedule.episode_id === input.candidate.episode_id &&
        schedule.language_code !== input.candidate.language_code,
    )
    .flatMap((schedule) => [schedule.completed_at, schedule.scheduled_at])
    .filter((value): value is string => Boolean(value))
    .map(Date.parse)
    .filter(Number.isFinite);
  if (siblingAnchors.length > 0) {
    const floor = new Date(
      Math.max(...siblingAnchors) + MIN_CROSS_LANGUAGE_GAP_MS,
    );
    if (floor > after) after = floor;
  }
  return nextPublishSlot({
    platform: 'x',
    readyAt: input.readyAt,
    after,
    config: defaultSocialStrategy(),
  });
}

async function enqueueCandidateJobs(input: {
  candidate: SocialPublishCandidate;
  policyEntries: ReturnType<typeof policyEntriesForLanguage>;
  readyAt: Date;
  scheduledAt: Date;
  log: (message: string) => void;
}): Promise<boolean> {
  let insertedAny = false;
  for (const { platform, policy } of input.policyEntries) {
    const experimentKey = policy.experimentKey;
    let experimentVariant = policy.experimentVariant;
    if (experimentKey === 'x-language-v1') {
      const assignment = await getOrCreateExperimentAssignment({
        experimentKey,
        episodeId: input.candidate.episode_id,
        variants: ['en', 'ja'],
      });
      if (assignment.variant !== input.candidate.language_code) continue;
      experimentVariant = assignment.variant;
    }
    const inserted = await enqueueSocialPublishJob({
      episodeId: input.candidate.episode_id,
      platform,
      languageCode: input.candidate.language_code,
      experimentKey,
      experimentVariant,
      scheduledAt: input.scheduledAt.toISOString(),
    });
    if (!inserted) continue;
    if (!insertedAny) {
      input.log(
        `[social-daemon] discovered ${input.candidate.language_code} episode ${input.candidate.episode_id}; ready at ${input.readyAt.toISOString()}.`,
      );
    }
    insertedAny = true;
    input.log(
      `[social-daemon] queued ${platform}/${input.candidate.language_code} for ${input.candidate.episode_id} at ${input.scheduledAt.toISOString()}.`,
    );
  }
  return insertedAny;
}

// `social_posts` is the source of truth for "this platform is live", so a job
// left behind by a manual publish or by a crash between the post insert and the
// job update is closed here instead of retrying an upload that would duplicate
// the post.
async function reconcileAlreadyPublishedJobs(
  now: Date,
  log: (message: string) => void,
): Promise<void> {
  const jobs = await listUnfinishedSocialPublishJobs();
  if (jobs.length === 0) return;

  // One lookup for the whole sweep: a backfilled queue can hold hundreds of
  // jobs, and asking per job would spend most of a tick on round-trips.
  const posts = await listSocialPostIdentitiesByEpisodes([
    ...new Set(jobs.map((job) => job.episode_id)),
  ]);
  const postIdByJob = new Map<string, string>();
  for (const post of posts) {
    // Rows arrive newest first, so the first one wins -- the same row the
    // per-job lookup used to return.
    postIdByJob.set(
      `${post.episode_id}|${post.platform}|${post.language_code ?? 'zh-Hant'}`,
      postIdByJob.get(
        `${post.episode_id}|${post.platform}|${post.language_code ?? 'zh-Hant'}`,
      ) ?? post.id,
    );
  }

  let firstError: unknown = null;
  for (const job of jobs) {
    try {
      const socialPostId = postIdByJob.get(
        `${job.episode_id}|${job.platform}|${jobLanguage(job)}`,
      );
      if (!socialPostId) continue;
      const reconciled = await reconcileSocialPublishJob({
        jobId: job.id,
        socialPostId,
        completedAt: now,
      });
      if (!reconciled) continue;
      log(
        `[social-daemon] reconciled ${job.platform} for ${job.episode_id} - already published (${socialPostId}).`,
      );
    } catch (error) {
      firstError ??= error;
    }
  }
  if (firstError) {
    throw toError(firstError);
  }
}

async function persistPublishFailure(input: {
  jobId: string;
  episodeId: string;
  platform: string;
  attemptCount: number;
  now: Date;
  message: string;
  log: (message: string) => void;
}): Promise<void> {
  try {
    await failSocialPublishJob({
      jobId: input.jobId,
      owner: OWNER,
      now: input.now,
      attemptCount: input.attemptCount,
      error: input.message,
    });
  } catch (persistenceError) {
    input.log(
      `[social-daemon] failed to persist ${input.platform} publish failure for ${input.episodeId}: ${errorMessage(persistenceError)}`,
    );
  }
  input.log(
    `[social-daemon] ${input.platform} publish failed for ${input.episodeId}: ${input.message}`,
  );
}

async function publishDueJobs(
  now: Date,
  log: (message: string) => void,
): Promise<void> {
  const jobs = await claimSocialPublishBatch({ owner: OWNER, now });
  if (jobs.length === 0) return;

  const active = await activeStrategiesForPublish(log);
  const pendingByEpisodeLanguage = new Map<string, typeof jobs>();
  for (const job of jobs) {
    try {
      if (await reconcileClaimedJob(job, now, log)) continue;
      const key = `${job.episode_id}|${jobLanguage(job)}`;
      const pending = pendingByEpisodeLanguage.get(key) ?? [];
      pending.push(job);
      pendingByEpisodeLanguage.set(key, pending);
    } catch (error) {
      await persistPublishFailure({
        jobId: job.id,
        episodeId: job.episode_id,
        platform: job.platform,
        attemptCount: job.attempt_count,
        now,
        message: errorMessage(error),
        log,
      });
    }
  }

  for (const pendingJobs of pendingByEpisodeLanguage.values()) {
    await publishLanguageBatch(pendingJobs, active, now, log);
  }
}

async function reconcileClaimedJob(
  job: SocialPublishJobRow,
  now: Date,
  log: (message: string) => void,
): Promise<boolean> {
  const [post] = await listSocialPostsByEpisode(
    job.episode_id,
    job.platform,
    jobLanguage(job),
  );
  if (!post) return false;
  await completeSocialPublishJob({
    jobId: job.id,
    owner: OWNER,
    completedAt: now,
    socialPostId: post.id,
  });
  log(
    `[social-daemon] reconciled ${job.platform} for ${job.episode_id} - already published (${post.id}).`,
  );
  return true;
}

async function publishLanguageBatch(
  jobs: SocialPublishJobRow[],
  active: Record<string, SocialStrategyVersionRow | null>,
  now: Date,
  log: (message: string) => void,
): Promise<void> {
  const firstJob = jobs[0];
  if (!firstJob) return;
  const guidanceByPlatform = Object.fromEntries(
    jobs.flatMap((job) => {
      const guidance = buildStrategyGuidance(
        job.platform,
        active[strategyMapKey(job.platform, jobLanguage(job))]?.config,
      );
      return guidance ? [[job.platform, guidance]] : [];
    }),
  ) as Partial<Record<SocialPlatform, string>>;
  let outcomes: Awaited<ReturnType<typeof publishSocialBatch>>;
  try {
    outcomes = await publishSocialBatch({
      episodeId: firstJob.episode_id,
      languageCode: jobLanguage(firstJob),
      platforms: jobs.map((job) => ({
        platform: job.platform,
        experimentKey: job.experiment_key,
        experimentVariant: job.experiment_variant,
      })),
      ...(Object.keys(guidanceByPlatform).length > 0
        ? { strategyGuidanceByPlatform: guidanceByPlatform }
        : {}),
      onLog: log,
    });
  } catch (error) {
    await Promise.all(
      jobs.map((job) => recordJobFailure(job, now, error, log)),
    );
    return;
  }
  for (const job of jobs) {
    await finalizePublishOutcome(
      job,
      outcomes,
      active[strategyMapKey(job.platform, jobLanguage(job))] ?? null,
      now,
      log,
    );
  }
}

async function finalizePublishOutcome(
  job: SocialPublishJobRow,
  outcomes: Awaited<ReturnType<typeof publishSocialBatch>>,
  strategy: SocialStrategyVersionRow | null,
  now: Date,
  log: (message: string) => void,
): Promise<void> {
  try {
    const outcome = outcomes.find((row) => row.platform === job.platform);
    if (!outcome || outcome.status === 'failed') {
      throw outcome?.error ?? new Error(`${job.platform} did not publish.`);
    }
    if (outcome.stateError) throw outcome.stateError;
    if (outcome.recordError) throw outcome.recordError;
    const [post] = await listSocialPostsByEpisode(
      job.episode_id,
      job.platform,
      jobLanguage(job),
    );
    if (!post) {
      throw new Error(
        `${job.platform} publish completed but no social_posts row was recorded.`,
      );
    }
    await completeSocialPublishJob({
      jobId: job.id,
      owner: OWNER,
      completedAt: now,
      socialPostId: post.id,
      ...(strategy ? { strategyVersionId: strategy.id } : {}),
    });
    log(
      `[social-daemon] published ${job.platform} for ${job.episode_id} (${post.id}).`,
    );
  } catch (error) {
    await recordJobFailure(job, now, error, log);
  }
}

function jobLanguage(
  job: Pick<SocialPublishJobRow, 'language_code'>,
): SocialPublishJobRow['language_code'] {
  return job.language_code ?? 'zh-Hant';
}

function recordJobFailure(
  job: SocialPublishJobRow,
  now: Date,
  error: unknown,
  log: (message: string) => void,
): Promise<void> {
  return persistPublishFailure({
    jobId: job.id,
    episodeId: job.episode_id,
    platform: job.platform,
    attemptCount: job.attempt_count,
    now,
    message: errorMessage(error),
    log,
  });
}

// Guidance is resolved when a job is claimed, never when it is queued: a job
// queued before the first version existed, or scheduled days ahead of the next
// refresh, would otherwise publish with stale or no guidance forever. Guidance
// is only a preference, so a failed read degrades to publishing without it
// rather than holding the queue.
async function activeStrategiesForPublish(
  log: (message: string) => void,
): Promise<Record<string, SocialStrategyVersionRow | null>> {
  try {
    return activeStrategyMap(await getActiveSocialStrategies());
  } catch (error) {
    log(
      `[social-daemon] publishing without strategy guidance: ${errorMessage(error)}`,
    );
    return activeStrategyMap([]);
  }
}

export async function collectDueMetricWindows(
  now: Date,
  log: (message: string) => void = () => void 0,
): Promise<number> {
  const cutoff = new Date(
    now.getTime() - METRIC_LOOKBACK_DAYS * 24 * 60 * 60_000,
  ).toISOString();
  const posts = await listLearningSocialPosts(cutoff);
  if (posts.length === 0) return 0;

  const recorded = await listMetricWindowsForPosts(
    posts.map((post) => post.id),
  );
  const completed = new Set(
    recorded.flatMap((row) =>
      row.measurement_window
        ? [`${row.social_post_id}:${row.measurement_window}`]
        : [],
    ),
  );
  const browser = createMetricsBrowserSession();
  const collectors = createMetricCollectors({
    browser,
    onRednoteIdentity: async ({ post, platformPostId, postUrl }) => {
      await updateSocialPostIdentity({ id: post.id, platformPostId, postUrl });
    },
    onRednoteReviewStatus: async ({ post, reviewStatus }) => {
      await updateSocialPostReviewStatus({ id: post.id, reviewStatus });
      log(
        `[social-daemon] flagged ${post.platform} ${post.id} as ${reviewStatus}.`,
      );
    },
  });

  let inserted = 0;
  try {
    for (const post of posts) {
      const window = earliestDueWindow(post, now, completed);
      if (!window) continue;

      try {
        const collected = await collectPostMetrics(
          collectors[post.platform],
          post,
        );
        // Not an error and not a zero snapshot: the platform has nothing to
        // report yet, or the note is suppressed. Silence here made a
        // moderation removal indistinguishable from a quiet tick.
        if (!collected) {
          log(
            `[social-daemon] no ${post.platform} metrics available yet for ${post.id}.`,
          );
          continue;
        }
        const { details, ...counts } = collected;
        await insertSocialPostMetric(
          buildSocialPostMetric({
            post,
            capturedAt: now,
            counts,
            details,
            measurementWindow: window.label,
          }),
        );
        completed.add(`${post.id}:${window.label}`);
        inserted += 1;
        log(
          `[social-daemon] recorded ${post.platform} ${window.label} metrics for ${post.id}.`,
        );
      } catch (error) {
        log(
          `[social-daemon] metric collection failed for ${post.platform} ${post.id}: ${errorMessage(error)}`,
        );
      }
    }
  } finally {
    await browser.close();
  }
  return inserted;
}

// Platform-level follower counts, once a day. They live on the same daemon as
// everything else social, but in their own step: a point-in-time account reading
// has no per-post window semantics and must not share the metrics browser's
// lifecycle with them.
async function captureAccountSnapshots(
  now: Date,
  log: (message: string) => void,
): Promise<void> {
  const browser = createMetricsBrowserSession();
  try {
    await captureDueAccountSnapshots({ now, browser, log });
  } finally {
    await browser.close();
  }
}

export function earliestDueWindow(
  post: SocialPostRow,
  now: Date,
  completed: ReadonlySet<string>,
): (typeof METRIC_WINDOWS)[number] | null {
  const publishedAt = Date.parse(post.published_at);
  if (Number.isNaN(publishedAt)) return null;
  const ageHours = (now.getTime() - publishedAt) / 3_600_000;
  const currentWindow = [...METRIC_WINDOWS]
    .reverse()
    .find((window) => ageHours >= window.targetHours);
  if (!currentWindow) return null;
  return completed.has(`${post.id}:${currentWindow.label}`)
    ? null
    : currentWindow;
}

async function isolate(
  label: string,
  log: (message: string) => void,
  task: () => Promise<void>,
): Promise<void> {
  try {
    await task();
  } catch (error) {
    log(`[social-daemon] ${label} failed: ${errorMessage(error)}`);
  }
}

function logQueueSnapshot(
  snapshot: Awaited<ReturnType<typeof getSocialQueueSnapshot>>,
  now: Date,
  log: (message: string) => void,
): void {
  const waitingMedia = snapshot.waitingMedia ?? [];
  if (snapshot.pendingCount === 0 && waitingMedia.length === 0) {
    log('[social-daemon] queue: no publish jobs pending.');
    return;
  }

  for (const item of waitingMedia) {
    const title = item.title ? ` “${truncateTitle(item.title)}”` : '';
    log(
      `[social-daemon] waiting media ${item.platform}/${item.languageCode}${item.experiment ? ` [${item.experiment}]` : ''}:${title}.`,
    );
  }

  log(
    `[social-daemon] queue: ${snapshot.pendingCount} publish job${snapshot.pendingCount === 1 ? '' : 's'} pending across ${snapshot.episodeQueue.length} article${snapshot.episodeQueue.length === 1 ? '' : 's'}.`,
  );
  snapshot.episodeQueue.forEach((episode, index) => {
    const title = episode.title ?? episode.episodeId;
    log(
      `[social-daemon]   ${index + 1}. “${title}” — first publish ${formatJst(episode.nextAt)} (${formatRelative(episode.nextAt, now)}).`,
    );
  });
  const lanes =
    snapshot.nextByLane ??
    Object.fromEntries(
      Object.entries(snapshot.nextByPlatform).map(([platform, item]) => [
        `${platform}|${item?.languageCode ?? 'zh-Hant'}`,
        {
          ...item,
          languageCode: item?.languageCode ?? 'zh-Hant',
          experiment: null,
        },
      ]),
    );
  for (const item of Object.values(lanes)) {
    const title = item.title ? ` “${truncateTitle(item.title)}”` : '';
    log(
      `[social-daemon] next ${item.platform}/${item.languageCode}${item.experiment ? ` [${item.experiment}]` : ''}:${title} at ${formatJst(item.nextAt)} (${formatRelative(item.nextAt, now)}; ${item.status}).`,
    );
  }
}

function truncateTitle(title: string): string {
  const normalized = title.replace(/\s+/g, ' ').trim();
  return normalized.length > 42 ? `${normalized.slice(0, 41)}…` : normalized;
}

function padTwoDigits(number: number): string {
  return String(number).padStart(2, '0');
}

function formatJst(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const jst = new Date(date.getTime() + 9 * 60 * 60_000);
  return `${padTwoDigits(jst.getUTCMonth() + 1)}/${padTwoDigits(jst.getUTCDate())} ${padTwoDigits(jst.getUTCHours())}:${padTwoDigits(jst.getUTCMinutes())} JST`;
}

function formatRelative(value: string, now: Date): string {
  const milliseconds = Date.parse(value) - now.getTime();
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return 'due now';
  const minutes = Math.ceil(milliseconds / 60_000);
  if (minutes < 60) return `in ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes
    ? `in ${hours}h ${remainingMinutes}m`
    : `in ${hours}h`;
}

if (isMainModule(import.meta.url)) {
  try {
    await acquireSocialDaemonLock();
  } catch (error) {
    if (error instanceof SocialDaemonAlreadyRunningError) {
      console.error(`[social-daemon] ${error.message}`);
      process.exit(1);
    }
    throw error;
  }
  await runSocialDaemon();
}
