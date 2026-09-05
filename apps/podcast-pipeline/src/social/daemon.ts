import '../observability/sentry-init.js';

import { hostname } from 'node:os';

import { getAllowedTelegramUserIds } from '../lib/env.js';
import { errorMessage } from '../lib/errorMessage.js';
import { sleep as defaultSleep } from '../lib/sleep.js';
import { isTransientNetworkError } from '../lib/transient-network-error.js';
import {
  capturePipelineException,
  flushSentry,
} from '../observability/sentry.js';
import {
  insertSocialPostMetric,
  listSocialPostIdentitiesByEpisodes,
  listSocialPostsByEpisode,
  updateSocialPostIdentity,
  updateSocialPostReviewStatus,
} from '../services/db.js';
import {
  buildSocialReleaseFailedMessage,
  sendTelegramNotification,
} from '../services/telegram.js';
import type { SocialPostRow } from '../types.js';
import {
  captureDueAccountSnapshots,
  capturePrePublishAccountSnapshots,
} from './account-snapshots.js';
import {
  type ReleaseCohortLane,
  resolveReleaseCohortLanes,
  resolveRequiredReleaseLanguages,
} from './cohort.js';
import { recordSocialDaemonTick } from './daemon-heartbeat.js';
import { recoverOrphanedSocialLeases } from './daemon-lease-recovery.js';
import {
  acquireSocialDaemonLock,
  SocialDaemonAlreadyRunningError,
  type SocialDaemonLock,
} from './daemon-lock.js';
import {
  completeSocialPublishJob,
  enqueueSocialPublishJob,
  ensureSocialDaemonStart,
  failSocialPublishJob,
  getActiveSocialStrategies,
  getSocialQueueSnapshot,
  listDueSocialPublishPlatforms,
  listLearningSocialMetrics,
  listLearningSocialPosts,
  listMetricWindowsForPosts,
  listPendingSocialPublishSchedules,
  listSocialEpisodeLocalizationTitles,
  listSocialPublishCandidates,
  listSocialPublishCandidatesForEpisodes,
  listUnfinishedSocialPublishJobs,
  type PendingSocialPublishSchedule,
  reconcileSocialPublishJob,
  refundSocialPublishJobAttempt,
  releaseSocialPublishJobLease,
  type SocialEpisodeLocalizationTitle,
  type SocialMetricWindowLabel,
  type SocialPublishCandidate,
  type SocialPublishJobRow,
  type SocialStrategyVersionRow,
} from './daemon-store.js';
import { buildSocialExperimentReports } from './experiment-report.js';
import { isMainModule } from './is-main-module.js';
import { reconcileLocalPublishedJob } from './local-publish-recovery.js';
import { laneLabel, languageFlag, platformIcon } from './log-format.js';
import {
  createMetricCollectors,
  createMetricsBrowserSession,
} from './metric-collectors.js';
import { buildSocialPostMetric, collectPostMetrics } from './metrics.js';
import { activePackagingExperiment } from './packaging-experiments.js';
import type { SocialPlatform } from './platforms.js';
import {
  SOCIAL_LANGUAGE_EXPERIMENT_KEYS,
  SOCIAL_PUBLISH_WINDOW_JST,
} from './policy.js';
import { publishSocialBatch } from './publish-batch.js';
import { SocialReleaseFailureError } from './publish-error.js';
import {
  alignPendingSocialReleaseCohorts,
  claimReleaseCohortJobs,
  listPartiallyPublishedCohorts,
} from './release-cohort-store.js';
import { collectRollingPostMetrics } from './rolling-metrics.js';
import {
  nextReleaseSlot,
  occupiesReleaseBudget,
  SCHEDULING_HORIZON_DAYS,
  withinPublishWindow,
} from './slot-policy.js';
import {
  activeStrategyMap,
  buildStrategyGuidance,
  refreshSocialStrategies,
  strategyMapKey,
} from './strategy.js';

const POLL_INTERVAL_MS = 60_000;
// A transient Supabase disconnection typically costs ~78s of socket time plus
// 60s poll; 5 ticks ≈ 10 minutes of tolerance before escalating to fatal.
const TRANSIENT_NETWORK_RETRY_LIMIT = 5;
const METRIC_LOOKBACK_DAYS = 8;
const STRATEGY_REFRESH_INTERVAL_MS = 6 * 60 * 60_000;
const OWNER = `${hostname()}:${process.pid}`;
/**
 * An already-aligned article may still publish this long after its slot. Once
 * that grace is exceeded, reconciliation moves the entire unpublished cohort
 * to the next article slot rather than staggering lanes or inventing success.
 */
const PUBLISH_SLOT_GRACE_MS = 90 * 60_000;

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
  recordTick?: typeof recordSocialDaemonTick;
}

