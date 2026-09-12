import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { z } from 'zod';

import type { OperationalSignal } from '../../../shared/types.js';
import type { ControlCenterConfig } from '../../config/env.js';
import {
  consecutiveCount,
  GITHUB_HOUR_MS,
  githubCompletedRunSchema,
  githubRunEvidence,
  githubRunsEnvelopeSchema,
  githubRunTiming,
} from './github-run.js';
import { fetchJson, fetchText } from './http.js';
import {
  buildSignal,
  collectOrFail,
  errorMessage,
  sourceFailure,
  unknownSignal,
} from './signal.js';
import { findRepoRoot } from './repo-root.js';
import { staleAfterMs } from './schedule-interval.js';

const ORIGIN = { source: 'github-actions', domain: 'jobs' } as const;
const REPO = 'zapPilot/zapEngine';
const RUNS_PER_PAGE = 5;
const SELF_MONITORED_WORKFLOW = 'ops-operator.yml';

/**
 * Only the fields this adapter reads. `.github/schedules.json` is the
 * repository's inventory of everything that runs on a timer, so it also
 * carries Fly intervals and Pipedream crons; `runtime` is what narrows it to
 * the jobs GitHub can answer for.
 *
 * The schedule fields are required rather than optional because the
 * `lint schedules` gate already rejects a registry row missing either one,
 * and it also rejects a `github-actions` row that is not a cron.
 */
const scheduleEntrySchema = z.object({
  name: z.string().min(1),
  runtime: z.string(),
  entrypoint: z.string().min(1),
  schedule_kind: z.string().min(1),
  schedule: z.string().min(1),
  // Optional escape hatch for workflows whose job-level `if:` makes `skipped`
  // the normal outcome for that registered schedule.
  skipExpected: z.boolean().optional(),
});

/**
 * Rejecting an unparseable timestamp is what makes dropping the row
 * meaningful: `judge` orders runs by `Date`, and a `NaN` one would sort to
 * the end and quietly change which run counts as latest.
 */
const runSchema = githubCompletedRunSchema;

