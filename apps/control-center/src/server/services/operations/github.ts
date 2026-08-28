import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { z } from 'zod';

import type { OperationalSignal } from '../../../shared/types.js';
import type { ControlCenterConfig } from '../../config/env.js';
import {
  buildSignal,
  errorMessage,
  sourceFailure,
  unknownSignal,
} from './signal.js';
import { findRepoRoot } from './repo-root.js';

const SOURCE = 'github-actions' as const;
const DOMAIN = 'jobs' as const;
const REPO = 'zapPilot/zapEngine';
const RUNS_PER_PAGE = 5;
const REQUEST_TIMEOUT_MS = 10_000;
const HOUR_MS = 60 * 60 * 1000;
/**
 * Every workflow this adapter watches runs at least daily, so two days of
 * silence is not a slow night: the cron itself has stopped firing.
 */
const STALE_AFTER_MS = 48 * HOUR_MS;

/**
 * Only the fields this adapter reads. `.github/schedules.json` is the
 * repository's inventory of everything that runs on a timer, so it also
 * carries Fly intervals and Pipedream crons; `runtime` is what narrows it to
 * the jobs GitHub can answer for.
 */
const scheduleEntrySchema = z.object({
  name: z.string().min(1),
  runtime: z.string(),
  entrypoint: z.string().min(1),
});

/**
 * Rejecting an unparseable timestamp is what makes dropping the row
 * meaningful: `judge` orders runs by `Date`, and a `NaN` one would sort to
 * the end and quietly change which run counts as latest.
 */
const isoTimestamp = z
  .string()
  .refine((value) => Number.isFinite(Date.parse(value)));

const runSchema = z.object({
  status: z.string(),
  conclusion: z.string().nullish(),
  created_at: isoTimestamp,
  run_started_at: isoTimestamp.nullish(),
  html_url: z.string().nullish(),
});

const runsEnvelopeSchema = z.object({ workflow_runs: z.array(z.unknown()) });

interface ScheduledWorkflow {
  /** The `schedules.json` name — what an operator calls the job. */
  name: string;
  /** The workflow file name — what the GitHub API is keyed on. */
  file: string;
}

interface CompletedRun {
  conclusion: string | null;
  startedAt: Date;
  url: string | null;
}

type WorkflowOutcome =
  | { failed: false; signal: OperationalSignal }
  | { failed: true; signal: OperationalSignal; error: unknown };

/**
 * Scheduled-workflow health for the `jobs` domain.
 *
 * Failure attribution follows one rule: a request that fails for a single
 * workflow degrades that workflow, and only a failure shared by every
 * workflow becomes a `sourceFailure`. A renamed or deleted workflow file
 * 404s on its own and is a real per-job finding; a revoked token or a GitHub
 * outage fails all of them identically and is one adapter problem, not seven
 * job problems crowding the top of the priority list.
 */
export async function collectGithubSignals(input: {
  config: ControlCenterConfig;
  now: Date;
  fetchImpl?: typeof fetch;
  repoRoot?: string;
}): Promise<OperationalSignal[]> {
  const token = input.config.OPS_GITHUB_TOKEN;
  if (!token) {
    return [
      unknownSignal({
        source: SOURCE,
        domain: DOMAIN,
        key: 'token',
        title: 'GitHub Actions health not configured',
        detail:
          'OPS_GITHUB_TOKEN is unset. Anonymous api.github.com is capped at ' +
          '60 requests per hour per IP, so nothing is requested rather than ' +
          'filling the jobs domain with rate-limit failures.',
        observedAt: input.now,
      }),
    ];
  }

  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  try {
    const workflows = await readScheduledWorkflows(
      input.repoRoot ?? findRepoRoot(import.meta.dirname),
    );
    const outcomes = await Promise.all(
      workflows.map((workflow) =>
        inspectWorkflow({ workflow, token, fetchImpl, now: input.now }),
      ),
    );

    const errors = outcomes.flatMap((outcome) =>
      outcome.failed ? [outcome.error] : [],
    );
    if (errors.length === outcomes.length) {
      return [
        sourceFailure({
          source: SOURCE,
          domain: DOMAIN,
          error: new Error(
            `no run history readable for any of ${outcomes.length} ` +
              `scheduled workflows: ${errorMessage(errors[0])}`,
          ),
          observedAt: input.now,
        }),
      ];
    }
    return outcomes.map((outcome) => outcome.signal);
  } catch (error) {
    return [
      sourceFailure({
        source: SOURCE,
        domain: DOMAIN,
        error,
        observedAt: input.now,
      }),
    ];
  }
}

async function readScheduledWorkflows(
  repoRoot: string,
): Promise<ScheduledWorkflow[]> {
  const path = join(repoRoot, '.github', 'schedules.json');
  const entries = z
    .array(z.unknown())
    .parse(JSON.parse(await readFile(path, 'utf8')) as unknown);
  const workflows = entries.flatMap((entry) => {
    const result = scheduleEntrySchema.safeParse(entry);
    return result.success && result.data.runtime === 'github-actions'
      ? [{ name: result.data.name, file: basename(result.data.entrypoint) }]
      : [];
  });
  if (workflows.length === 0) {
    // Not "nothing is wrong": the inventory that drives this adapter has lost
    // its GitHub entries, and reporting zero signals would read as green.
    throw new Error(`${path} lists no github-actions workflows`);
  }
  return workflows;
}