export async function runSocialDaemon(
  dependencies: SocialDaemonDependencies = {},
): Promise<never> {
  const now = dependencies.now ?? (() => new Date());
  const sleep = dependencies.sleep ?? defaultSleep;
  const log = dependencies.log ?? console.log;
  const recordTick = dependencies.recordTick ?? recordSocialDaemonTick;
  let lastStrategyRefresh = 0;
  let consecutiveTransientFailures = 0;

  const firstStartedAt = await ensureSocialDaemonStart(now());
  log(
    `🤖 [social-daemon] started as ${OWNER}; discovery begins at ${firstStartedAt}.`,
  );

  for (;;) {
    const tickStartedAt = now();
    log(
      `🔄 [social-daemon] checking discovery · publishing · metrics${
        tickStartedAt.getTime() - lastStrategyRefresh >=
        STRATEGY_REFRESH_INTERVAL_MS
          ? ' · strategy'
          : ''
      }`,
    );
    await recordTick({ phase: 'start', now: tickStartedAt, owner: OWNER });
    try {
      await runSocialDaemonTick({
        now: tickStartedAt,
        firstStartedAt,
        log,
        refreshStrategy:
          tickStartedAt.getTime() - lastStrategyRefresh >=
          STRATEGY_REFRESH_INTERVAL_MS,
      });
    } catch (error) {
      await recordTick({
        phase: 'error',
        now: now(),
        owner: OWNER,
        error,
      });
      if (
        !(error instanceof SocialReleaseFailureError) &&
        isTransientNetworkError(error) &&
        consecutiveTransientFailures < TRANSIENT_NETWORK_RETRY_LIMIT
      ) {
        consecutiveTransientFailures += 1;
        log(
          `⚠️ [social-daemon] transient network failure · retry ${consecutiveTransientFailures}/${TRANSIENT_NETWORK_RETRY_LIMIT} · next check in 60s · ${errorMessage(error).split('\n')[0]}`,
        );
        await sleep(POLL_INTERVAL_MS);
        continue;
      }
      throw error;
    }
    if (
      tickStartedAt.getTime() - lastStrategyRefresh >=
      STRATEGY_REFRESH_INTERVAL_MS
    ) {
      lastStrategyRefresh = tickStartedAt.getTime();
    }
    await isolate('queue summary', log, async () => {
      log('');
      logQueueSnapshot(
        await getSocialQueueSnapshot({ includeWaitingMedia: true }),
        tickStartedAt,
        log,
      );
    });
    await recordTick({ phase: 'success', now: now(), owner: OWNER });
    if (consecutiveTransientFailures > 0) {
      log(
        `✅ [social-daemon] network recovered after ${consecutiveTransientFailures} failed tick(s)`,
      );
      consecutiveTransientFailures = 0;
    }
    log('');
    log(
      `✅ [social-daemon] check complete · next check in ${POLL_INTERVAL_MS / 1_000}s.`,
    );
    log('');
    await sleep(POLL_INTERVAL_MS);
  }
}

/**
 * `reconcile`, `align schedules`, `discover`, and `publish` are release-shape
 * stages: a failure here can leave a cohort's lanes disagreeing about what was
 * actually published, or leave the queue mis-scheduled. Those propagate and
 * stop the whole process. Metrics, snapshots, strategy and reports are purely
 * observational and stay isolated.
 *
 * One exception is handled by the main loop: socket/DNS-layer transient
 * network failures (`isTransientNetworkError`) that are not a
 * `SocialReleaseFailureError` are retried for up to
 * `TRANSIENT_NETWORK_RETRY_LIMIT` consecutive ticks, because `reconcile` on
 * the next tick is already the correct recovery path for a Supabase blip that
 * happened before any transport started. `SocialReleaseFailureError` and all
 * other errors remain fatal, and this retry does not turn the daemon into a
 * watch runner — it is a bounded delay before the existing fatal path.
 */
export async function runSocialDaemonTick(input: {
  now: Date;
  firstStartedAt: string;
  log?: (message: string) => void;
  refreshStrategy?: boolean;
}): Promise<void> {
  const log = input.log ?? (() => void 0);

  await reconcileAlreadyPublishedJobs(input.now, log);
  const alignment = await alignPendingSocialReleaseCohorts(
    input.now,
    PUBLISH_SLOT_GRACE_MS,
  );
  if (alignment.alignedLanes > 0) {
    log(
      `📥 [social-daemon] repaired release cohorts · ${alignment.alignedLanes} lane${alignment.alignedLanes === 1 ? '' : 's'} aligned · ${alignment.rescheduledEpisodes} article${alignment.rescheduledEpisodes === 1 ? '' : 's'} rescheduled`,
    );
  }

  await discoverAndEnqueue({
    now: input.now,
    firstStartedAt: input.firstStartedAt,
    log,
  });

  await isolate('pre-publish snapshots', log, async () => {
    const platforms = await listDueSocialPublishPlatforms(input.now);
    if (platforms.length === 0) return;
    await capturePrePublishAccountSnapshots({
      now: input.now,
      platforms,
      openBrowser: createMetricsBrowserSession,
      log,
    });
  });

  await publishDueJobs(input.now, log);

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
          `${languageFlag(arm.variant)} ${arm.variant} · n=${arm.samples} · reach=${arm.medianReach} · engagement=${(arm.medianEngagementRate * 100).toFixed(2)}% · profile=${(arm.medianProfileVisitRate * 100).toFixed(2)}%`,
      )
      .join(' · ');
    log(
      `🧪 [experiment] ${report.experimentKey} · ${report.evaluable ? 'evaluable' : 'report-only'} · ${report.durationDays.toFixed(1)}d · ${report.telemetryComplete ? 'telemetry complete' : '⚠️ telemetry gapped'} · ${arms}`,
    );
  }
}

/**
 * The anchor-filtered candidate list decides which episodes to inspect. We then
 * load every ready localization for those episodes so a language that became
 * ready before the daemon anchor still counts toward the episode-wide barrier.
 */
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

  const episodeIds = [
    ...new Set(candidates.map((candidate) => candidate.episode_id)),
  ];
  const [readyCandidates, titleByEpisodeLanguage] = await Promise.all([
    listSocialPublishCandidatesForEpisodes(episodeIds),
    loadEpisodeTitleMap(episodeIds),
  ]);
  const candidatesByEpisode = new Map<string, SocialPublishCandidate[]>();
  for (const candidate of readyCandidates) {
    const list = candidatesByEpisode.get(candidate.episode_id) ?? [];
    list.push(candidate);
    candidatesByEpisode.set(candidate.episode_id, list);
  }
  const scheduledArticles = releaseBudgetIndex(schedules);

  for (const episodeId of episodeIds) {
    await discoverAndEnqueueEpisode({
      episodeId,
      episodeCandidates: candidatesByEpisode.get(episodeId) ?? [],
      schedules,
      scheduledArticles,
      titleByEpisodeLanguage,
      now: input.now,
      log: input.log,
    });
  }
}

