import { hostname } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';

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
import { runSocialCli } from './cli.js';
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
  latestPendingSocialPublishSchedule,
  listLearningSocialPosts,
  listMetricWindowsForPosts,
  listSocialPublishCandidates,
  listUnfinishedSocialPublishJobs,
  reconcileSocialPublishJob,
  type SocialMetricWindowLabel,
  type SocialPublishJobRow,
  type SocialStrategyVersionRow,
} from './daemon-store.js';
import { isMainModule } from './is-main-module.js';
import {
  createMetricCollectors,
  createMetricsBrowserSession,
} from './metric-collectors.js';
import { buildSocialPostMetric, collectPostMetrics } from './metrics.js';
import { SOCIAL_PLATFORMS, type SocialPlatform } from './platforms.js';
import {
  activeStrategyMap,
  buildStrategyGuidance,
  defaultSocialStrategy,
  nextPublishSlot,
  refreshSocialStrategies,
  startOfJstDay,
} from './strategy.js';

const REPO_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
);
const POLL_INTERVAL_MS = 60_000;
const METRIC_LOOKBACK_DAYS = 8;
const STRATEGY_REFRESH_INTERVAL_MS = 6 * 60 * 60_000;
const OWNER = `${hostname()}:${process.pid}`;

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

dotenv.config({ path: resolve(REPO_ROOT, '.env') });

export interface SocialDaemonDependencies {
  now?: () => Date;
  sleep?: (milliseconds: number) => Promise<void>;
  log?: (message: string) => void;
}

export async function runSocialDaemon(
  dependencies: SocialDaemonDependencies = {},
): Promise<never> {
  const now = dependencies.now ?? (() => new Date());
  const sleep = dependencies.sleep ?? defaultSleep;
  const log = dependencies.log ?? console.log;
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
    });
    if (
      tickStartedAt.getTime() - lastStrategyRefresh >=
      STRATEGY_REFRESH_INTERVAL_MS
    ) {
      lastStrategyRefresh = tickStartedAt.getTime();
    }
    await isolate('queue summary', log, async () => {
      logQueueSnapshot(await getSocialQueueSnapshot(), tickStartedAt, log);
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
  await isolate('publish', log, () => publishDueJobs(input.now, log));
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
  }
}

async function discoverAndEnqueue(input: {
  now: Date;
  firstStartedAt: string;
  log: (message: string) => void;
}): Promise<void> {
  const [candidates, latestSchedule] = await Promise.all([
    listSocialPublishCandidates(input.firstStartedAt),
    latestPendingSocialPublishSchedule(),
  ]);
  if (candidates.length === 0) return;

  let rollingLast = latestSchedule ? new Date(latestSchedule) : null;

  for (const candidate of candidates) {
    const readyAt = new Date(candidate.ready_at);
    if (Number.isNaN(readyAt.getTime())) continue;
    let discoveredLogged = false;
    let after = readyAt;
    if (rollingLast) {
      after = new Date(rollingLast.getTime() + 60_000);
    } else if (input.now > readyAt) {
      after = startOfJstDay(input.now);
    }
    const scheduledAt = nextPublishSlot({
      platform: 'x',
      readyAt,
      after,
      config: defaultSocialStrategy(),
    });
    let insertedAny = false;

    for (const platform of SOCIAL_PLATFORMS) {
      const inserted = await enqueueSocialPublishJob({
        episodeId: candidate.episode_id,
        platform,
        scheduledAt: scheduledAt.toISOString(),
      });
      if (inserted) {
        insertedAny = true;
        if (!discoveredLogged) {
          input.log(
            `[social-daemon] discovered episode ${candidate.episode_id}; ready at ${readyAt.toISOString()}.`,
          );
          discoveredLogged = true;
        }
        input.log(
          `[social-daemon] queued ${platform} for ${candidate.episode_id} at ${scheduledAt.toISOString()}.`,
        );
      }
    }
    if (insertedAny) rollingLast = scheduledAt;
  }
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
      `${post.episode_id}|${post.platform}`,
      postIdByJob.get(`${post.episode_id}|${post.platform}`) ?? post.id,
    );
  }

  let firstError: unknown = null;
  for (const job of jobs) {
    try {
      const socialPostId = postIdByJob.get(`${job.episode_id}|${job.platform}`);
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
  const pendingByEpisode = new Map<string, typeof jobs>();
  for (const job of jobs) {
    try {
      if (await reconcileClaimedJob(job, now, log)) continue;
      const pending = pendingByEpisode.get(job.episode_id) ?? [];
      pending.push(job);
      pendingByEpisode.set(job.episode_id, pending);
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

  for (const [episodeId, pendingJobs] of pendingByEpisode) {
    await publishEpisodeBatch(episodeId, pendingJobs, active, now, log);
  }
}

async function reconcileClaimedJob(
  job: SocialPublishJobRow,
  now: Date,
  log: (message: string) => void,
): Promise<boolean> {
  const [post] = await listSocialPostsByEpisode(job.episode_id, job.platform);
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

async function publishEpisodeBatch(
  episodeId: string,
  jobs: SocialPublishJobRow[],
  active: Record<SocialPlatform, SocialStrategyVersionRow | null>,
  now: Date,
  log: (message: string) => void,
): Promise<void> {
  const guidanceByPlatform = Object.fromEntries(
    jobs.flatMap((job) => {
      const guidance = buildStrategyGuidance(
        job.platform,
        active[job.platform]?.config,
      );
      return guidance ? [[job.platform, guidance]] : [];
    }),
  ) as Partial<Record<SocialPlatform, string>>;
  let outcomes: Awaited<ReturnType<typeof runSocialCli>>;
  try {
    outcomes = await runSocialCli(
      [
        episodeId,
        '--yes',
        '--platform',
        jobs.map((job) => job.platform).join(','),
      ],
      {
        ...(Object.keys(guidanceByPlatform).length > 0
          ? { strategyGuidanceByPlatform: guidanceByPlatform }
          : {}),
        setExitCodeOnFailure: false,
      },
    );
  } catch (error) {
    await Promise.all(
      jobs.map((job) => recordJobFailure(job, now, error, log)),
    );
    return;
  }
  for (const job of jobs) {
    await finalizePublishOutcome(job, outcomes, active[job.platform], now, log);
  }
}

async function finalizePublishOutcome(
  job: SocialPublishJobRow,
  outcomes: Awaited<ReturnType<typeof runSocialCli>>,
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
    const [post] = await listSocialPostsByEpisode(job.episode_id, job.platform);
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
): Promise<Record<SocialPlatform, SocialStrategyVersionRow | null>> {
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
  if (snapshot.pendingCount === 0) {
    log('[social-daemon] queue: no publish jobs pending.');
    return;
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
  for (const platform of SOCIAL_PLATFORMS) {
    const item = snapshot.nextByPlatform[platform];
    if (!item) continue;
    const title = item.title ? ` “${truncateTitle(item.title)}”` : '';
    log(
      `[social-daemon] next ${platform}:${title} at ${formatJst(item.nextAt)} (${formatRelative(item.nextAt, now)}; ${item.status}).`,
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
