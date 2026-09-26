/** Pure state model for the AI Wallet "agent loop" timeline and its playback. */

export type AgentLoopStepId =
  | 'news'
  | 'analyze'
  | 'intent'
  | 'compose'
  | 'sign'
  | 'confirm'
  | 'deliver';

export type AgentLoopStepTone = 'waiting' | 'active' | 'done';

interface AgentLoopStep {
  id: AgentLoopStepId;
  label: string;
}

export const AGENT_LOOP_STEPS: readonly AgentLoopStep[] = [
  { id: 'news', label: 'News detected' },
  { id: 'analyze', label: 'Local Laya analysis' },
  { id: 'intent', label: 'Agent intent' },
  { id: 'compose', label: 'MultiBaas transaction composed' },
  { id: 'sign', label: 'Wallet signs locally' },
  { id: 'confirm', label: 'Confirmed on Base' },
  { id: 'deliver', label: 'Video delivered' },
];

/** `live` is reserved for a deposit that polling discovered on this page. */
export type AgentLoopPlaybackMode = 'replay' | 'live';

export interface AgentLoopPlayback {
  mode: AgentLoopPlaybackMode;
  /** Index of the step currently animating. */
  index: number;
}

/**
 * The deposit hash seen on the first successful activity load. `undefined`
 * means that load has not happened yet; `null` means the wallet had no
 * deposit at the time, so the first one to appear counts as new.
 */
export type DepositBaseline = { hash: string | null } | undefined;

export const AWAITING_FIRST_ACTION_DETAIL =
  'Waiting for the first on-chain action';

export function agentLoopStepTone(
  stepIndex: number,
  playback: AgentLoopPlayback | null,
  hasDeposit: boolean,
): AgentLoopStepTone {
  if (playback === null) return hasDeposit ? 'done' : 'waiting';
  if (stepIndex < playback.index) return 'done';
  return stepIndex === playback.index ? 'active' : 'waiting';
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
): string {
  if (playback?.mode === 'replay') return 'Replaying…';
  return eventTitle === null ? 'Replay last run' : `Replay ${eventTitle}`;
}
