import '../observability/sentry-init.js';

import { hostname } from 'node:os';

import { getAllowedTelegramUserIds } from '../lib/env.js';
import { errorMessage } from '../lib/errorMessage.js';
import { sleep as defaultSleep } from '../lib/sleep.js';
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
import { captureDueAccountSnapshots } from './account-snapshots.js';
import { type ReleaseCohortLane, resolveReleaseCohortLanes } from './cohort.js';
import { recordSocialDaemonTick } from './daemon-heartbeat.js';
import {
  acquireSocialDaemonLock,
  SocialDaemonAlreadyRunningError,
  type SocialDaemonLock,
} from './daemon-lock.js';
import {
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
  listPastDueSocialPublishJobs,
  listPendingSocialPublishSchedules,
  listSocialEpisodeLocalizationTitles,
  listSocialPublishCandidates,
  listSocialPublishCandidatesForEpisodes,
  listUnfinishedSocialPublishJobs,
  type PendingSocialPublishSchedule,
  reconcileSocialPublishJob,
  releaseSocialPublishJobLease,
  rescheduleSocialPublishJob,
  type SocialEpisodeLocalizationTitle,
  type SocialMetricWindowLabel,
  type SocialPublishCandidate,
  type SocialPublishJobRow,
  type SocialStrategyVersionRow,
} from './daemon-store.js';
import { buildSocialExperimentReports } from './experiment-report.js';
import { isMainModule } from './is-main-module.js';
import { laneLabel, languageFlag, platformIcon } from './log-format.js';
import {
  createMetricCollectors,
  createMetricsBrowserSession,
} from './metric-collectors.js';
import { buildSocialPostMetric, collectPostMetrics } from './metrics.js';
import type { SocialPlatform } from './platforms.js';
import { SOCIAL_PUBLISH_WINDOW_JST } from './policy.js';
import { publishSocialBatch } from './publish-batch.js';
import { SocialReleaseFailureError } from './publish-error.js';
import {
  nextBudgetSlot,
  occupiesPublishBudget,
  resolveLaneSlotPlan,
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
const METRIC_LOOKBACK_DAYS = 8;
const STRATEGY_REFRESH_INTERVAL_MS = 6 * 60 * 60_000;
const OWNER = `${hostname()}:${process.pid}`;
/**
 * How late a slot may be before the lane is moved to the next one. It covers a
 * daemon that was asleep over its slot or a publish that took longer than
 * expected; anything beyond it would publish visibly off-schedule.
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
      // Recorded and rethrown, never handled: a release-shape failure is
      // supposed to stop the process (see the docblock below), and the row is
      // the only place the reason survives that exit.
      await recordTick({
        phase: 'error',
        now: now(),
        owner: OWNER,
        error,
      });
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
    log('');
    log(
      `✅ [social-daemon] check complete · next check in ${POLL_INTERVAL_MS / 1_000}s.`,
    );
    log('');
    await sleep(POLL_INTERVAL_MS);
  }
}

/**
 * `reconcile`, `reschedule`, `discover`, and `publish` are release-shape
 * stages: a failure here can leave a cohort's lanes disagreeing about what was
 * actually published, or leave the queue mis-scheduled. Those propagate and
 * stop the whole process (see the `isMainModule` block below). `metrics`,
 * `account snapshots`, `strategy`, and `experiment report` are purely
 * observational -- losing one of them for a tick has no release-correctness
 * consequence, so those stay isolated.
 */
export async function runSocialDaemonTick(input: {
  now: Date;
  firstStartedAt: string;
  log?: (message: string) => void;
  refreshStrategy?: boolean;
}): Promise<void> {
  const log = input.log ?? (() => void 0);

  await reconcileAlreadyPublishedJobs(input.now, log);
  await reschedulePastDueJobs(input.now, log);

  await discoverAndEnqueue({
    now: input.now,
    firstStartedAt: input.firstStartedAt,
    log,
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
 * The anchor-filtered `candidates` list only tells us which episodes have
 * *recent* activity; a canonical localization that finished ready before the
 * anchor would never show up there on its own. So the anchor decides which
 * episodes to look at, then `listSocialPublishCandidatesForEpisodes` (no
 * anchor) fetches every ready language for exactly those episodes -- that is
 * what lets an episode ready before the anchor still count toward its
 * cohort's readiness.
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

  const episodeIds = [...new Set(candidates.map((c) => c.episode_id))];
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
  const scheduledByPlatform = platformBudgetIndex(schedules);

  for (const episodeId of episodeIds) {
    const episodeCandidates = candidatesByEpisode.get(episodeId) ?? [];
    const firstCandidate = episodeCandidates[0];
    if (!firstCandidate) continue;

    const lanes = await resolveReleaseCohortLanes({
      episodeId,
      episodeCreatedAt: firstCandidate.episode_created_at,
    });
    if (lanes.length === 0) continue;

    const title =
      titleByEpisodeLanguage.get(`${episodeId}|zh-Hant`) ??
      titleByEpisodeLanguage.get(
        `${episodeId}|${firstCandidate.language_code}`,
      ) ??
      null;

    for (const platform of [...new Set(lanes.map((lane) => lane.platform))]) {
      await enqueuePlatformCohort({
        episodeId,
        title,
        platform,
        lanes: lanes.filter((lane) => lane.platform === platform),
        candidates: episodeCandidates,
        schedules,
        scheduledByPlatform,
        now: input.now,
        log: input.log,
      });
    }
  }
}

/**
 * One timestamp per `(episode, platform)` cohort, which is the unit a daily cap
 * counts. Language siblings on one platform share a slot, so a multilingual
 * platform cannot publish once per language and call it one post -- and a
 * completed row that reconciliation bound to a future slot does not reserve a
 * day it never used (see {@link occupiesPublishBudget}).
 */
function platformBudgetIndex(
  schedules: readonly PendingSocialPublishSchedule[],
): Map<SocialPlatform, Date[]> {
  const byPlatform = new Map<SocialPlatform, Date[]>();
  const seen = new Set<string>();
  for (const schedule of schedules) {
    if (!occupiesPublishBudget(schedule)) continue;
    const key = `${schedule.episode_id}|${schedule.platform}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const list = byPlatform.get(schedule.platform) ?? [];
    list.push(new Date(schedule.scheduled_at));
    byPlatform.set(schedule.platform, list);
  }
  return byPlatform;
}

/**
 * The media barrier is per platform, not per episode: platforms release on
 * their own budgets now, so a language YouTube is still waiting on must not
 * hold back a Rednote lane whose own language has been ready for days.
 */
async function enqueuePlatformCohort(input: {
  episodeId: string;
  title: string | null;
  platform: SocialPlatform;
  lanes: readonly ReleaseCohortLane[];
  candidates: readonly SocialPublishCandidate[];
  schedules: readonly PendingSocialPublishSchedule[];
  scheduledByPlatform: Map<SocialPlatform, Date[]>;
  now: Date;
  log: (message: string) => void;
}): Promise<void> {
  const { platform, episodeId } = input;
  const label = `${platformIcon(platform)} ${platform} · ${episodeLabel(input.title, episodeId)}`;
  const requiredLanguages = new Set(input.lanes.map((lane) => lane.language));
  const readyLanguages = new Set(
    input.candidates.map((candidate) => candidate.language_code),
  );
  const missingLanguages = [...requiredLanguages].filter(
    (language) => !readyLanguages.has(language),
  );
  if (missingLanguages.length > 0) {
    input.log(
      `⏳ [social-daemon] ${label} · cohort not release-ready · ${missingLanguages.map((language) => `${languageFlag(language)} ${language}`).join(' · ')}`,
    );
    return;
  }

  const readyAt = new Date(
    Math.max(
      ...input.candidates
        .filter((candidate) => requiredLanguages.has(candidate.language_code))
        .map((candidate) => Date.parse(candidate.ready_at)),
    ),
  );
  if (Number.isNaN(readyAt.getTime())) return;

  // Idempotent: a cohort that already has a job row -- even a partial enqueue
  // from a prior, interrupted tick -- reuses that row's slot rather than
  // recomputing one, so a retried enqueue can never drift its lanes apart.
  const existingSchedule = input.schedules.find(
    (schedule) =>
      schedule.episode_id === episodeId && schedule.platform === platform,
  );
  let scheduledAt = existingSchedule
    ? new Date(existingSchedule.scheduled_at)
    : null;
  if (!scheduledAt) {
    const plan = await resolveLaneSlotPlan({
      platform,
      episodeId,
      language: input.lanes[0]!.language,
    });
    scheduledAt = nextBudgetSlot({
      platform,
      plan,
      after: new Date(Math.max(readyAt.getTime(), input.now.getTime())),
      scheduled: input.scheduledByPlatform.get(platform) ?? [],
    });
  }
  if (!scheduledAt) {
    // Not an error and not dropped: the backlog is longer than the horizon, so
    // this cohort stays a candidate and the next tick offers it again in the
    // same `ready_at` order. Compressing the schedule to fit it is exactly the
    // burst the caps exist to prevent.
    input.log(
      `🗓️ [social-daemon] ${label} · no slot inside the ${SCHEDULING_HORIZON_DAYS}-day horizon · staying queued for a later tick`,
    );
    return;
  }

  const insertedAny = await enqueueCohortJobs({
    episodeId,
    title: input.title,
    lanes: input.lanes,
    readyAt,
    scheduledAt,
    log: input.log,
  });
  if (insertedAny && !existingSchedule) {
    const list = input.scheduledByPlatform.get(platform) ?? [];
    list.push(scheduledAt);
    input.scheduledByPlatform.set(platform, list);
  }
}

/**
 * A slot the daemon slept through is moved forward, never dropped and never
 * published late in a burst. The old behaviour marked such a lane `completed`
 * with a `skipped: overdue` note -- a post that never existed, recorded as
 * published -- and the grace period was an environment variable, so the queue's
 * correctness depended on a value that was unset in practice.
 */
async function reschedulePastDueJobs(
  now: Date,
  log: (message: string) => void,
): Promise<void> {
  const jobs = await listPastDueSocialPublishJobs(
    new Date(now.getTime() - PUBLISH_SLOT_GRACE_MS),
  );
  if (jobs.length === 0) return;

  const schedules = await listPendingSocialPublishSchedules();
  const scheduledByPlatform = platformBudgetIndex(schedules);
  let moved = 0;
  for (const job of jobs) {
    const language = job.language_code ?? 'zh-Hant';
    const plan = await resolveLaneSlotPlan({
      platform: job.platform,
      episodeId: job.episode_id,
      language,
    });
    const scheduledAt = nextBudgetSlot({
      platform: job.platform,
      plan,
      after: now,
      scheduled: (scheduledByPlatform.get(job.platform) ?? []).filter(
        (at) => at.toISOString() !== job.scheduled_at,
      ),
    });
    if (!scheduledAt) continue;
    const rescheduled = await rescheduleSocialPublishJob({
      jobId: job.id,
      status: job.status,
      scheduledAt,
      now,
    });
    if (!rescheduled) continue;
    moved += 1;
    const list = scheduledByPlatform.get(job.platform) ?? [];
    list.push(scheduledAt);
    scheduledByPlatform.set(job.platform, list);
    log(
      `🗓️ [social-daemon] ${compactLaneLabel(job.platform, language)} · ${episodeLabel(null, job.episode_id)} · slot missed · moved to ${formatJst(scheduledAt.toISOString())}`,
    );
  }
  if (moved > 0) {
    log(
      `📥 [social-daemon] rescheduled ${moved} past-due lane${moved === 1 ? '' : 's'} onto the next free platform slot.`,
    );
  }
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

  // One lookup for the whole sweep: a backfilled queue can hold hundreds of
  // jobs, and asking per job would spend most of a tick on round-trips.
  const episodeIds = [...new Set(jobs.map((job) => job.episode_id))];
  const [posts, titleByEpisodeLanguage] = await Promise.all([
    listSocialPostIdentitiesByEpisodes(episodeIds),
    loadEpisodeTitleMap(episodeIds),
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
 * Claims whatever is due, with no cross-episode fence.
 *
 * The old fence held every other episode shut until a partially published one
 * finished, which made sense while all five lanes shared one timestamp. Under
 * per-platform budgets a partial cohort is the steady state -- Rednote at
 * 14:30 and YouTube at 17:15 are the same episode, hours apart -- so fencing
 * on it would deadlock the queue against its own schedule.
 *
 * Working hours are the one gate that remains: Rednote and X publish through
 * real browser sessions on a Mac, and a failure at 04:00 is a failure nobody
 * sees. A lane whose slot passes while the window is shut is not lost -- it is
 * moved to the next slot by `reschedulePastDueJobs`.
 */
async function publishDueJobs(
  now: Date,
  log: (message: string) => void,
): Promise<void> {
  if (!withinPublishWindow(now, SOCIAL_PUBLISH_WINDOW_JST)) return;

  const jobs = await claimSocialPublishBatch({ owner: OWNER, now });
  if (jobs.length === 0) return;

  const [active, titleByEpisodeLanguage] = await Promise.all([
    activeStrategiesForPublish(log),
    loadEpisodeTitleMap(jobs.map((job) => job.episode_id)),
  ]);
  // Grouped by `(episode, language)`, not by platform: `publishSocialBatch`
  // owns the cross-platform fail-fast, and splitting a language's platforms
  // into separate calls would take that contract away from it.
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
      // Every lane in `pendingJobs` itself is left alone here, even the ones
      // after whichever one failed: some of them may already have published
      // successfully (fail-fast stops the batch, but does not undo what it
      // already did), so releasing their lease back to `queued` could
      // re-publish a lane that is already live. They stay `processing` and
      // self-heal through the normal lease-expiry + reconcile path. Only
      // lanes in groups that were never even claimed for publishing --
      // genuinely untouched -- are safe to hand back immediately.
      await releaseUntouchedLeases(groups.slice(index + 1).flat(), now, log);
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
  if (!post) return false;
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
      const guidance = buildStrategyGuidance(
        job.platform,
        active[strategyMapKey(job.platform, jobLanguage(job))]?.config,
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
    titleByEpisodeLanguage.get(`${episodeId}|${languageCode}`) ??
    titleByEpisodeLanguage.get(`${episodeId}|zh-Hant`) ??
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

// Best-effort platform-level follower counts, approximately every three hours.
// The attribution layer uses actual captured_at intervals, so daemon downtime
// creates a wider interval rather than pretending a sample existed.
async function captureAccountSnapshots(
  now: Date,
  log: (message: string) => void,
): Promise<void> {
  await captureDueAccountSnapshots({
    now,
    openBrowser: createMetricsBrowserSession,
    log,
  });
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
    (item) => item.status === 'failed' || item.attemptsExhausted,
  );
  if (snapshot.episodeQueue.length > 0 && nextLanes.length > 0) log('');
  for (const item of nextLanes) {
    const title = item.title ? ` “${truncateTitle(item.title)}”` : '';
    // A lane past the claim RPC's attempt fence will never be picked up again;
    // printing a timestamp for it would promise a retry that cannot happen.
    const timing = item.attemptsExhausted
      ? `blocked (${item.attemptCount} attempts exhausted; ${item.status})`
      : `${formatJst(item.nextAt)} (${formatRelative(item.nextAt, now)}; ${item.status})`;
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

// Best-effort only: the daemon has no terminal to watch once it is running
// unattended, so this is the one signal that reaches a human -- but a broken
// or unset Telegram config must never mask the fatal error already on stderr.
export async function notifyFatalFailure(error: unknown): Promise<void> {
  try {
    const [chatId] = getAllowedTelegramUserIds();
    if (!chatId) return;
    await sendTelegramNotification(
      chatId,
      buildSocialReleaseFailedMessage(fatalSummary(error)),
    );
  } catch {
    // Swallowed deliberately -- see comment above.
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