async function inspectWorkflow(input: {
  workflow: ScheduledWorkflow;
  token: string;
  fetchImpl: typeof fetch;
  now: Date;
}): Promise<WorkflowOutcome> {
  try {
    const runs = await fetchCompletedRuns(input);
    return { failed: false, signal: judge(input.workflow, runs, input.now) };
  } catch (error) {
    return {
      failed: true,
      error,
      // Same fingerprint as a healthy reading of this workflow: losing the
      // reading is a new status for one condition, not a new condition.
      signal: buildSignal({
        source: SOURCE,
        domain: DOMAIN,
        kind: 'workflow',
        key: input.workflow.file,
        status: 'degraded',
        title: `${input.workflow.name} run history unavailable`,
        detail: errorMessage(error),
        evidence: { workflow: input.workflow.file },
        observedAt: input.now,
      }),
    };
  }
}

async function fetchCompletedRuns(input: {
  workflow: ScheduledWorkflow;
  token: string;
  fetchImpl: typeof fetch;
}): Promise<CompletedRun[]> {
  const response = await input.fetchImpl(
    `https://api.github.com/repos/${REPO}/actions/workflows/` +
      `${input.workflow.file}/runs?per_page=${RUNS_PER_PAGE}`,
    {
      headers: {
        Authorization: `Bearer ${input.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'zapengine-control-center',
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    },
  );
  if (!response.ok) {
    throw new Error(
      `GitHub returned ${response.status} for ${input.workflow.file}`,
    );
  }

  const envelope = runsEnvelopeSchema.parse(await response.json());
  return (
    envelope.workflow_runs
      .flatMap((row) => {
        // A run that fails to parse is dropped rather than failing the whole
        // workflow: the rows beside it still answer the only question asked
        // here, which is whether the recent runs succeeded.
        const result = runSchema.safeParse(row);
        return result.success && result.data.status === 'completed'
          ? [toCompletedRun(result.data)]
          : [];
      })
      // The API happens to return newest first; sorting locally means a
      // change to that default cannot silently invert the failure streak.
      .sort(
        (left, right) => right.startedAt.getTime() - left.startedAt.getTime(),
      )
  );
}

function toCompletedRun(run: z.infer<typeof runSchema>): CompletedRun {
  return {
    conclusion: run.conclusion ?? null,
    startedAt: new Date(run.run_started_at ?? run.created_at),
    url: run.html_url ?? null,
  };
}

function judge(
  workflow: ScheduledWorkflow,
  runs: readonly CompletedRun[],
  now: Date,
): OperationalSignal {
  const latest = runs[0];
  if (!latest) {
    return buildSignal({
      source: SOURCE,
      domain: DOMAIN,
      kind: 'workflow',
      key: workflow.file,
      status: 'degraded',
      title: `${workflow.name} has never completed a run`,
      detail: 'GitHub reports no completed run for this workflow.',
      evidence: {
        workflow: workflow.file,
        failureStreak: 0,
        lastRunAt: null,
        lastConclusion: null,
      },
      observedAt: now,
    });
  }

  const ageMs = now.getTime() - latest.startedAt.getTime();
  const hoursAgo = Math.round(ageMs / HOUR_MS);
  const streak = failureStreak(runs);
  const conclusion = latest.conclusion ?? 'without a conclusion';
  const common = {
    source: SOURCE,
    domain: DOMAIN,
    kind: 'workflow',
    key: workflow.file,
    evidence: {
      workflow: workflow.file,
      failureStreak: streak,
      lastRunAt: latest.startedAt.toISOString(),
      lastConclusion: latest.conclusion,
    },
    observedAt: now,
    url: latest.url,
  };

  if (streak === 0 && ageMs <= STALE_AFTER_MS) {
    return buildSignal({
      ...common,
      status: 'healthy',
      title: `${workflow.name} ran successfully`,
      detail: `Latest completed run succeeded ${hoursAgo}h ago.`,
    });
  }
  if (streak >= 2) {
    return buildSignal({
      ...common,
      status: 'critical',
      title: `${workflow.name} failed ${streak} runs in a row`,
      detail:
        `${streak} consecutive completed runs failed; the latest ended ` +
        `${conclusion} ${hoursAgo}h ago.`,
    });
  }
  if (streak === 1) {
    return buildSignal({
      ...common,
      status: 'degraded',
      title: `${workflow.name} last run failed`,
      detail:
        `Latest completed run ended ${conclusion} ${hoursAgo}h ago; the run ` +
        'before it succeeded.',
    });
  }
  return buildSignal({
    ...common,
    status: 'degraded',
    title: `${workflow.name} has not run in ${hoursAgo}h`,
    detail:
      `Latest completed run succeeded, but it started ${hoursAgo}h ago and ` +
      'this workflow is scheduled to run at least daily.',
  });
}

/**
 * Consecutive non-success completed runs, newest first. Anything other than
 * `success` counts: a cancelled or timed-out nightly job produced no artifact
 * either, and none of these workflows carry a job-level `if:` that would make
 * `skipped` a normal outcome.
 */
function failureStreak(runs: readonly CompletedRun[]): number {
  let streak = 0;
  for (const run of runs) {
    if (run.conclusion === 'success') {
      break;
    }
    streak += 1;
  }
  return streak;
}
