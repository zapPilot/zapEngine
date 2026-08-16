import { hostname } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import dotenv from 'dotenv';

import {
  insertSocialPostMetric,
  listSocialPostsByEpisode,
  updateSocialPostIdentity,
} from '../services/db.js';
import type { SocialPostRow } from '../types.js';
import { runSocialCli } from './cli.js';
import {
  claimSocialPublishJob,
  completeSocialPublishJob,
  enqueueSocialPublishJob,
  ensureSocialDaemonStart,
  failSocialPublishJob,
  getActiveSocialStrategies,
  getSocialStrategyById,
  latestScheduledSocialJobs,
  listDueMetricPosts,
  listMetricWindowsForPosts,
  listSocialPublishCandidates,
  type SocialMetricWindowLabel,
} from './daemon-store.js';
import { createMetricCollectors } from './metric-collectors.js';
import { buildSocialPostMetric } from './metrics.js';
import { SOCIAL_PLATFORMS, type SocialPlatform } from './platforms.js';
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

  await isolate('discover', log, () =>
    discoverAndEnqueue({
      now: input.now,
      firstStartedAt: input.firstStartedAt,
      log,
    }),
  );
  await isolate('publish', log, () => publishOneDueJob(input.now, log));
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
  const [candidates, activeStrategies, latestSchedules] = await Promise.all([
    listSocialPublishCandidates(input.firstStartedAt),
    getActiveSocialStrategies(),
    latestScheduledSocialJobs(),
  ]);
  if (candidates.length === 0) return;

  const active = activeStrategyMap(activeStrategies);
  const rollingLast = new Map<SocialPlatform, Date>();
  for (const platform of SOCIAL_PLATFORMS) {
    const latest = latestSchedules[platform];
    if (latest) rollingLast.set(platform, new Date(latest));
  }

  for (const candidate of candidates) {
    const readyAt = new Date(candidate.ready_at);
    if (Number.isNaN(readyAt.getTime())) continue;

    for (const platform of SOCIAL_PLATFORMS) {
      const strategy = active[platform];
      const previous = rollingLast.get(platform);
      let after = readyAt;
      if (previous) {
        after = new Date(previous.getTime() + 60_000);
      } else if (input.now > readyAt) {
        after = input.now;
      }
      const scheduledAt = nextPublishSlot({
        platform,
        readyAt,
        after,
        config: strategy?.config ?? defaultSocialStrategy(platform),
      });
      const inserted = await enqueueSocialPublishJob({
        episodeId: candidate.episode_id,
        platform,
        scheduledAt: scheduledAt.toISOString(),
        strategyVersionId: strategy?.id ?? null,
      });
      if (inserted) rollingLast.set(platform, scheduledAt);
    }
  }
}

async function publishOneDueJob(
  now: Date,
  log: (message: string) => void,
): Promise<void> {
  const job = await claimSocialPublishJob({ owner: OWNER, now });
  if (!job) return;

  try {
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
    });
    log(
      `[social-daemon] published ${job.platform} for ${job.episode_id} (${post.id}).`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await failSocialPublishJob({
      jobId: job.id,
      owner: OWNER,
      now,
      attemptCount: job.attempt_count,
      error: message,
    });
    log(
      `[social-daemon] ${job.platform} publish failed for ${job.episode_id}: ${message}`,
    );
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
      const collected = await collectors[post.platform](post);
      const { details, ...counts } = collected;
      if (
        Object.values(counts).every((value) => value === null) &&
        (!details || Object.keys(details).length === 0)
      ) {
        continue;
      }
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

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;
if (invokedPath === import.meta.url) {
  await runSocialDaemon();
}