async function discoverAndEnqueueEpisode(input: {
  episodeId: string;
  episodeCandidates: readonly SocialPublishCandidate[];
  schedules: readonly PendingSocialPublishSchedule[];
  scheduledArticles: Date[];
  titleByEpisodeLanguage: ReadonlyMap<string, string | null>;
  now: Date;
  log: (message: string) => void;
}): Promise<void> {
  const firstCandidate = input.episodeCandidates[0];
  if (!firstCandidate) return;

  const title = episodeTitle(
    input.titleByEpisodeLanguage,
    input.episodeId,
    firstCandidate.language_code,
  );
  const existingSchedule = input.schedules.find(
    (schedule) => schedule.episode_id === input.episodeId,
  );

  if (existingSchedule) {
    await enqueueExistingCohort({
      episodeId: input.episodeId,
      firstCandidate,
      title,
      existingSchedule,
      schedules: input.schedules,
      episodeCandidates: input.episodeCandidates,
      log: input.log,
    });
    return;
  }

  await enqueueNewCohort({
    episodeId: input.episodeId,
    firstCandidate,
    title,
    episodeCandidates: input.episodeCandidates,
    scheduledArticles: input.scheduledArticles,
    now: input.now,
    log: input.log,
  });
}

function durableLanesForEpisode(
  schedules: readonly PendingSocialPublishSchedule[],
  episodeId: string,
): ReleaseCohortLane[] {
  const deduped = new Map<string, PendingSocialPublishSchedule>();
  for (const schedule of schedules) {
    if (schedule.episode_id !== episodeId) continue;
    const key = `${schedule.platform}|${schedule.language_code}`;
    if (!deduped.has(key)) deduped.set(key, schedule);
  }
  return [...deduped.values()].map((schedule) => ({
    platform: schedule.platform,
    language: schedule.language_code,
    ...(schedule.experiment_key
      ? { experimentKey: schedule.experiment_key }
      : {}),
    ...(schedule.experiment_variant
      ? { experimentVariant: schedule.experiment_variant }
      : {}),
  }));
}

function readyAtForLanguages(
  candidates: readonly SocialPublishCandidate[],
  requiredLanguages: ReadonlySet<string>,
): Date | null {
  const timestamps = candidates
    .filter((candidate) => requiredLanguages.has(candidate.language_code))
    .map((candidate) => Date.parse(candidate.ready_at));
  if (timestamps.length === 0) return null;
  const max = Math.max(...timestamps);
  const date = new Date(max);
  return Number.isNaN(date.getTime()) ? null : date;
}

function missingLanguages(
  required: ReadonlySet<string>,
  ready: ReadonlySet<string>,
): string[] {
  return [...required].filter((language) => !ready.has(language));
}

async function enqueueExistingCohort(input: {
  episodeId: string;
  firstCandidate: SocialPublishCandidate;
  title: string | null;
  existingSchedule: PendingSocialPublishSchedule;
  schedules: readonly PendingSocialPublishSchedule[];
  episodeCandidates: readonly SocialPublishCandidate[];
  log: (message: string) => void;
}): Promise<void> {
  // Durable cohort preservation: once an episode has any durable jobs, its lane
  // identities are the source of truth. Re-deriving lanes from the current policy
  // would reshape a cohort created under a different policy (e.g. legacy cohort
  // created after activation but before this deployment) and insert extra lanes
  // because the unique key is (episode_id, platform, language_code).
  const existingLanes = durableLanesForEpisode(
    input.schedules,
    input.episodeId,
  );
  if (existingLanes.length === 0) return;
  const requiredLanguages = new Set(existingLanes.map((lane) => lane.language));
  const readyLanguages = new Set(
    input.episodeCandidates.map((candidate) => candidate.language_code),
  );
  const missing = missingLanguages(requiredLanguages, readyLanguages);
  if (missing.length > 0) {
    input.log(
      `⏳ [social-daemon] ${episodeLabel(input.title, input.episodeId)} · cohort not release-ready · ${missing.map((language) => `${languageFlag(language)} ${language}`).join(' · ')}`,
    );
    return;
  }
  const readyAt = readyAtForLanguages(
    input.episodeCandidates,
    requiredLanguages,
  );
  if (!readyAt) return;
  const scheduledAt = new Date(input.existingSchedule.scheduled_at);

  // Determine whether this is an interrupted enqueue (subset) vs a reshape.
  const intendedLanes = await resolveReleaseCohortLanes({
    episodeId: input.episodeId,
    episodeCreatedAt: input.firstCandidate.episode_created_at,
    scheduledAt,
  });
  const existingKeys = new Set(
    existingLanes.map((lane) => `${lane.platform}|${lane.language}`),
  );
  const intendedKeys = new Set(
    intendedLanes.map((lane) => `${lane.platform}|${lane.language}`),
  );
  const isSubset = [...existingKeys].every((key) => intendedKeys.has(key));
  const isEqual = isSubset && existingKeys.size === intendedKeys.size;

  const lanes =
    isEqual || (isSubset && existingKeys.size < intendedKeys.size)
      ? intendedLanes
      : existingLanes;
  if (lanes.length === 0) return;

  const finalMissing = missingLanguages(
    new Set(lanes.map((lane) => lane.language)),
    readyLanguages,
  );
  if (finalMissing.length > 0) {
    input.log(
      `⏳ [social-daemon] ${episodeLabel(input.title, input.episodeId)} · cohort not release-ready · ${finalMissing.map((language) => `${languageFlag(language)} ${language}`).join(' · ')}`,
    );
    return;
  }

  await enqueueCohortJobs({
    episodeId: input.episodeId,
    title: input.title,
    lanes,
    readyAt,
    scheduledAt,
    log: input.log,
  });
}

