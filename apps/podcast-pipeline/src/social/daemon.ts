import '../observability/sentry-init.js';

import { hostname } from 'node:os';

import { getAllowedTelegramUserIds } from '../lib/env.js';
import { errorMessage } from '../lib/errorMessage.js';
import { isMainModule } from '../lib/is-main-module.js';
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
  type SocialMetricWindowLabel,
  type SocialPublishCandidate,
  type SocialPublishJobRow,
  type SocialQueueLaneItem,
} from './daemon-store.js';
import { withSocialDaemonTickTelemetry } from './daemon-tick-telemetry.js';
import { buildSocialExperimentReports } from './experiment-report.js';
import { JST_OFFSET_MS } from './jst.js';
import { reportLocalPublicationHistory } from './local-publish-history.js';
import { reconcileLocalPublishedJob } from './local-publish-recovery.js';
import {
  laneLabel,
  languageFlag,
  languageLabel,
  platformIcon,
  platformLabel,
} from './log-format.js';
import {
  createMetricCollectors,
  createMetricsBrowserSession,
  EMPTY_COUNTS,
} from './metric-collectors.js';
import { buildSocialPostMetric, collectPostMetrics } from './metrics.js';
import type { SocialPlatform } from './platforms.js';
import { SOCIAL_PUBLISH_WINDOW_JST } from './policy.js';
import {
  type PreparedSocialBatchCopy,
  prepareSocialBatchCopy,
  publishSocialBatch,
} from './publish-batch.js';
import {
  SocialCopyGenerationError,
  SocialReleaseFailureError,
} from './publish-error.js';
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

const POLL_INTERVAL_MS = 60_000;
const METRIC_LOOKBACK_DAYS = 8;
const EXPERIMENT_REPORT_INTERVAL_MS = 6 * 60 * 60_000;
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
  verbose?: boolean;
}

export interface SocialDaemonTickSummary {
  deferredArticles: number;
}

export type SocialCatchUpResult = 'released' | 'held' | 'backoff' | 'idle';

type PublishDueJobsOutcome =
  | 'empty'
  | 'blocked-partial'
  | 'reconciled'
  | 'held'
  | 'released';

interface PublishDueJobsOptions {
  ignorePublishWindow?: boolean;
  verbose: boolean;
}

function experimentReportDue(
  verbose: boolean,
  now: Date,
  lastReport: number,
): boolean {
  return verbose && now.getTime() - lastReport >= EXPERIMENT_REPORT_INTERVAL_MS;
}

