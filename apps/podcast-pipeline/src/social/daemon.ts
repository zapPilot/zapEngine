import { hostname } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';

import {
  insertSocialPostMetric,
  listSocialPostsByEpisode,
  updateSocialPostIdentity,
} from '../services/db.js';
import type { SocialPostRow } from '../types.js';
import { runSocialCli } from './cli.js';
import {
  alignPendingSocialPublishSchedules,
  claimSocialPublishBatch,
  completeSocialPublishJob,
  enqueueSocialPublishJob,
  ensureSocialDaemonStart,
  failSocialPublishJob,
  getActiveSocialStrategies,
  getSocialQueueSnapshot,
  getSocialStrategyById,
  latestPendingSocialPublishSchedule,
  listDueMetricPosts,
  listMetricWindowsForPosts,
  listSocialPublishCandidates,
  listUnfinishedSocialPublishJobs,
  reconcileSocialPublishJob,
  type SocialMetricWindowLabel,
} from './daemon-store.js';
import { isMainModule } from './is-main-module.js';
import { createMetricCollectors } from './metric-collectors.js';
import { buildSocialPostMetric, collectPostMetrics } from './metrics.js';
import { SOCIAL_PLATFORMS } from './platforms.js';
import {
  activeStrategyMap,
  buildStrategyGuidance,
  defaultSocialStrategy,
  nextPublishSlot,
  refreshSocialStrategies,
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
  const [candidates, activeStrategies, latestSchedule] = await Promise.all([
    listSocialPublishCandidates(input.firstStartedAt),
    getActiveSocialStrategies(),
    latestPendingSocialPublishSchedule(),
  ]);
  if (candidates.length === 0) return;

  const active = activeStrategyMap(activeStrategies);
  let rollingLast = latestSchedule ? new Date(latestSchedule) : null;

  for (const candidate of candidates) {
    const readyAt = new Date(candidate.ready_at);
    if (Number.isNaN(readyAt.getTime())) continue;
    let discoveredLogged = false;
    let after = readyAt;
    if (rollingLast) {
      after = new Date(rollingLast.getTime() + 60_000);
    } else if (input.now > readyAt) {
      after = input.now;
    }
    const scheduledAt = nextPublishSlot({
      platform: 'x',
      readyAt,
      after,
      config: defaultSocialStrategy(),
    });
    let insertedAny = false;

    for (const platform of SOCIAL_PLATFORMS) {
      const strategy = active[platform];
      const inserted = await enqueueSocialPublishJob({
        episodeId: candidate.episode_id,
        platform,
        scheduledAt: scheduledAt.toISOString(),
        strategyVersionId: strategy?.id ?? null,
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
  let firstError: unknown = null;
  for (const job of jobs) {
    try {
      const [post] = await listSocialPostsByEpisode(
        job.episode_id,
        job.platform,
      );
      if (!post) continue;
      const reconciled = await reconcileSocialPublishJob({
        jobId: job.id,
        socialPostId: post.id,
        completedAt: now,
      });
      if (!reconciled) continue;
      log(
        `[social-daemon] reconciled ${job.platform} for ${job.episode_id} - already published (${post.id}).`,
      );
    } catch (error) {
      firstError ??= error;
    }
  }
  if (firstError) {
    throw firstError instanceof Error
      ? firstError
      : new Error(String(firstError));
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
      `[social-daemon] failed to persist ${input.platform} publish failure for ${input.episodeId}: ${persistenceError instanceof Error ? persistenceError.message : String(persistenceError)}`,
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
  for (const job of jobs) {
    try {
      const [alreadyPublished] = await listSocialPostsByEpisode(
        job.episode_id,
        job.platform,
      );
      if (alreadyPublished) {
        await completeSocialPublishJob({
          jobId: job.id,
          owner: OWNER,
          completedAt: now,
          socialPostId: alreadyPublished.id,
        });
        log(
          `[social-daemon] reconciled ${job.platform} for ${job.episode_id} - already published (${alreadyPublished.id}).`,
        );
        continue;
      }

      const strategy = job.strategy_version_id
        ? await getSocialStrategyById(job.strategy_version_id)
        : null;
      const guidance = buildStrategyGuidance(job.platform, strategy?.config);
      const outcomes = await runSocialCli(
        [job.episode_id, '--yes', '--platform', job.platform],
        {
          ...(guidance ? { strategyGuidance: guidance } : {}),
          setExitCodeOnFailure: false,
        },
      );
      const outcome = outcomes.find((row) => row.platform === job.platform);
      if (!outcome || outcome.status === 'failed') {
        throw outcome?.error ?? new Error(`${job.platform} did not publish.`);
      }
      if (outcome.stateError) throw outcome.stateError;
      if (outcome.recordError) throw outcome.recordError;

      const [post] = await listSocialPostsByEpisode(
        job.episode_id,
        job.platform,
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
      });
      log(
        `[social-daemon] published ${job.platform} for ${job.episode_id} (${post.id}).`,
      );
    } catch (error) {
      await persistPublishFailure({
        jobId: job.id,
        episodeId: job.episode_id,
        platform: job.platform,
        attemptCount: job.attempt_count,
        now,
        message: error instanceof Error ? error.message : String(error),
        log,
      });
    }
  }
}

export async function collectDueMetricWindows(
  now: Date,
  log: (message: string) => void = () => void 0,
): Promise<number> {
  const cutoff = new Date(
    now.getTime() - METRIC_LOOKBACK_DAYS * 24 * 60 * 60_000,
  ).toISOString();
  const posts = await listDueMetricPosts(cutoff);
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
  const collectors = createMetricCollectors({
    onRednoteIdentity: async ({ post, platformPostId, postUrl }) => {
      await updateSocialPostIdentity({ id: post.id, platformPostId, postUrl });
    },
  });

  let inserted = 0;
  for (const post of posts) {
    const window = earliestDueWindow(post, now, completed);
    if (!window) continue;

    try {
      const collected = await collectPostMetrics(
        collectors[post.platform],
        post,
      );
      if (!collected) continue;
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
        `[social-daemon] metric collection failed for ${post.platform} ${post.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return inserted;
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
    log(
      `[social-daemon] ${label} failed: ${error instanceof Error ? error.message : String(error)}`,
    );
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

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

if (isMainModule(import.meta.url)) {
  await runSocialDaemon();
}