async function enqueueNewCohort(input: {
  episodeId: string;
  firstCandidate: SocialPublishCandidate;
  title: string | null;
  episodeCandidates: readonly SocialPublishCandidate[];
  scheduledArticles: Date[];
  now: Date;
  log: (message: string) => void;
}): Promise<void> {
  const prospectiveScheduledAt = input.now;
  const requiredLanguages = new Set(
    await resolveRequiredReleaseLanguages({
      episodeId: input.episodeId,
      episodeCreatedAt: input.firstCandidate.episode_created_at,
      prospectiveScheduledAt,
    }),
  );
  if (requiredLanguages.size === 0) return;

  const readyLanguages = new Set(
    input.episodeCandidates.map((candidate) => candidate.language_code),
  );
  const missing = missingLanguages(requiredLanguages, readyLanguages);
  if (missing.length > 0) {
    input.log(
      `⏳ [social-daemon] ${episodeLabel(input.title, input.episodeId)} · cohort not release-ready · ${missing.map((language) => `${languageFlag(language)} ${language}`).join(' · ')}`,
    );
    return;
  }

  const readyAt = readyAtForLanguages(
    input.episodeCandidates,
    requiredLanguages,
  );
  if (!readyAt) return;

  const scheduledAt = nextReleaseSlot({
    after: new Date(Math.max(readyAt.getTime(), input.now.getTime())),
    scheduled: input.scheduledArticles,
  });
  if (!scheduledAt) {
    input.log(
      `🗓️ [social-daemon] ${episodeLabel(input.title, input.episodeId)} · no article slot inside the ${SCHEDULING_HORIZON_DAYS}-day horizon · staying discoverable for a later tick`,
    );
    return;
  }

  const lanes = await resolveReleaseCohortLanes({
    episodeId: input.episodeId,
    episodeCreatedAt: input.firstCandidate.episode_created_at,
    scheduledAt,
  });
  if (lanes.length === 0) return;

  const finalMissing = missingLanguages(
    new Set(lanes.map((lane) => lane.language)),
    readyLanguages,
  );
  if (finalMissing.length > 0) {
    input.log(
      `⏳ [social-daemon] ${episodeLabel(input.title, input.episodeId)} · cohort not release-ready · ${finalMissing.map((language) => `${languageFlag(language)} ${language}`).join(' · ')}`,
    );
    return;
  }

  const insertedAny = await enqueueCohortJobs({
    episodeId: input.episodeId,
    title: input.title,
    lanes,
    readyAt,
    scheduledAt,
    log: input.log,
  });
  if (insertedAny) {
    input.scheduledArticles.push(scheduledAt);
  }
}

/** One budget entry per episode, never one per platform or language lane. */
function releaseBudgetIndex(
  schedules: readonly PendingSocialPublishSchedule[],
): Date[] {
  const scheduled: Date[] = [];
  const seenEpisodes = new Set<string>();
  for (const schedule of schedules) {
    if (seenEpisodes.has(schedule.episode_id)) continue;
    if (!occupiesReleaseBudget(schedule)) continue;
    seenEpisodes.add(schedule.episode_id);
    scheduled.push(new Date(schedule.scheduled_at));
  }
  return scheduled;
}

async function enqueueCohortJobs(input: {
  episodeId: string;
  title: string | null;
  lanes: readonly ReleaseCohortLane[];
  readyAt: Date;
  scheduledAt: Date;
  log: (message: string) => void;
}): Promise<boolean> {
  const insertedLanes: ReleaseCohortLane[] = [];
  for (const lane of input.lanes) {
    const inserted = await enqueueSocialPublishJob({
      episodeId: input.episodeId,
      platform: lane.platform,
      languageCode: lane.language,
      experimentKey: lane.experimentKey,
      experimentVariant: lane.experimentVariant,
      scheduledAt: input.scheduledAt.toISOString(),
    });
    if (inserted) insertedLanes.push(lane);
  }
  if (insertedLanes.length === 0) return false;

  input.log(
    `📥 [social-daemon] ${episodeLabel(input.title, input.episodeId)} · queued ${insertedLanes.length} lane${insertedLanes.length === 1 ? '' : 's'} · ${formatJst(input.scheduledAt.toISOString())} · ${insertedLanes.map((lane) => compactLaneLabel(lane.platform, lane.language)).join(' ')}`,
  );
  return true;
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

  const episodeIds = [...new Set(jobs.map((job) => job.episode_id))];
  const [posts, titleByEpisodeLanguage] = await Promise.all([
    listSocialPostIdentitiesByEpisodes(episodeIds),
    loadEpisodeTitleMap(episodeIds),
  ]);
  const postIdByJob = new Map<string, string>();
  for (const post of posts) {
    postIdByJob.set(
      `${post.episode_id}|${post.platform}|${post.language_code ?? 'zh-Hant'}`,
      postIdByJob.get(
        `${post.episode_id}|${post.platform}|${post.language_code ?? 'zh-Hant'}`,
      ) ?? post.id,
    );
  }

  for (const job of jobs) {
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
      `✅ [social-daemon] ${laneLabel(job.platform, jobLanguage(job))} · ${episodeLabel(episodeTitle(titleByEpisodeLanguage, job.episode_id, jobLanguage(job)), job.episode_id)} · reconciled · already published`,
    );
  }
}