export async function runSocialDaemon(
  dependencies: SocialDaemonDependencies = {},
): Promise<never> {
  const now = dependencies.now ?? (() => new Date());
  const sleep = dependencies.sleep ?? defaultSleep;
  const log = dependencies.log ?? console.log;
  const recordTick = dependencies.recordTick ?? recordSocialDaemonTick;
  // Programmatic callers keep the historical detailed log unless they opt in
  // to compact mode. The CLI entry point explicitly passes false by default.
  const verbose = dependencies.verbose ?? true;
  let lastExperimentReport = 0;
  let consecutiveTransientFailures = 0;
  let lastQueueFingerprint: string | null = null;

  const daemonStartedAt = now();
  const firstStartedAt = await ensureSocialDaemonStart(daemonStartedAt);
  if (verbose) {
    log(
      `🤖 [social-daemon] started as ${OWNER}; discovery begins at ${firstStartedAt}.`,
    );
  } else {
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    log(
      `🛰️ [social-daemon] Social Publisher · ${formatJst(daemonStartedAt.toISOString())}`,
    );
    log(
      '   Compact operator log · use pnpm ops --verbose for full diagnostics',
    );
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  }

  for (;;) {
    const tickStartedAt = now();
    const reportExperiments = experimentReportDue(
      verbose,
      tickStartedAt,
      lastExperimentReport,
    );
    if (verbose) {
      log(
        `🔄 [social-daemon] checking discovery · publishing · metrics${
          reportExperiments ? ' · experiments' : ''
        }`,
      );
    }
    await recordTick({ phase: 'start', now: tickStartedAt, owner: OWNER });
    let tickSummary: SocialDaemonTickSummary = { deferredArticles: 0 };
    try {
      await runSocialDaemonTick({
        now: tickStartedAt,
        firstStartedAt,
        log,
        verbose,
        onSummary: (summary) => {
          tickSummary = summary;
        },
        reportExperiments,
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
        isTransientNetworkError(error)
      ) {
        consecutiveTransientFailures += 1;
        log(
          `⚠️ [social-daemon] network unavailable · ${consecutiveTransientFailures} failed tick(s) · retrying in 60s · ${errorMessage(error).split('\n')[0]}`,
        );
        await sleep(POLL_INTERVAL_MS);
        continue;
      }
      throw error;
    }
    if (reportExperiments) {
      lastExperimentReport = tickStartedAt.getTime();
    }
    await isolate('queue summary', log, async () => {
      const snapshot = await getSocialQueueSnapshot({
        includeWaitingMedia: true,
      });
      const fingerprint = JSON.stringify({
        snapshot,
        deferredArticles: tickSummary.deferredArticles,
      });
      if (verbose || fingerprint !== lastQueueFingerprint) {
        log('');
        logQueueSnapshot(snapshot, tickStartedAt, log, {
          verbose,
          deferredArticles: tickSummary.deferredArticles,
        });
        lastQueueFingerprint = fingerprint;
      }
    });
    await recordTick({ phase: 'success', now: now(), owner: OWNER });
    if (consecutiveTransientFailures > 0) {
      log(
        `✅ [social-daemon] network recovered after ${consecutiveTransientFailures} failed tick(s)`,
      );
      consecutiveTransientFailures = 0;
    }
    if (verbose) {
      log('');
      log(
        `✅ [social-daemon] check complete · next check in ${POLL_INTERVAL_MS / 1_000}s.`,
      );
      log('');
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

export async function runSocialCatchUpOnce(
  dependencies: Pick<SocialDaemonDependencies, 'now' | 'log' | 'verbose'> = {},
): Promise<SocialCatchUpResult> {
  const now = (dependencies.now ?? (() => new Date()))();
  return withSocialDaemonTickTelemetry(
    { now, owner: OWNER, log: dependencies.log },
    () => runSocialCatchUpOnceWork({ ...dependencies, now: () => now }),
  );
}

async function runSocialCatchUpOnceWork(
  dependencies: Pick<SocialDaemonDependencies, 'log' | 'verbose'> & {
    now: () => Date;
  },
): Promise<SocialCatchUpResult> {
  const now = dependencies.now();
  const log = dependencies.log ?? console.log;
  const verbose = dependencies.verbose ?? true;
  const firstStartedAt = await ensureSocialDaemonStart(now);
  const titleIndex = createEpisodeTitleIndex();

  log('🩹 [social-once] checking for one catch-up article');
  await reconcileAlreadyPublishedJobs(now, log, titleIndex);

  // A stale job that is already represented in social_posts is reconciliation
  // work, not a release. Keep walking those rows until we either reach an
  // actually unpublished cohort, a partial-release backoff, or an empty queue.
  for (;;) {
    await capturePrePublishSnapshotsForDue(now, log);
    const outcome = await publishDueJobs(now, log, titleIndex, {
      ignorePublishWindow: true,
      verbose,
    });
    if (outcome === 'reconciled') continue;
    if (outcome !== 'empty') return finishSocialCatchUp(outcome, log);
    break;
  }

  // No durable overdue cohort exists. Run one discovery pass and allow only the
  // oldest fully-ready new article to become immediately due; this is the only
  // place one-shot mode creates an off-slot timestamp.
  const discovered = await discoverAndEnqueue({
    now,
    firstStartedAt,
    log,
    titleIndex,
    immediateScheduleAt: now,
    maxNewCohorts: 1,
    verbose,
  });
  if (discovered.newCohorts === 0) return finishSocialCatchUp('empty', log);

  await capturePrePublishSnapshotsForDue(now, log);
  const outcome = await publishDueJobs(now, log, titleIndex, {
    ignorePublishWindow: true,
    verbose,
  });
  return finishSocialCatchUp(outcome, log);
}

function finishSocialCatchUp(
  outcome: PublishDueJobsOutcome,
  log: (message: string) => void,
): SocialCatchUpResult {
  if (outcome === 'released') {
    log('✅ [social-once] catch-up complete · 1 article released · exiting');
    return 'released';
  }
  if (outcome === 'blocked-partial') {
    log(
      '⏸️ [social-once] catch-up complete · partial release backoff still active · 0 articles released · exiting',
    );
    return 'backoff';
  }
  if (outcome === 'held') {
    log(
      '⏸️ [social-once] catch-up complete · article held by release safety checks · 0 articles released · exiting',
    );
    return 'held';
  }
  log('✅ [social-once] catch-up complete · nothing due · exiting');
  return 'idle';
}

/**
 * `reconcile`, `align schedules`, `discover`, and `publish` are release-shape
 * stages: a failure here can leave a cohort's lanes disagreeing about what was
 * actually published, or leave the queue mis-scheduled. Those propagate and
 * stop the whole process. Metrics, snapshots and experiment reports are purely
 * observational and stay isolated.
 *
 * One exception is handled by the main loop: socket/DNS-layer transient
 * network failures (`isTransientNetworkError`) that are not a
 * `SocialReleaseFailureError` are retried indefinitely at the normal poll
 * interval. A laptop may be offline for hours, and `reconcile` on the first
 * successful tick is already the correct recovery path for a Supabase blip
 * that happened before any transport started. `SocialReleaseFailureError`
 * and all other errors remain fatal so an ambiguous publish transport result
 * can never be retried blindly and create duplicate posts.
 */
export async function runSocialDaemonTick(
  input: Parameters<typeof runSocialDaemonTickWork>[0],
): Promise<void> {
  return withSocialDaemonTickTelemetry(
    { now: input.now, owner: OWNER, log: input.log },
    () => runSocialDaemonTickWork(input),
  );
}

async function runSocialDaemonTickWork(input: {
  now: Date;
  firstStartedAt: string;
  log?: (message: string) => void;
  reportExperiments?: boolean;
  verbose?: boolean;
  onSummary?: (summary: SocialDaemonTickSummary) => void;
}): Promise<void> {
  const log = input.log ?? (() => void 0);
  const verbose = input.verbose ?? true;
  const observationLog = verbose ? log : warningsOnlyLog(log);
  const titleIndex = createEpisodeTitleIndex();

  await reconcileAlreadyPublishedJobs(input.now, log, titleIndex);
  const alignment = await alignPendingSocialReleaseCohorts(
    input.now,
    PUBLISH_SLOT_GRACE_MS,
  );
  if (alignment.alignedLanes > 0) {
    log(formatReleaseCohortRepair(alignment, verbose));
  }

  const discovery = await discoverAndEnqueue({
    now: input.now,
    firstStartedAt: input.firstStartedAt,
    log,
    titleIndex,
    verbose,
  });

  await capturePrePublishSnapshotsForDue(input.now, observationLog);

  await publishDueJobs(input.now, log, titleIndex, { verbose });

  // `collectDueMetricWindows` and `captureAccountSnapshots` are the two
  // observational steps left once publishing (and its own X/Rednote
  // `launchPersistentContext` sessions) has finished for the tick, so they
  // share one lazily-created Chrome session instead of opening one each.
  let observationBrowser:
    | ReturnType<typeof createMetricsBrowserSession>
    | undefined;
  const openObservationBrowser = () =>
    (observationBrowser ??= createMetricsBrowserSession());
  try {
    await isolate('metrics', log, async () => {
      await collectDueMetricWindows(
        input.now,
        observationLog,
        titleIndex,
        openObservationBrowser,
      );
    });
    await isolate('account snapshots', log, async () => {
      await captureAccountSnapshots(
        input.now,
        observationLog,
        openObservationBrowser,
      );
    });
  } finally {
    await observationBrowser?.close();
  }
  if (verbose && input.reportExperiments) {
    await isolate('experiment report', log, () =>
      logExperimentReports(input.now, log),
    );
  }

  input.onSummary?.({ deferredArticles: discovery.deferredArticles });
}

async function capturePrePublishSnapshotsForDue(
  now: Date,
  log: (message: string) => void,
): Promise<void> {
  await isolate('pre-publish snapshots', log, async () => {
    const platforms = await listDueSocialPublishPlatforms(now);
    if (platforms.length === 0) return;
    await capturePrePublishAccountSnapshots({
      now,
      platforms,
      openBrowser: createMetricsBrowserSession,
      log,
    });
  });
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
  titleIndex: EpisodeTitleIndex;
  immediateScheduleAt?: Date;
  maxNewCohorts?: number;
  verbose: boolean;
}): Promise<{ newCohorts: number; deferredArticles: number }> {
  const [candidates, schedules] = await Promise.all([
    listSocialPublishCandidates(input.firstStartedAt),
    listPendingSocialPublishSchedules(),
  ]);
  if (candidates.length === 0) return { newCohorts: 0, deferredArticles: 0 };

  const episodeIds = [
    ...new Set(candidates.map((candidate) => candidate.episode_id)),
  ];
  const [readyCandidates, titleByEpisodeLanguage] = await Promise.all([
    listSocialPublishCandidatesForEpisodes(episodeIds),
    input.titleIndex.load(episodeIds),
  ]);
  const candidatesByEpisode = new Map<string, SocialPublishCandidate[]>();
  for (const candidate of readyCandidates) {
    const list = candidatesByEpisode.get(candidate.episode_id) ?? [];
    list.push(candidate);
    candidatesByEpisode.set(candidate.episode_id, list);
  }
  const scheduledArticles = releaseBudgetIndex(schedules);
  let backlogArticles = releaseBacklogArticles(schedules);
  let newCohorts = 0;
  let deferredArticles = 0;

  for (const episodeId of episodeIds) {
    const result = await discoverAndEnqueueEpisode({
      episodeId,
      episodeCandidates: candidatesByEpisode.get(episodeId) ?? [],
      schedules,
      scheduledArticles,
      backlogArticles,
      titleByEpisodeLanguage,
      now: input.now,
      log: input.log,
      immediateScheduleAt: input.immediateScheduleAt,
      verbose: input.verbose,
    });
    if (result.inserted) {
      newCohorts += 1;
      backlogArticles += 1;
      if (
        input.maxNewCohorts !== undefined &&
        newCohorts >= input.maxNewCohorts
      ) {
        break;
      }
    }
    if (result.deferred) {
      deferredArticles += 1;
    }
  }
  return { newCohorts, deferredArticles };
}

async function discoverAndEnqueueEpisode(input: {
  episodeId: string;
  episodeCandidates: readonly SocialPublishCandidate[];
  schedules: readonly PendingSocialPublishSchedule[];
  scheduledArticles: Date[];
  backlogArticles: number;
  titleByEpisodeLanguage: ReadonlyMap<string, string | null>;
  now: Date;
  log: (message: string) => void;
  immediateScheduleAt?: Date;
  verbose: boolean;
}): Promise<{ inserted: boolean; deferred: boolean }> {
  const firstCandidate = input.episodeCandidates[0];
  if (!firstCandidate) return { inserted: false, deferred: false };

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
    return { inserted: false, deferred: false };
  }

  return enqueueNewCohort({
    episodeId: input.episodeId,
    firstCandidate,
    title,
    episodeCandidates: input.episodeCandidates,
    scheduledArticles: input.scheduledArticles,
    backlogArticles: input.backlogArticles,
    now: input.now,
    log: input.log,
    immediateScheduleAt: input.immediateScheduleAt,
    verbose: input.verbose,
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
  }));
}

function readyAtForLanguages(
  candidates: readonly SocialPublishCandidate[],
  requiredLanguages: ReadonlySet<string>,
): Date | null {
  const timestamps = candidates
    .filter((candidate) => requiredLanguages.has(candidate.language_code))
    .map((candidate) => Date.parse(candidate.ready_at));
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

function logCohortNotReady(
  log: (message: string) => void,
  title: string | null,
  episodeId: string,
  missing: readonly string[],
): void {
  log(
    `⏳ [social-daemon] ${episodeLabel(title, episodeId)} · cohort not release-ready · ${missing.map((language) => languageLabel(language)).join(' · ')}`,
  );
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
  const requiredLanguages = new Set(existingLanes.map((lane) => lane.language));
  const readyLanguages = new Set(
    input.episodeCandidates.map((candidate) => candidate.language_code),
  );
  const missing = missingLanguages(requiredLanguages, readyLanguages);
  if (missing.length > 0) {
    logCohortNotReady(input.log, input.title, input.episodeId, missing);
    return;
  }
  const readyAt = readyAtForLanguages(
    input.episodeCandidates,
    requiredLanguages,
  );
  if (!readyAt) return;
  const scheduledAt = new Date(input.existingSchedule.scheduled_at);

  // Determine whether this is an interrupted enqueue (subset) vs a reshape.
  const intendedLanes = resolveReleaseCohortLanes(
    input.firstCandidate.episode_created_at,
  );
  const existingKeys = new Set(
    existingLanes.map((lane) => `${lane.platform}|${lane.language}`),
  );
  const intendedKeys = new Set(
    intendedLanes.map((lane) => `${lane.platform}|${lane.language}`),
  );
  const isSubset = [...existingKeys].every((key) => intendedKeys.has(key));
  // Only a strict subset of the current policy can be an interrupted enqueue.
  // A complete or historical cohort already owns its durable lanes: avoid even
  // conflict-ignored inserts, whose BEFORE INSERT triggers still run in Postgres.
  const lanes = isSubset
    ? intendedLanes.filter(
        (lane) => !existingKeys.has(`${lane.platform}|${lane.language}`),
      )
    : [];
  if (lanes.length === 0) return;

  const finalMissing = missingLanguages(
    new Set(lanes.map((lane) => lane.language)),
    readyLanguages,
  );
  if (finalMissing.length > 0) {
    logCohortNotReady(input.log, input.title, input.episodeId, finalMissing);
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
  backlogArticles: number;
  now: Date;
  log: (message: string) => void;
  immediateScheduleAt?: Date;
  verbose: boolean;
}): Promise<{ inserted: boolean; deferred: boolean }> {
  const requiredLanguages = new Set(
    resolveRequiredReleaseLanguages(input.firstCandidate.episode_created_at),
  );
  if (requiredLanguages.size === 0) return { inserted: false, deferred: false };

  const readyLanguages = new Set(
    input.episodeCandidates.map((candidate) => candidate.language_code),
  );
  const missing = missingLanguages(requiredLanguages, readyLanguages);
  if (missing.length > 0) {
    logCohortNotReady(input.log, input.title, input.episodeId, missing);
    return { inserted: false, deferred: false };
  }

  const readyAt = readyAtForLanguages(
    input.episodeCandidates,
    requiredLanguages,
  );
  if (!readyAt) return { inserted: false, deferred: false };

  let scheduledAt: Date | null;
  if (input.immediateScheduleAt) {
    if (readyAt.getTime() > input.immediateScheduleAt.getTime())
      return { inserted: false, deferred: false };
    scheduledAt = input.immediateScheduleAt;
  } else {
    scheduledAt = nextReleaseSlot({
      after: new Date(Math.max(readyAt.getTime(), input.now.getTime())),
      scheduled: input.scheduledArticles,
      backlogArticles: input.backlogArticles + 1,
    });
  }
  if (!scheduledAt) {
    if (input.verbose) {
      input.log(
        `🗓️ [social-daemon] ${episodeLabel(input.title, input.episodeId)} · no article slot inside the ${SCHEDULING_HORIZON_DAYS}-day horizon · staying discoverable for a later tick`,
      );
    }
    return { inserted: false, deferred: true };
  }

  const lanes = resolveReleaseCohortLanes(
    input.firstCandidate.episode_created_at,
  );

  const insertedAny = await enqueueCohortJobs({
    episodeId: input.episodeId,
    title: input.title,
    lanes,
    readyAt,
    scheduledAt,
    log: input.log,
  });
  if (insertedAny) input.scheduledArticles.push(scheduledAt);
  return { inserted: insertedAny, deferred: false };
}

/** Number of wholly unpublished durable article cohorts still in the queue. */
function releaseBacklogArticles(
  schedules: readonly PendingSocialPublishSchedule[],
): number {
  const states = new Map<
    string,
    { hasPending: boolean; hasCompleted: boolean }
  >();
  for (const schedule of schedules) {
    const state = states.get(schedule.episode_id) ?? {
      hasPending: false,
      hasCompleted: false,
    };
    if (schedule.status === 'completed') state.hasCompleted = true;
    else state.hasPending = true;
    states.set(schedule.episode_id, state);
  }
  return [...states.values()].filter(
    (state) => state.hasPending && !state.hasCompleted,
  ).length;
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
  titleIndex: EpisodeTitleIndex,
): Promise<void> {
  const jobs = await listUnfinishedSocialPublishJobs();
  if (jobs.length === 0) return;

  const episodeIds = [...new Set(jobs.map((job) => job.episode_id))];
  const [posts, titleByEpisodeLanguage] = await Promise.all([
    listSocialPostIdentitiesByEpisodes(episodeIds),
    titleIndex.load(episodeIds),
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
      `❌ [social-daemon] ${platformLabel(input.platform)} · failed to persist publish failure · episode ${input.episodeId} · ${errorMessage(persistenceError)}`,
    );
  }
  input.log(
    `❌ [social-daemon] ${platformLabel(input.platform)} · ${episodeLabel(input.title ?? null, input.episodeId)} · publish failed · episode=${input.episodeId} · job=${input.jobId} · ${input.message}`,
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
  titleIndex: EpisodeTitleIndex,
  options: PublishDueJobsOptions,
): Promise<PublishDueJobsOutcome> {
  const verbose = options.verbose;
  if (
    !options.ignorePublishWindow &&
    !withinPublishWindow(now, SOCIAL_PUBLISH_WINDOW_JST)
  ) {
    return 'empty';
  }

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
      return 'blocked-partial';
    }
    return 'empty';
  }

  const titleByEpisodeLanguage = await titleIndex.load(
    jobs.map((job) => job.episode_id),
  );
  const { pendingByEpisodeLanguage, claimFailures } =
    await reconcileClaimedJobsForPublish(
      jobs,
      now,
      titleByEpisodeLanguage,
      log,
    );

  if (pendingByEpisodeLanguage.size === 0) {
    return claimFailures > 0 ? 'held' : 'reconciled';
  }

  logCompactPublishingStart(
    pendingByEpisodeLanguage,
    titleByEpisodeLanguage,
    log,
    verbose,
  );

  const mediaReady = await holdCohortsMissingMedia(
    pendingByEpisodeLanguage,
    now,
    titleByEpisodeLanguage,
    log,
  );
  if (mediaReady.length === 0) return 'held';
  // The cheap database re-check runs first, so an episode whose media is gone
  // never pays for an LLM call.
  const groups = await holdCohortsMissingCopy(
    mediaReady,
    now,
    titleByEpisodeLanguage,
    log,
    verbose,
  );
  if (groups.length === 0) return 'held';
  logCompactPublishingPlatforms(groups, log, verbose);
  const publishStartedAt = Date.now();
  for (const [index, group] of groups.entries()) {
    try {
      await publishLanguageBatch(
        group.jobs,
        group.copy,
        titleByEpisodeLanguage,
        now,
        log,
        verbose,
      );
    } catch (error) {
      await releaseUntouchedLeases(
        groups.slice(index + 1).flatMap((rest) => rest.jobs),
        now,
        log,
      );
      // Generic failures happen before publishSocialPlatforms has started
      // transport (video/job preparation). No lane in this language batch
      // could be live, so hand the whole claimed group back immediately
      // instead of waiting for the 60-minute lease to expire.
      await (error instanceof SocialReleaseFailureError
        ? refundUntriedLanesInFailedGroup(group.jobs, error, now, log)
        : releaseUntouchedLeases(group.jobs, now, log));
      throw error;
    }
  }
  logCompactPublishingComplete(groups, publishStartedAt, log, verbose);
  return 'released';
}

async function reconcileClaimedJobsForPublish(
  jobs: readonly SocialPublishJobRow[],
  now: Date,
  titleByEpisodeLanguage: ReadonlyMap<string, string | null>,
  log: (message: string) => void,
): Promise<{
  pendingByEpisodeLanguage: Map<string, SocialPublishJobRow[]>;
  claimFailures: number;
}> {
  const pendingByEpisodeLanguage = new Map<string, SocialPublishJobRow[]>();
  let claimFailures = 0;
  for (const job of jobs) {
    try {
      if (await reconcileClaimedJob(job, now, titleByEpisodeLanguage, log)) {
        continue;
      }
      const key = groupKey(job);
      const pending = pendingByEpisodeLanguage.get(key) ?? [];
      pending.push(job);
      pendingByEpisodeLanguage.set(key, pending);
    } catch (error) {
      claimFailures += 1;
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
  return { pendingByEpisodeLanguage, claimFailures };
}

interface PreparedReleaseGroup {
  jobs: SocialPublishJobRow[];
  copy: PreparedSocialBatchCopy;
}

/**
 * Copy generation is the last pre-transport step that can fail for one
 * language of an otherwise healthy article, so every claimed group is written
 * before the first group is published. Generating it inside the publish loop
 * instead meant a Rednote note rejected by the red-line judge arrived after
 * the article's `en` and `ja` lanes were already live -- a permanently partial
 * article, which the cohort contract forbids.
 *
 * A rejected note holds the article rather than killing the daemon: three
 * attempts were spent before any transport, so nothing is live and nothing is
 * unreadable, but the same three attempts would fail identically after a
 * restart. Fatal there is a loop that never spends an attempt and never lets
 * the next article through, while a hold charges one attempt, applies the
 * retry backoff, and moves the next tick's claim seed on.
 *
 * Everything that is not `SocialCopyGenerationError` is rethrown untouched --
 * a missing episode row, an unreadable prompt file, or a red-line judge that
 * could not answer at all are outages and deployment faults, and holding the
 * article on those would burn all eight attempts of every zh-Hant article
 * while the daemon reported green.
 */
async function holdCohortsMissingCopy(
  groups: readonly SocialPublishJobRow[][],
  now: Date,
  titleByEpisodeLanguage: ReadonlyMap<string, string | null>,
  log: (message: string) => void,
  verbose: boolean,
): Promise<PreparedReleaseGroup[]> {
  const copyByGroup = new Map<string, PreparedSocialBatchCopy>();
  const heldEpisodes = new Map<string, ClaimedCohortHold>();

  for (const jobs of groups) {
    const firstJob = jobs[0];
    if (!firstJob || heldEpisodes.has(firstJob.episode_id)) continue;
    const languageCode = jobLanguage(firstJob);
    try {
      copyByGroup.set(
        groupKey(firstJob),
        await prepareSocialBatchCopy({
          episodeId: firstJob.episode_id,
          languageCode,
          platforms: jobs.map((job) => job.platform),
          logLlm: verbose,
        }),
      );
      if (!verbose) {
        log(`   ✓ ${operatorLanguageLabel(languageCode)} copy ready`);
      }
    } catch (error) {
      if (!(error instanceof SocialCopyGenerationError)) throw error;
      heldEpisodes.set(firstJob.episode_id, {
        logDetail: `copy generation failed ${languageLabel(languageCode)} · ${truncateHoldReason(error.reason)}`,
        lastError: `Release held: ${languageCode} social copy generation failed after ${error.attempts} attempts — ${error.reason}`,
      });
    }
  }

  const survivors = await holdClaimedCohorts(
    groups,
    heldEpisodes,
    now,
    titleByEpisodeLanguage,
    log,
  );
  return survivors.flatMap((jobs) => {
    const firstJob = jobs[0]!;
    const copy = copyByGroup.get(groupKey(firstJob))!;
    return [{ jobs, copy }];
  });
}

const HOLD_REASON_LOG_MAX_CHARACTERS = 200;

function truncateHoldReason(reason: string): string {
  const firstLine = reason.split('\n')[0]!;
  return firstLine.length > HOLD_REASON_LOG_MAX_CHARACTERS
    ? `${firstLine.slice(0, HOLD_REASON_LOG_MAX_CHARACTERS)}…`
    : firstLine;
}

/**
 * The enqueue barrier already proved every required lane's media existed, but
 * nothing freezes it afterwards: a force re-plan between enqueue and this tick
 * requeues a render and removes the completed video underneath an already
 * claimed cohort. Publishing then ships the languages that survived and dies
 * fatally on the one that did not, which is exactly the permanently partial
 * article the cohort contract forbids. So readiness is re-checked here, against
 * the same `social_publish_candidates` definition discovery uses, and a missing
 * language holds that whole episode while every other episode still publishes.
 *
 * The hold fails the lanes rather than releasing their leases: media vanishing
 * after enqueue is exceptional state that has to be visible in `last_error` and
 * the queue summary, and spending an attempt is what keeps the partial-cohort
 * fence bounded instead of holding the queue forever.
 */
async function holdCohortsMissingMedia(
  pendingByEpisodeLanguage: ReadonlyMap<string, SocialPublishJobRow[]>,
  now: Date,
  titleByEpisodeLanguage: ReadonlyMap<string, string | null>,
  log: (message: string) => void,
): Promise<SocialPublishJobRow[][]> {
  const groups = [...pendingByEpisodeLanguage.values()];
  const episodeIds = [...new Set(groups.flat().map((job) => job.episode_id))];

  const [schedules, candidates] = await Promise.all([
    listPendingSocialPublishSchedules(),
    listSocialPublishCandidatesForEpisodes(episodeIds),
  ]);

  // Every durable lane of the episode has to be publishable, not just the lanes
  // this tick happened to claim: shipping two of three languages now and
  // failing the third later is still a partial article.
  const scopedEpisodes = new Set(episodeIds);
  const requiredByEpisode = new Map<string, Set<string>>();
  const requireLanguage = (episodeId: string, language: string) => {
    const languages = requiredByEpisode.get(episodeId) ?? new Set<string>();
    languages.add(language);
    requiredByEpisode.set(episodeId, languages);
  };
  for (const schedule of schedules) {
    if (!scopedEpisodes.has(schedule.episode_id)) continue;
    requireLanguage(schedule.episode_id, schedule.language_code);
  }
  for (const job of groups.flat()) {
    requireLanguage(job.episode_id, jobLanguage(job));
  }

  const readyByEpisode = new Map<string, Set<string>>();
  for (const candidate of candidates) {
    const languages =
      readyByEpisode.get(candidate.episode_id) ?? new Set<string>();
    languages.add(candidate.language_code);
    readyByEpisode.set(candidate.episode_id, languages);
  }

  const heldEpisodes = new Map<string, ClaimedCohortHold>();
  for (const episodeId of episodeIds) {
    const missing = missingLanguages(
      requiredByEpisode.get(episodeId)!,
      readyByEpisode.get(episodeId) ?? new Set<string>(),
    );
    if (missing.length === 0) continue;
    heldEpisodes.set(episodeId, {
      logDetail: `missing ${missing.map(languageLabel).join(' · ')}`,
      lastError: `Release held: ${missing.join(', ')} video is not completed`,
    });
  }

  return holdClaimedCohorts(
    groups,
    heldEpisodes,
    now,
    titleByEpisodeLanguage,
    log,
  );
}

interface ClaimedCohortHold {
  /** Printed after `release held · ` on the article's operator line. */
  logDetail: string;
  /** Written to every held lane's `last_error`, prefix included. */
  lastError: string;
}

/**
 * Holds every claimed lane of each named episode and returns the groups that
 * survive. Failing the lanes rather than releasing their leases is what makes
 * a hold visible in `last_error` and the queue summary, and what keeps the
 * partial-cohort fence bounded: a hold spends an attempt, so an episode that
 * can never recover reaches `MAX_PUBLISH_ATTEMPTS` instead of holding the
 * queue forever.
 */
async function holdClaimedCohorts(
  groups: readonly SocialPublishJobRow[][],
  heldEpisodes: ReadonlyMap<string, ClaimedCohortHold>,
  now: Date,
  titleByEpisodeLanguage: ReadonlyMap<string, string | null>,
  log: (message: string) => void,
): Promise<SocialPublishJobRow[][]> {
  const survivors = groups.filter((pendingJobs) =>
    pendingJobs.every((job) => !heldEpisodes.has(job.episode_id)),
  );
  if (heldEpisodes.size === 0) return survivors;

  for (const [episodeId, hold] of heldEpisodes) {
    log(
      `⏸️ [social-daemon] ${episodeLabel(episodeTitle(titleByEpisodeLanguage, episodeId, 'zh-Hant'), episodeId)} · release held · ${hold.logDetail}`,
    );
    for (const job of groups.flat()) {
      if (job.episode_id !== episodeId) continue;
      try {
        await failSocialPublishJob({
          jobId: job.id,
          owner: OWNER,
          now,
          attemptCount: job.attempt_count,
          error: hold.lastError,
        });
      } catch (persistenceError) {
        // The lease still expires on its own, so a failed hold write must not
        // take the daemon down over a release that is already being held.
        log(
          `❌ [social-daemon] ${laneLabel(job.platform, jobLanguage(job))} · failed to persist release hold · job=${job.id} · ${errorMessage(persistenceError)}`,
        );
      }
    }
  }

  return survivors;
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
  error: SocialReleaseFailureError,
  now: Date,
  log: (message: string) => void,
): Promise<void> {
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

async function publishLanguageBatch(
  jobs: SocialPublishJobRow[],
  preparedCopy: PreparedSocialBatchCopy,
  titleByEpisodeLanguage: ReadonlyMap<string, string | null>,
  now: Date,
  log: (message: string) => void,
  verbose: boolean,
): Promise<void> {
  const firstJob = jobs[0]!;
  const outcomes = await publishSocialBatch({
    episodeId: firstJob.episode_id,
    languageCode: jobLanguage(firstJob),
    platforms: jobs.map((job) => ({
      platform: job.platform,
      experimentKey: job.experiment_key,
      experimentVariant: job.experiment_variant,
      titleOverride: job.legacy_title_override ?? null,
    })),
    episode: preparedCopy.episode,
    packagingByPlatform: preparedCopy.packagingByPlatform,
    copySnapshot: preparedCopy.snapshot,
    ...(verbose ? { onLog: log } : {}),
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
      now,
      titleByEpisodeLanguage,
      log,
      verbose,
    );
  }
}

async function finalizePublishOutcome(
  job: SocialPublishJobRow,
  outcomes: Awaited<ReturnType<typeof publishSocialBatch>>,
  now: Date,
  titleByEpisodeLanguage: ReadonlyMap<string, string | null>,
  log: (message: string) => void,
  verbose: boolean,
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
  });
  logPublishedOutcome(job, post.post_url, titleByEpisodeLanguage, log, verbose);
}

function jobLanguage(
  job: Pick<SocialPublishJobRow, 'language_code'>,
): SocialPublishJobRow['language_code'] {
  return job.language_code ?? 'zh-Hant';
}

function groupKey(
  job: Pick<SocialPublishJobRow, 'episode_id' | 'language_code'>,
): string {
  return `${job.episode_id}|${jobLanguage(job)}`;
}

interface EpisodeTitleIndex {
  load(
    episodeIds: readonly string[],
  ): Promise<ReadonlyMap<string, string | null>>;
}

/**
 * Reconciliation, discovery, publishing and metrics each ask for a title on
 * largely the same set of episode ids within one tick. This index is created
 * once per tick and remembers which episode ids it has already fetched, so
 * only ids no earlier phase in this tick has seen reach the database.
 */
function createEpisodeTitleIndex(): EpisodeTitleIndex {
  const titleByEpisodeLanguage = new Map<string, string | null>();
  const loadedEpisodeIds = new Set<string>();
  return {
    async load(episodeIds) {
      const unseen = [...new Set(episodeIds)].filter(
        (episodeId) => !loadedEpisodeIds.has(episodeId),
      );
      if (unseen.length > 0) {
        const rows = await listSocialEpisodeLocalizationTitles(unseen);
        for (const row of rows) {
          titleByEpisodeLanguage.set(
            `${row.episode_id}|${row.language_code}`,
            row.title,
          );
        }
        for (const episodeId of unseen) loadedEpisodeIds.add(episodeId);
      }

[Showing lines 1-1537 of 2169 (50.0KB limit). Use offset=1538 to continue.]