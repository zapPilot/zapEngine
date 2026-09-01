import { basename } from 'node:path';

import { z } from 'zod';

import type { OperationalSignal } from '../../../shared/types.js';
import type { ControlCenterConfig } from '../../config/env.js';
import { fetchJson } from './http.js';
import { buildSignal, errorMessage } from './signal.js';

const ORIGIN = { source: 'github-actions', domain: 'jobs' } as const;
const REPO = 'zapPilot/zapEngine';
const RUNS_PER_PAGE = 100;
const HOUR_MS = 60 * 60 * 1000;
const FAILURE_WINDOW_MS = 7 * 24 * HOUR_MS;
const FAILURE_CONCLUSIONS = new Set([
  'action_required',
  'failure',
  'stale',
  'startup_failure',
  'timed_out',
]);
const RECENT_OPERATIONAL_EVENTS = new Set([
  'push',
  'release',
  'repository_dispatch',
  'workflow_dispatch',
  'workflow_run',
]);

const isoTimestamp = z
  .string()
  .refine((value) => Number.isFinite(Date.parse(value)));

const recentRunSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  path: z.string().min(1),
  event: z.string().min(1),
  status: z.string(),
  conclusion: z.string().nullish(),
  head_branch: z.string().nullish(),
  created_at: isoTimestamp,
  run_started_at: isoTimestamp.nullish(),
  html_url: z.string().nullish(),
});

const runsEnvelopeSchema = z.object({ workflow_runs: z.array(z.unknown()) });

type RecentRun = {
  id: number;
  name: string;
  path: string;
  event: string;
  conclusion: string | null;
  branch: string | null;
  startedAt: Date;
  url: string | null;
};

/**
 * Recent main-branch Actions failures that are not the cron-health reading.
 *
 * Scheduled workflow health deliberately lives in github.ts and reads only
 * `event=schedule`; mixing manual runs into that history would let an operator
 * re-run mask a dead cron. This companion read answers the other question an
 * operator has: did a deploy, release, manual operation, or alerting workflow
 * fail recently?
 *
 * Pull-request CI is excluded by the `branch=main` query and schedule-triggered
 * latest runs are left to the scheduled collector. A later non-PR success of
 * the same workflow clears an older failure regardless of trigger.
 */
export async function collectRecentGithubFailureSignals(input: {
  config: ControlCenterConfig;
  now: Date;
  fetchImpl?: typeof fetch;
}): Promise<OperationalSignal[]> {
  const token = input.config.OPS_GITHUB_TOKEN;
  if (!token) {
    // github.ts owns the single unconfigured-token signal for this source.
    return [];
  }

  try {
    const envelope = await fetchJson({
      label: 'GitHub recent main-branch run history',
      url:
        `https://api.github.com/repos/${REPO}/actions/runs?` +
        `branch=main&per_page=${RUNS_PER_PAGE}`,
      token,
      schema: runsEnvelopeSchema,
      fetchImpl: input.fetchImpl ?? globalThis.fetch,
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'zapengine-control-center',
      },
    });

    const runs = envelope.workflow_runs
      .flatMap((row) => {
        const result = recentRunSchema.safeParse(row);
        return result.success && result.data.status === 'completed'
          ? [toRecentRun(result.data)]
          : [];
      })
      .filter(shouldConsiderRun)
      .sort(
        (left, right) => right.startedAt.getTime() - left.startedAt.getTime(),
      );

    return [...groupByWorkflow(runs).values()].flatMap((workflowRuns) => {
      const latest = workflowRuns[0];
      if (
        !latest ||
        latest.event === 'schedule' ||
        !RECENT_OPERATIONAL_EVENTS.has(latest.event) ||
        !isFailure(latest) ||
        input.now.getTime() - latest.startedAt.getTime() > FAILURE_WINDOW_MS
      ) {
        return [];
      }

      return [buildRecentFailureSignal(latest, workflowRuns, input.now)];
    });
  } catch (error) {
    return [
      buildSignal({
        ...ORIGIN,
        kind: 'recent-runs',
        key: 'repository',
        status: 'degraded',
        title: 'Recent GitHub Actions history unavailable',
        detail: errorMessage(error),
        evidence: {},
        observedAt: input.now,
      }),
    ];
  }
}

function toRecentRun(run: z.infer<typeof recentRunSchema>): RecentRun {
  return {
    id: run.id,
    name: run.name,
    path: run.path,
    event: run.event,
    conclusion: run.conclusion ?? null,
    branch: run.head_branch ?? null,
    startedAt: new Date(run.run_started_at ?? run.created_at),
    url: run.html_url ?? null,
  };
}

function shouldConsiderRun(run: RecentRun): boolean {
  return run.event === 'schedule' || RECENT_OPERATIONAL_EVENTS.has(run.event);
}

function groupByWorkflow(runs: readonly RecentRun[]): Map<string, RecentRun[]> {
  const grouped = new Map<string, RecentRun[]>();
  for (const run of runs) {
    const existing = grouped.get(run.path);
    if (existing) {
      existing.push(run);
    } else {
      grouped.set(run.path, [run]);
    }
  }
  return grouped;
}

function buildRecentFailureSignal(
  latest: RecentRun,
  runs: readonly RecentRun[],
  now: Date,
): OperationalSignal {
  const workflow = basename(latest.path);
  const streak = failureStreak(runs);
  const hoursAgo = Math.max(
    0,
    Math.round((now.getTime() - latest.startedAt.getTime()) / HOUR_MS),
  );
  const alertingBlindSpot = workflow === 'cron-failure-alert.yml';
  const status = alertingBlindSpot || streak >= 2 ? 'critical' : 'degraded';
  const conclusion = latest.conclusion ?? 'without a conclusion';
  const branch = latest.branch ?? 'unknown branch';

  return buildSignal({
    ...ORIGIN,
    kind: 'recent-failure',
    key: workflow,
    status,
    title:
      streak >= 2
        ? `${latest.name} failed ${streak} recent operational runs in a row`
        : `${latest.name} recent run failed`,
    detail:
      `Latest ${latest.event} run on ${branch} ended ${conclusion} ` +
      `${hoursAgo}h ago.` +
      (alertingBlindSpot
        ? ' The cron failure notifier itself is unavailable, so this is an alerting blind spot.'
        : ''),
    evidence: {
      workflow,
      workflowPath: latest.path,
      workflowName: latest.name,
      runId: latest.id,
      event: latest.event,
      branch: latest.branch,
      failureStreak: streak,
      lastRunAt: latest.startedAt.toISOString(),
      lastConclusion: latest.conclusion,
    },
    observedAt: now,
    url: latest.url,
  });
}

function failureStreak(runs: readonly RecentRun[]): number {
  let streak = 0;
  for (const run of runs) {
    if (!isFailure(run)) {
      break;
    }
    streak += 1;
  }
  return streak;
}

function isFailure(run: RecentRun): boolean {
  return run.conclusion !== null && FAILURE_CONCLUSIONS.has(run.conclusion);
}