async function persistPublishFailure(input: {
  jobId: string;
  episodeId: string;
  platform: string;
  attemptCount: number;
  now: Date;
  message: string;
  title?: string | null;
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
      `❌ [social-daemon] ${platformIcon(input.platform)} ${input.platform} · failed to persist publish failure · episode ${input.episodeId} · ${errorMessage(persistenceError)}`,
    );
  }
  input.log(
    `❌ [social-daemon] ${platformIcon(input.platform)} ${input.platform} · ${episodeLabel(input.title ?? null, input.episodeId)} · publish failed · episode=${input.episodeId} · job=${input.jobId} · ${input.message}`,
  );
}

/**
 * A partially published episode is exceptional recovery state. It fences the
 * queue until that episode is complete; if none of its remaining lanes are due
 * yet, this tick intentionally publishes nothing instead of starting a fresh
 * article. That hold is bounded by retry backoff, because a lane that can never
 * be claimed again is excluded from the fence upstream. Transport calls within
 * one release cycle may differ by seconds or minutes, but that is not staggered
 * scheduling.
 */
async function publishDueJobs(
  now: Date,
  log: (message: string) => void,
): Promise<void> {
  if (!withinPublishWindow(now, SOCIAL_PUBLISH_WINDOW_JST)) return;

  const partialCohorts = await listPartiallyPublishedCohorts();
  const recoveryEpisode = partialCohorts[0];
  const jobs = recoveryEpisode
    ? await claimReleaseCohortJobs({
        owner: OWNER,
        now,
        episodeId: recoveryEpisode,
      })
    : await claimReleaseCohortJobs({ owner: OWNER, now });
  if (jobs.length === 0) {
    // A fence that publishes nothing is the one state an operator cannot tell
    // apart from an idle queue, so it says so rather than returning silently.
    if (recoveryEpisode) {
      log(
        `⏸️ [social-daemon] ${shortId(recoveryEpisode)} · partial release holds the queue · no lane due yet`,
      );
    }
    return;
  }

  const [active, titleByEpisodeLanguage] = await Promise.all([
    activeStrategiesForPublish(log),
    loadEpisodeTitleMap(jobs.map((job) => job.episode_id)),
  ]);
  const pendingByEpisodeLanguage = new Map<string, SocialPublishJobRow[]>();
  for (const job of jobs) {
    try {
      if (await reconcileClaimedJob(job, now, titleByEpisodeLanguage, log))
        continue;
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
        title: episodeTitle(
          titleByEpisodeLanguage,
          job.episode_id,
          jobLanguage(job),
        ),
        log,
      });
    }
  }

  const groups = [...pendingByEpisodeLanguage.values()];
  for (const [index, pendingJobs] of groups.entries()) {
    try {
      await publishLanguageBatch(
        pendingJobs,
        active,
        titleByEpisodeLanguage,
        now,
        log,
      );
    } catch (error) {
      await releaseUntouchedLeases(groups.slice(index + 1).flat(), now, log);
      // Generic failures happen before publishSocialPlatforms has started
      // transport (copy/video/packaging/job preparation). No lane in this
      // language batch could be live, so hand the whole claimed group back
      // immediately instead of waiting for the 60-minute lease to expire.
      await (error instanceof SocialReleaseFailureError
        ? refundUntriedLanesInFailedGroup(pendingJobs, error, now, log)
        : releaseUntouchedLeases(pendingJobs, now, log));
      throw error;
    }
  }
}

async function releaseUntouchedLeases(
  jobs: readonly SocialPublishJobRow[],
  now: Date,
  log: (message: string) => void,
): Promise<void> {
  for (const job of jobs) {
    try {
      await releaseSocialPublishJobLease({
        jobId: job.id,
        owner: OWNER,
        scheduledAt: job.scheduled_at,
        attemptCount: job.attempt_count,
        now,
      });
    } catch (releaseError) {
      log(
        new SocialReleaseFailureError({
          episodeId: job.episode_id,
          languageCode: jobLanguage(job),
          platform: job.platform,
          phase: 'lease',
          cause: releaseError,
        }).message,
      );
    }
  }
}

/**
 * The lanes after the failing one in its own group keep their lease on purpose
 * (see `releaseSocialPublishJobLease`), so `releaseUntouchedLeases` never sees
 * them -- but the cohort claim already charged them an attempt they never used.
 * Give exactly those back, identified by the error's own untouched-lane list.
 */
async function refundUntriedLanesInFailedGroup(
  jobs: readonly SocialPublishJobRow[],
  error: unknown,
  now: Date,
  log: (message: string) => void,
): Promise<void> {
  if (!(error instanceof SocialReleaseFailureError)) return;
  const untouched = new Set<string>(error.untouchedLanes);
  if (untouched.size === 0) return;
  for (const job of jobs) {
    if (!untouched.has(job.platform)) continue;
    try {
      await refundSocialPublishJobAttempt({
        jobId: job.id,
        owner: OWNER,
        attemptCount: job.attempt_count,
        now,
      });
    } catch (refundError) {
      log(
        `⚠️ [social-daemon] ${laneLabel(job.platform, jobLanguage(job))} · attempt refund failed · job=${job.id} · ${errorMessage(refundError)}`,
      );
    }
  }
}