interface ScheduledWorkflow {
  /** The `schedules.json` name — what an operator calls the job. */
  name: string;
  /** The workflow file name — what the GitHub API is keyed on. */
  file: string;
  /** How long this workflow's own cadence allows it to stay silent. */
  staleAfterMs: number;
  /**
   * Set when the registry marks this workflow's `skipped` runs as the normal
   * outcome of an intentional job-level gate, not as failures.
   */
  skipExpected: boolean;
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
  registrySource?: 'local' | 'remote-main';
}): Promise<OperationalSignal[]> {
  const token = input.config.OPS_GITHUB_TOKEN;
  if (!token) {
    return [
      unknownSignal({
        ...ORIGIN,
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
  return collectOrFail(ORIGIN, input.now, async () => {
    const workflows = await readScheduledWorkflows({
      repoRoot:
        input.registrySource === 'remote-main'
          ? undefined
          : (input.repoRoot ?? findLocalRepoRoot()),
      token,
      fetchImpl,
    });
    const outcomes = await Promise.all(
      workflows.map((workflow) =>
        inspectWorkflow({ workflow, token, fetchImpl, now: input.now }),
      ),
    );

    const errors = outcomes.flatMap((outcome) =>
      outcome.failed ? [outcome.error] : [],
    );
    const scheduledSignals =
      errors.length === outcomes.length
        ? [
            sourceFailure({
              ...ORIGIN,
              error: new Error(
                `no run history readable for any of ${outcomes.length} ` +
                  `scheduled workflows: ${errorMessage(errors[0])}`,
              ),
              observedAt: input.now,
            }),
          ]
        : outcomes.map((outcome) => outcome.signal);

    return scheduledSignals;
  });
}

function findLocalRepoRoot(): string | undefined {
  try {
    const root = findRepoRoot(import.meta.dirname);
    return existsSync(join(root, '.github', 'schedules.json'))
      ? root
      : undefined;
  } catch {
    return undefined;
  }
}

async function readScheduledWorkflows(input: {
  repoRoot?: string;
  token: string;
  fetchImpl: typeof fetch;
}): Promise<ScheduledWorkflow[]> {
  const source = input.repoRoot
    ? join(input.repoRoot, '.github', 'schedules.json')
    : '.github/schedules.json on main';
  const raw = input.repoRoot
    ? await readFile(source, 'utf8')
    : await fetchText({
        label: 'GitHub schedules registry',
        url:
          `https://api.github.com/repos/${REPO}/contents/.github/` +
          'schedules.json?ref=main',
        token: input.token,
        fetchImpl: input.fetchImpl,
        headers: {
          Accept: 'application/vnd.github.raw+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });
  const entries = z.array(z.unknown()).parse(JSON.parse(raw) as unknown);
  const workflows = entries.flatMap((entry) => {
    const result = scheduleEntrySchema.safeParse(entry);
    if (!result.success || result.data.runtime !== 'github-actions') {
      return [];
    }

    const file = basename(result.data.entrypoint);
    // The always-on operator records a durable heartbeat at cycle start.
    // Reading its own completed GitHub run history from inside that cycle is
    // inherently one run late and can keep a repaired workflow red after it is
    // already alive. A synthetic skipExpected fixture remains countable so the
    // generic gated-workflow behavior stays independently covered by tests.
    if (file === SELF_MONITORED_WORKFLOW && !result.data.skipExpected) {
      return [];
    }

    return [
      {
        name: result.data.name,
        file,
        staleAfterMs: staleAfterMs({
          scheduleKind: result.data.schedule_kind,
          schedule: result.data.schedule,
        }),
        skipExpected: result.data.skipExpected ?? false,
      },
    ];
  });
  if (workflows.length === 0) {
    // Not "nothing is wrong": the inventory that drives this adapter has lost
    // its GitHub entries, and reporting zero signals would read as green.
    throw new Error(
      `${source} lists no externally monitored github-actions workflows`,
    );
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
        ...ORIGIN,
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
  const envelope = await fetchJson({
    label: `GitHub run history for ${input.workflow.file}`,
    // `event=schedule` is what makes this a reading of the cron rather than of
    // the workflow: every one of these files also carries `workflow_dispatch`,
    // so an unfiltered page lets a manual re-run reset a failure streak, a
    // manual success make a dead cron look fresh, and a manual failure slander
    // a healthy one. Manual runs are deliberately not fetched separately —
    // that would double a seven-workflow fan-out to surface a history nobody
    // pages on.
    url:
      `https://api.github.com/repos/${REPO}/actions/workflows/` +
      `${input.workflow.file}/runs?per_page=${RUNS_PER_PAGE}&event=schedule`,
    token: input.token,
    schema: githubRunsEnvelopeSchema,
    fetchImpl: input.fetchImpl,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'zapengine-control-center',
    },
  });
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
  return githubRunTiming(run);
}

function judge(
  workflow: ScheduledWorkflow,
  runs: readonly CompletedRun[],
  now: Date,
): OperationalSignal {
  const latest = runs[0];
  if (!latest) {
    return buildSignal({
      ...ORIGIN,
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
  const hoursAgo = Math.round(ageMs / GITHUB_HOUR_MS);
  const streak = failureStreak(workflow, runs);
  const conclusion = latest.conclusion ?? 'without a conclusion';
  const common = {
    ...ORIGIN,
    kind: 'workflow',
    key: workflow.file,
    evidence: {
      workflow: workflow.file,
      ...githubRunEvidence({
        failureStreak: streak,
        startedAt: latest.startedAt,
        conclusion: latest.conclusion,
      }),
    },
    observedAt: now,
    url: latest.url,
  };

  // A gated workflow whose fresh runs all skip as expected is standing by,
  // not failing. `skipExpected` must be declared explicitly in the schedule
  // registry so an unexpected skip is still treated as an operational failure.
  if (
    workflow.skipExpected &&
    latest.conclusion === 'skipped' &&
    streak === 0 &&
    ageMs <= workflow.staleAfterMs
  ) {
    return buildSignal({
      ...common,
      status: 'healthy',
      title: `${workflow.name} is standing by`,
      detail:
        `Latest scheduled run skipped ${hoursAgo}h ago, which this registry ` +
        'entry marks as an expected gated standby outcome.',
    });
  }
  if (streak === 0 && ageMs <= workflow.staleAfterMs) {
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
      `its schedule allows at most ${Math.round(
        workflow.staleAfterMs / GITHUB_HOUR_MS,
      )}h of silence.`,
  });
}

/**
 * Consecutive non-success completed runs, newest first. Anything other than
 * `success` counts: a cancelled or timed-out nightly job produced no artifact
 * either. Entries flagged `skipExpected` in `.github/schedules.json` are the
 * one exception: skipped runs drop out of the count entirely, remaining
 * transparent rather than streak-ending so failures on both sides of a skip
 * still read as consecutive.
 */
function failureStreak(
  workflow: ScheduledWorkflow,
  runs: readonly CompletedRun[],
): number {
  const countable = workflow.skipExpected
    ? runs.filter((run) => run.conclusion !== 'skipped')
    : runs;
  return consecutiveCount(countable, (run) => run.conclusion !== 'success');
}
