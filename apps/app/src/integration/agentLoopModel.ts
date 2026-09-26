/** Pure state model for the AI Wallet "agent loop" timeline and its playback. */
import {
  AGENT_RUN_STEP_IDS,
  type AgentRunStatus,
  type AgentRunStepId,
} from '@zapengine/types/api';

export type AgentLoopStepId = AgentRunStepId;

export type AgentLoopStepTone = 'waiting' | 'active' | 'done' | 'failed';

interface AgentLoopStep {
  id: AgentLoopStepId;
  label: string;
  explanation: string;
}

const STEP_COPY: Readonly<Record<AgentLoopStepId, Omit<AgentLoopStep, 'id'>>> =
  {
    news: {
      label: 'News detected',
      explanation:
        'The agent reads one news story from the podcast API. The story is context; it never supplies an address or an amount.',
    },
    analyze: {
      label: 'Local Laya analysis',
      explanation:
        'A local Laya model scores the story (exchange-hack likelihood, ETH price pressure) for people to read. It never gates or shapes the trade, and the run continues if it is down.',
    },
    intent: {
      label: 'Agent intent',
      explanation:
        'The action is fixed in code: rotate 0.0001 Clearstar Core ETH shares into the Spark USDC vault. plan-orchestration builds the plan and simulates it on Tenderly, and a guard pins every chain, contract, amount and receiver before anything is signed.',
    },
    compose: {
      label: 'MultiBaas composed · LI.FI swap routed',
      explanation:
        'Each transaction runs steps 4–6 in turn. MultiBaas composes the approve, redeem and deposit calls, which must match the reviewed plan byte for byte. The LI.FI swap arrives as finished calldata from the quote and is signed unchanged.',
    },
    sign: {
      label: 'Wallet signs locally',
      explanation:
        "The agent's isolated key signs on this machine after re-checking the nonce, the guard and gas bounds. The signed transaction is broadcast through MultiBaas.",
    },
    confirm: {
      label: 'Confirmed on Base',
      explanation:
        'MultiBaas returns the receipt. The next transaction is composed only once MultiBaas reads the new state, and the final deposit is also looked up in the MultiBaas event index.',
    },
    deliver: {
      label: 'Video delivered',
      explanation:
        'The agent reads its new position with MultiBaas view calls, then sends the story video link to Telegram.',
    },
  };

export const AGENT_LOOP_STEPS: readonly AgentLoopStep[] =
  AGENT_RUN_STEP_IDS.map((id) => ({ id, ...STEP_COPY[id] }));

/** `live` is reserved for a deposit that polling discovered on this page. */
export type AgentLoopPlaybackMode = 'replay' | 'live';

export interface AgentLoopPlayback {
  mode: AgentLoopPlaybackMode;
  /** Index of the step currently animating. */
  index: number;
}

/** What the timeline is showing; only a local run has real progress. */
export type AgentLoopSource = 'run' | 'replay' | 'live' | 'idle';

/**
 * The deposit hash seen on the first successful activity load. `undefined`
 * means that load has not happened yet; `null` means the wallet had no
 * deposit at the time, so the first one to appear counts as new.
 */
export type DepositBaseline = { hash: string | null } | undefined;

export const AWAITING_FIRST_ACTION_DETAIL =
  'Waiting for the first on-chain action';

const TRANSACTION_STEPS: ReadonlySet<AgentLoopStepId> = new Set([
  'compose',
  'sign',
  'confirm',
]);

export function isRunInProgress(run: AgentRunStatus | null): boolean {
  return run?.state === 'running';
}

/** A run in progress beats a replay, which beats a finished run's result. */
export function timelineTones({
  run,
  playback,
  hasDeposit,
}: {
  run: AgentRunStatus | null;
  playback: AgentLoopPlayback | null;
  hasDeposit: boolean;
}): { tones: AgentLoopStepTone[]; source: AgentLoopSource } {
  if (run?.state === 'running') {
    return { tones: runTones(run), source: 'run' };
  }
  if (playback?.mode === 'replay') {
    return { tones: playbackTones(playback), source: 'replay' };
  }
  if (run !== null && run.state !== 'idle') {
    return { tones: runTones(run), source: 'run' };
  }
  if (playback !== null) {
    return { tones: playbackTones(playback), source: 'live' };
  }
  return {
    tones: AGENT_LOOP_STEPS.map(() => (hasDeposit ? 'done' : 'waiting')),
    source: 'idle',
  };
}

function runTones(run: AgentRunStatus): AgentLoopStepTone[] {
  return AGENT_LOOP_STEPS.map((step) => run.steps[step.id].state);
}

function playbackTones(playback: AgentLoopPlayback): AgentLoopStepTone[] {
  return AGENT_LOOP_STEPS.map((_, index) => {
    if (index < playback.index) return 'done';
    return index === playback.index ? 'active' : 'waiting';
  });
}

/**
 * The one line under an active or failed step: its latest entry, or the
 * run's error once it failed. Steps 4–6 name the transaction they are on.
 */
export function stepLiveLine(
  run: AgentRunStatus,
  stepId: AgentLoopStepId,
): string | null {
  const step = run.steps[stepId];
  if (step.state !== 'active' && step.state !== 'failed') return null;
  const latest = step.entries.at(-1)?.text ?? null;
  const text = step.state === 'failed' ? (run.error ?? latest) : latest;
  if (text === null) return null;
  const transaction = run.transaction;
  if (transaction === null || !TRANSACTION_STEPS.has(stepId)) return text;
  return `Tx ${transaction.index}/${transaction.total} · ${transaction.kind} — ${text}`;
}

/** Returns `null` once the last step has had its turn. */
export function advanceAgentLoopPlayback(
  playback: AgentLoopPlayback,
  stepCount: number,
): AgentLoopPlayback | null {
  const next = playback.index + 1;
  return next >= stepCount ? null : { ...playback, index: next };
}

export function isNewDeposit(
  baseline: DepositBaseline,
  latestHash: string | null,
): boolean {
  return (
    baseline !== undefined &&
    latestHash !== null &&
    latestHash !== baseline.hash
  );
}

export function replayButtonLabel(
  playback: AgentLoopPlayback | null,
  eventTitle: string | null,
  runInProgress: boolean,
): string {
  if (playback?.mode === 'replay' && !runInProgress) return 'Replaying…';
  return eventTitle === null ? 'Replay last run' : `Replay ${eventTitle}`;
}