async function reconcileClaimedJob(
  job: SocialPublishJobRow,
  now: Date,
  titleByEpisodeLanguage: ReadonlyMap<string, string | null>,
  log: (message: string) => void,
): Promise<boolean> {
  const [post] = await listSocialPostsByEpisode(
    job.episode_id,
    job.platform,
    jobLanguage(job),
  );
  if (!post) return reconcileLocalPublishedJob(job, OWNER, log);
  await completeSocialPublishJob({
    jobId: job.id,
    owner: OWNER,
    completedAt: now,
    socialPostId: post.id,
  });
  log(
    `✅ [social-daemon] ${laneLabel(job.platform, jobLanguage(job))} · ${episodeLabel(episodeTitle(titleByEpisodeLanguage, job.episode_id, jobLanguage(job)), job.episode_id)} · reconciled · already published`,
  );
  return true;
}

const LANGUAGE_EXPERIMENT_KEYS: ReadonlySet<string> = new Set(
  Object.values(SOCIAL_LANGUAGE_EXPERIMENT_KEYS) as string[],
);

async function publishLanguageBatch(
  jobs: SocialPublishJobRow[],
  active: Record<string, SocialStrategyVersionRow | null>,
  titleByEpisodeLanguage: ReadonlyMap<string, string | null>,
  now: Date,
  log: (message: string) => void,
): Promise<void> {
  const firstJob = jobs[0];
  if (!firstJob) return;
  const guidanceByPlatform = Object.fromEntries(
    jobs.flatMap((job) => {
      const isLanguageExperiment = Boolean(
        job.experiment_key && LANGUAGE_EXPERIMENT_KEYS.has(job.experiment_key),
      );
      const guidance = buildStrategyGuidance(
        job.platform,
        active[strategyMapKey(job.platform, jobLanguage(job))]?.config,
        Math.random,
        {
          packagingActive:
            activePackagingExperiment(job.platform, jobLanguage(job)) !==
            undefined,
          languageExperimentActive: isLanguageExperiment,
        },
      );
      return guidance ? [[job.platform, guidance]] : [];
    }),
  ) as Partial<Record<SocialPlatform, string>>;
  const outcomes = await publishSocialBatch({
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
  for (const outcome of outcomes) {
    if (!outcome.warnings?.length) continue;
    for (const warning of outcome.warnings) {
      log(
        `⚠️ [social-daemon] ${laneLabel(outcome.platform, jobLanguage(firstJob))} · ${warning} · episode ${firstJob.episode_id}`,
      );
      try {
        const [chatId] = getAllowedTelegramUserIds();
        if (chatId) {
          await sendTelegramNotification(
            chatId,
            `⚠️ [social-daemon] ${laneLabel(outcome.platform, jobLanguage(firstJob))} · ${warning} · episode ${firstJob.episode_id}`,
          );
        }
      } catch {
        // Telegram delivery must never fail the publish.
      }
    }
  }
  for (const job of jobs) {
    await finalizePublishOutcome(
      job,
      outcomes,
      active[strategyMapKey(job.platform, jobLanguage(job))] ?? null,
      now,
      titleByEpisodeLanguage,
      log,
    );
  }
}

async function finalizePublishOutcome(
  job: SocialPublishJobRow,
  outcomes: Awaited<ReturnType<typeof publishSocialBatch>>,
  strategy: SocialStrategyVersionRow | null,
  now: Date,
  titleByEpisodeLanguage: ReadonlyMap<string, string | null>,
  log: (message: string) => void,
): Promise<void> {
  const persistFailure = (message: string): SocialReleaseFailureError =>
    new SocialReleaseFailureError({
      episodeId: job.episode_id,
      languageCode: jobLanguage(job),
      platform: job.platform,
      phase: 'persist',
      cause: new Error(message),
    });

  const outcome = outcomes.find((row) => row.platform === job.platform);
  if (!outcome) {
    throw persistFailure(`${job.platform} did not publish.`);
  }
  const [post] = await listSocialPostsByEpisode(
    job.episode_id,
    job.platform,
    jobLanguage(job),
  );
  if (
    !post &&
    outcome.status === 'skipped' &&
    (await reconcileLocalPublishedJob(job, OWNER, log))
  )
    return;
  if (!post) {
    throw persistFailure(
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
    `✅ [social-daemon] ${laneLabel(job.platform, jobLanguage(job))} · ${episodeLabel(episodeTitle(titleByEpisodeLanguage, job.episode_id, jobLanguage(job)), job.episode_id)} · published${post.post_url ? ` · ${post.post_url}` : ''}`,
  );
}

function jobLanguage(
  job: Pick<SocialPublishJobRow, 'language_code'>,
): SocialPublishJobRow['language_code'] {
  return job.language_code ?? 'zh-Hant';
}

async function loadEpisodeTitleMap(
  episodeIds: readonly string[],
): Promise<Map<string, string | null>> {
  const rows = await listSocialEpisodeLocalizationTitles([
    ...new Set(episodeIds),
  ]);
  return new Map(
    rows.map((row: SocialEpisodeLocalizationTitle) => [
      `${row.episode_id}|${row.language_code ?? 'zh-Hant'}`,
      row.title,
    ]),
  );
}

function episodeTitle(
  titleByEpisodeLanguage: ReadonlyMap<string, string | null>,
  episodeId: string,
  languageCode: string,
): string | null {
  return (
    titleByEpisodeLanguage.get(`${episodeId}|zh-Hant`) ??
    titleByEpisodeLanguage.get(`${episodeId}|${languageCode}`) ??
    null
  );
}

function episodeLabel(title: string | null, episodeId: string): string {
  return title ? `“${truncateTitle(title)}”` : `episode #${shortId(episodeId)}`;
}

function shortId(id: string): string {
  return /^[0-9a-f]{8}-/i.test(id) ? id.slice(0, 8) : id;
}

function compactLaneLabel(
  platform: SocialPlatform,
  languageCode: string,
): string {
  return `${platformIcon(platform)}${languageCode}`;
}

async function activeStrategiesForPublish(
  log: (message: string) => void,
): Promise<Record<string, SocialStrategyVersionRow | null>> {
  try {
    return activeStrategyMap(await getActiveSocialStrategies());
  } catch (error) {
    log(
      `⚠️ [social-daemon] publishing without strategy guidance · ${errorMessage(error)}`,
    );
    return activeStrategyMap([]);
  }
}

const TERMINAL_METRIC_REVIEW_STATUSES = new Set<string>([
  'rejected',
  'self_only',
]);

export async function collectDueMetricWindows(
  now: Date,
  log: (message: string) => void = () => void 0,
): Promise<number> {
  const cutoff = new Date(
    now.getTime() - METRIC_LOOKBACK_DAYS * 24 * 60 * 60_000,
  ).toISOString();
  const posts = await listLearningSocialPosts(cutoff);
  if (posts.length === 0) return 0;

  const [recorded, titleByEpisodeLanguage] = await Promise.all([
    listMetricWindowsForPosts(posts.map((post) => post.id)),
    loadEpisodeTitleMap(posts.map((post) => post.episode_id)),
  ]);
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
        `⚠️ [social-daemon] ${platformIcon(post.platform)} ${post.platform} · ${episodeLabel(episodeTitle(titleByEpisodeLanguage, post.episode_id, post.language_code ?? 'zh-Hant'), post.episode_id)} · review → ${reviewStatus}`,
      );
    },
  });

  let inserted = 0;
  let unavailable = 0;
  let retryable = 0;
  const collectedByWindow = new Map<SocialMetricWindowLabel, number>();
  try {
    for (const post of posts) {
      const window = earliestDueWindow(post, now, completed);
      if (!window) continue;

      try {
        const result = await collectPostMetrics(
          collectors[post.platform],
          post,
        );
        if (result.status === 'retryable') {
          retryable += 1;
          continue;
        }
        if (result.status === 'unavailable') {
          const emptyCounts = {
            views: null,
            impressions: null,
            likes: null,
            comments: null,
            shares: null,
            saves: null,
            profileVisits: null,
            followersGained: null,
          } as const;
          await insertSocialPostMetric(
            buildSocialPostMetric({
              post,
              capturedAt: now,
              counts: emptyCounts,
              details: {
                platformMetrics: { unavailableReason: result.reason },
              },
              measurementWindow: window.label,
              collectionStatus: 'unavailable',
            }),
          );
          completed.add(`${post.id}:${window.label}`);
          unavailable += 1;
          log(
            `⚠️ [social-daemon] ${platformIcon(post.platform)} ${post.platform} · ${episodeLabel(episodeTitle(titleByEpisodeLanguage, post.episode_id, post.language_code ?? 'zh-Hant'), post.episode_id)} · ${window.label} metrics unavailable · ${result.reason}`,
          );
          continue;
        }
        const { details, ...counts } = result.metrics;
        await insertSocialPostMetric(
          buildSocialPostMetric({
            post,
            capturedAt: now,
            counts,
            details,
            measurementWindow: window.label,
            collectionStatus: 'collected',
          }),
        );
        completed.add(`${post.id}:${window.label}`);
        inserted += 1;
        collectedByWindow.set(
          window.label,
          (collectedByWindow.get(window.label) ?? 0) + 1,
        );
      } catch (error) {
        log(
          `❌ [social-daemon] ${platformIcon(post.platform)} ${post.platform} · ${episodeLabel(episodeTitle(titleByEpisodeLanguage, post.episode_id, post.language_code ?? 'zh-Hant'), post.episode_id)} · ${window.label} metrics failed · post=${post.id} · ${errorMessage(error)}`,
        );
      }
    }
    if (inserted + unavailable + retryable > 0) {
      const parts = [] as string[];
      if (inserted) parts.push(`${inserted} collected`);
      if (unavailable) parts.push(`${unavailable} unavailable`);
      if (retryable) parts.push(`${retryable} pending`);
      const windows = METRIC_WINDOWS.flatMap(({ label }) => {
        const count = collectedByWindow.get(label) ?? 0;
        return count > 0 ? [`${label} ×${count}`] : [];
      });
      log(
        `📊 [social-daemon] metrics · ${parts.join(' · ')}${windows.length > 0 ? ` · ${windows.join(' · ')}` : ''}`,
      );
    }
  } finally {
    await browser.close();
  }
  return inserted;
}

