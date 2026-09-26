import {
  AGENT_RUN_STEP_IDS,
  type AgentRunEntry,
  type AgentRunStatus,
  type AgentRunStep,
  type AgentRunStepId,
} from '@zapengine/types/api';

import type { DemoOutcome, DemoProgress } from './demo.js';

// The timeline status `serve` reports for the local AI Wallet. Every function
// is total over its typed input: a display bug here must never throw into the
// run that feeds it.

export type RunResult = { outcome: DemoOutcome } | { error: string };

const mapSteps = (
  steps: AgentRunStatus['steps'],
  update: (step: AgentRunStep, index: number) => AgentRunStep,
): AgentRunStatus['steps'] => {
  const next = { ...steps };
  AGENT_RUN_STEP_IDS.forEach((id, index) => {
    next[id] = update(steps[id], index);
  });
  return next;
};

export function idleRunStatus(episode: string): AgentRunStatus {
  const waiting = (): AgentRunStep => ({ state: 'waiting', entries: [] });
  return {
    state: 'idle',
    episode,
    startedAt: null,
    finishedAt: null,
    error: null,
    transaction: null,
    depositHash: null,
    steps: Object.fromEntries(
      AGENT_RUN_STEP_IDS.map((id) => [id, waiting()]),
    ) as Record<AgentRunStepId, AgentRunStep>,
  };
}

// `news` is active from the start, so a failure before the first event (the
// MultiBaas status check) still marks a step.
export function startRun(status: AgentRunStatus, now: number): AgentRunStatus {
  const idle = idleRunStatus(status.episode);
  return {
    ...idle,
    state: 'running',
    startedAt: now,
    steps: {
      ...idle.steps,
      news: {
        state: 'active',
        entries: [{ text: 'Starting run…', link: null }],
      },
    },
  };
}

/**
 * Earlier steps are done, the event's step is active, later steps wait again
 * with their entries kept, so the next transaction replays steps 4–6.
 */
export function applyProgress(
  status: AgentRunStatus,
  event: DemoProgress,
): AgentRunStatus {
  if (status.state !== 'running') return status;
  const target = AGENT_RUN_STEP_IDS.indexOf(event.step);
  const transaction = event.transaction;
  return {
    ...status,
    // Copied field by field: the status is served under a strict schema.
    transaction:
      transaction === undefined
        ? status.transaction
        : {
            kind: transaction.kind,
            index: transaction.index,
            total: transaction.total,
          },
    depositHash:
      transaction?.kind === 'deposit' && event.hash !== undefined
        ? event.hash
        : status.depositHash,
    steps: mapSteps(status.steps, (step, index) => ({
      state: stateAround(index, target),
      entries:
        index === target ? [...step.entries, toEntry(event)] : step.entries,
    })),
  };
}

function stateAround(index: number, target: number): AgentRunStep['state'] {
  if (index < target) return 'done';
  return index === target ? 'active' : 'waiting';
}

export function finishRun(
  status: AgentRunStatus,
  result: RunResult,
  now: number,
): AgentRunStatus {
  if (status.state !== 'running') return status;
  if ('error' in result) return failRun(status, result.error, now);
  if (result.outcome === 'confirmed')
    return {
      ...status,
      state: 'succeeded',
      finishedAt: now,
      steps: mapSteps(status.steps, (step) => ({ ...step, state: 'done' })),
    };
  const active = AGENT_RUN_STEP_IDS.find(
    (id) => status.steps[id].state === 'active',
  );
  return failRun(
    status,
    outcomeError(result.outcome, active && status.steps[active]),
    now,
  );
}

function failRun(
  status: AgentRunStatus,
  error: string,
  now: number,
): AgentRunStatus {
  return {
    ...status,
    state: 'failed',
    finishedAt: now,
    error,
    steps: mapSteps(status.steps, (step) =>
      step.state === 'active' ? { ...step, state: 'failed' } : step,
    ),
  };
}

function outcomeError(
  outcome: Exclude<DemoOutcome, 'confirmed'>,
  active: AgentRunStep | undefined,
): string {
  switch (outcome) {
    // The demo's last line on a block is "Blocked: <reason>. Nothing was signed."
    case 'blocked':
      return active?.entries.at(-1)?.text ?? 'Blocked. Nothing was signed.';
    case 'dry-run':
      return 'Dry-run stopped before signing; serve always executes';
    case 'replayed':
      return 'Replay sent no transaction; serve always executes';
  }
}

// Links must be https to be shown; anything else keeps its text only.
function toEntry(event: DemoProgress): AgentRunEntry {
  const link = event.link;
  return {
    text: event.text,
    link:
      link !== undefined && isHttps(link.url)
        ? { label: link.label, url: link.url }
        : null,
  };
}

function isHttps(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}
