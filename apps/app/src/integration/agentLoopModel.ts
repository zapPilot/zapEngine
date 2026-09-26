/** Pure state model for the AI Wallet "agent loop" timeline and its playback. */

import type { LayaAnalysis } from '@/integration/agentRunContext';

export type AgentLoopStepId =
  | 'news'
  | 'analyze'
  | 'action'
  | 'review'
  | 'compose'
  | 'sign'
  | 'confirm'
  | 'notify';

export type AgentLoopStepTone = 'waiting' | 'active' | 'done';

export interface AgentLoopStep {
  id: AgentLoopStepId;
  label: string;
  detail: string;
}

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

/** One decimal: Laya's output is real model output, so keep its precision. */
export function formatProbability(probability: number): string {
  return `${(probability * 100).toFixed(1)}%`;
}

export const ANALYSIS_NOT_PROVIDED = 'Not provided';

function describeAnalysis(analysis: LayaAnalysis | null): string {
  if (analysis === null)
    return `Analysis ${ANALYSIS_NOT_PROVIDED.toLowerCase()}`;
  const pressure = analysis.probabilities[analysis.pressure];
  return `Exchange hack ${formatProbability(analysis.exchangeHack)} · ${analysis.pressure} ETH pressure${pressure === undefined ? '' : ` ${formatProbability(pressure)}`}`;
}

export function agentLoopSteps(
  analysis: LayaAnalysis | null,
): readonly AgentLoopStep[] {
  return [
    {
      id: 'news',
      label: 'News in',
      detail: 'A Fed to Chain story reaches the news agent',
    },
    {
      id: 'analyze',
      label: 'Laya analyzes',
      detail: describeAnalysis(analysis),
    },
    {
      id: 'action',
      label: 'Fixed action',
      detail: 'Always exactly 1 USDC into the Spark vault, never model-chosen',
    },
    {
      id: 'review',
      label: 'Plan & Tenderly review',
      detail: 'Approve + vault deposit simulated before anything is signed',
    },
    {
      id: 'compose',
      label: 'Composed via MultiBaas',
      detail: 'Unsigned tx must match the reviewed plan byte for byte',
    },
    {
      id: 'sign',
      label: 'Signed & broadcast',
      detail: 'Local agent key signs; MultiBaas broadcasts to Base',
    },
    {
      id: 'confirm',
      label: 'Confirmed on Base',
      detail: 'Receipt and Deposit event read back from MultiBaas',
    },
    {
      id: 'notify',
      label: 'Telegram smart link',
      detail: 'Story video link and Basescan receipt sent to Telegram',
    },
  ];
}

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

export function agentLoopBadge(
  playback: AgentLoopPlayback | null,
): 'Replay' | 'Live' | null {
  if (playback === null) return null;
  return playback.mode === 'live' ? 'Live' : 'Replay';
}