async function captureAccountSnapshots(
  now: Date,
  log: (message: string) => void,
): Promise<void> {
  let browser: ReturnType<typeof createMetricsBrowserSession> | undefined;
  try {
    const captured = await captureDueAccountSnapshots({
      now,
      openBrowser: () => (browser ??= createMetricsBrowserSession()),
      closeBrowser: false,
      log,
    });
    if (captured.length > 0) {
      await collectRollingPostMetrics({
        now,
        platforms: captured,
        browser,
        log,
      });
    }
  } finally {
    await browser?.close();
  }
}

export function earliestDueWindow(
  post: SocialPostRow,
  now: Date,
  completed: ReadonlySet<string>,
): (typeof METRIC_WINDOWS)[number] | null {
  if (
    post.review_status &&
    TERMINAL_METRIC_REVIEW_STATUSES.has(post.review_status)
  ) {
    return null;
  }
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
    log(`❌ [social-daemon] ${label} failed · ${errorMessage(error)}`);
    capturePipelineException(error, {
      component: 'social-daemon',
      tags: { operation: label },
      level: 'warning',
    });
  }
}

function logQueueSnapshot(
  snapshot: Awaited<ReturnType<typeof getSocialQueueSnapshot>>,
  now: Date,
  log: (message: string) => void,
): void {
  const waitingVideos = snapshot.waitingVideos ?? [];
  if (snapshot.pendingCount === 0 && waitingVideos.length === 0) {
    log('📥 [social-daemon] queue · 0 jobs · 0 articles');
    return;
  }

  for (const item of waitingVideos) {
    log(
      `⏳ [social-daemon] ${episodeLabel(item.title, item.episodeId)} · waiting video · ${item.languageCodes.map((language) => `${languageFlag(language)} ${language}`).join(' · ')}`,
    );
  }
  if (waitingVideos.length > 0) log('');

  log(
    `📥 [social-daemon] queue · ${snapshot.pendingCount} job${snapshot.pendingCount === 1 ? '' : 's'} · ${snapshot.episodeQueue.length} article${snapshot.episodeQueue.length === 1 ? '' : 's'}`,
  );
  snapshot.episodeQueue.forEach((episode, index) => {
    const title = episode.title ?? `episode #${shortId(episode.episodeId)}`;
    const laneCount = episode.laneCount ?? episode.lanes?.length ?? 1;
    log(
      `📥 [social-daemon]   ${index + 1}. “${title}” · ${formatJst(episode.nextAt)} (${formatRelative(episode.nextAt, now)})`,
    );
    const lanes = formatQueueEpisodeLanes(episode.lanes ?? []);
    log(
      `📥 [social-daemon]      ↳ ${laneCount} lane${laneCount === 1 ? '' : 's'}${lanes ? ` · ${lanes}` : ''}`,
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
  const nextLanes = Object.values(lanes).filter(
    (item) =>
      item.status === 'failed' ||
      item.status === 'processing' ||
      item.attemptsExhausted,
  );
  if (snapshot.episodeQueue.length > 0 && nextLanes.length > 0) log('');
  for (const item of nextLanes) {
    const title = item.title ? ` “${truncateTitle(item.title)}”` : '';
    let timing = `${formatJst(item.nextAt)} (${formatRelative(item.nextAt, now)}; ${item.status})`;
    if (item.attemptsExhausted) {
      timing = `blocked (${item.attemptCount} attempts exhausted; ${item.status})`;
    } else if (
      item.leaseExpiresAt &&
      Date.parse(item.leaseExpiresAt) > now.getTime()
    ) {
      timing = `leased until ${formatJst(item.leaseExpiresAt)}`;
    }
    log(
      `⚠️ [social-daemon] ${laneLabel(item.platform, item.languageCode)}${item.experiment ? ` [${item.experiment}]` : ''} ·${title} · ${timing}`,
    );
  }
}

function formatQueueEpisodeLanes(
  lanes: readonly { platform: SocialPlatform; languageCode: string }[],
): string {
  const platformOrder: SocialPlatform[] = [
    'rednote',
    'threads',
    'x',
    'youtube',
  ];
  return [...lanes]
    .sort(
      (left, right) =>
        platformOrder.indexOf(left.platform) -
          platformOrder.indexOf(right.platform) ||
        left.languageCode.localeCompare(right.languageCode),
    )
    .map((lane) => laneLabel(lane.platform, lane.languageCode))
    .join(' · ');
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

export function fatalSummary(error: unknown): string {
  if (error instanceof SocialReleaseFailureError) {
    return `${error.platform}/${error.languageCode} for episode ${error.episodeId} (${error.phase}): ${errorMessage(error.cause)}`;
  }
  return errorMessage(error);
}

export function buildFatalReport(error: unknown): string {
  const lines = [`❌ [social-daemon] FATAL: ${fatalSummary(error)}`];
  if (error instanceof SocialReleaseFailureError) {
    lines.push(
      `  published before failure: ${error.publishedLanes.join(', ') || '(none)'}`,
      `  untouched after failure: ${error.untouchedLanes.join(', ') || '(none)'}`,
    );
  }
  return lines.join('\n');
}

export async function notifyFatalFailure(error: unknown): Promise<void> {
  try {
    const [chatId] = getAllowedTelegramUserIds();
    if (!chatId) return;
    await sendTelegramNotification(
      chatId,
      buildSocialReleaseFailedMessage(fatalSummary(error)),
    );
  } catch {
    // A broken notification channel must never mask the original fatal error.
  }
}

if (isMainModule(import.meta.url)) {
  let lock: SocialDaemonLock;
  try {
    lock = await acquireSocialDaemonLock();
  } catch (error) {
    if (error instanceof SocialDaemonAlreadyRunningError) {
      console.error(`🔒 [social-daemon] ${error.message}`);
      process.exit(1);
    }
    throw error;
  }
  try {
    await recoverOrphanedSocialLeases();
    await runSocialDaemon();
  } catch (error) {
    console.error(buildFatalReport(error));
    capturePipelineException(error, {
      component: 'social-daemon',
      tags: {
        operation:
          error instanceof SocialReleaseFailureError ? error.phase : 'fatal',
      },
    });
    await notifyFatalFailure(error);
    lock.release();
    await flushSentry();
    process.exit(1);
  }
}
