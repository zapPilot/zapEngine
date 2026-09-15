import { hlpStepFromPlan } from '@zapengine/app-core/lib/wallet/depositWizardMachine';
import type {
  DepositPlan,
  DepositReviewGroup,
  HlpSpotDepositPlan,
  PlanOrchestrationDepositReviewResponse,
  ReviewedDepositPlan,
} from '@zapengine/types/api';
import { formatUnits } from 'viem';

import type { ReviewedBatchProgress } from '@/integration/useInvestExecution';
import type { HlpProgressInput } from '@/integration/hlpProgressModel';
import {
  hlpRouteLabel,
  type StageDraft,
} from '@/integration/investTargetsModel';
import {
  formatGmxExecutionFee,
  formatPlanGas,
} from '@/integration/planPreviewFormatters';
import { isStrategyDepositPlan } from '@/integration/simulationPreviewModel';
import { formatOr } from '@/lib/format';

/** A review that can no longer be handed to the wallet. */
export function reviewGroupBlocked(
  group: DepositReviewGroup,
  nowMs: number,
): boolean {
  return (
    group.blocked ||
    !group.executionAllowed ||
    group.status === 'failed' ||
    group.expiresAt <= nowMs
  );
}

/** Every hash the wallet executor re-checks before signing. */
export function sameReviewFingerprints(
  left: DepositReviewGroup,
  right: DepositReviewGroup,
): boolean {
  return (
    left.groupFingerprint === right.groupFingerprint &&
    left.batchFingerprint === right.batchFingerprint &&
    left.expectedSimulationFingerprint ===
      right.expectedSimulationFingerprint &&
    left.expectedRiskHash === right.expectedRiskHash
  );
}

/** The risk acknowledgement a warning review demands, spread into a submit. */
export function riskAcknowledgement(
  group: DepositReviewGroup,
): { acknowledgedRiskHash: string } | Record<string, never> {
  return group.requiresRiskAcknowledgement
    ? { acknowledgedRiskHash: group.expectedRiskHash }
    : {};
}

/**
 * A chain batch is always one reviewed batch on its own source chain, so the
 * response carries exactly one group. Strategy plans (multi-group) belong to
 * the retired combined flow and are rejected here rather than guessed at.
 */
export function resolveStageReviewGroup(
  response: PlanOrchestrationDepositReviewResponse,
): DepositReviewGroup | null {
  if (isStrategyDepositPlan(response.plan)) return null;
  return response.reviews[`chain-${response.plan.sourceChainId}`] ?? null;
}

/** Restart the expiry ticker whenever any group's deadline moves. */
export function reviewExpiryKey(groups: readonly DepositReviewGroup[]): string {
  return groups.map((group) => `${group.groupId}:${group.expiresAt}`).join('|');
}

export type QueueTone = 'waiting' | 'active' | 'done' | 'failed';

export function queueTone(params: {
  index: number;
  currentIndex: number;
  phase: ReviewedBatchProgress['phase'] | undefined;
}): QueueTone {
  if (params.index < params.currentIndex) return 'done';
  if (params.index > params.currentIndex) return 'waiting';
  if (params.phase === 'failed') return 'failed';
  if (params.phase === 'checkpoint' || params.phase === 'complete') {
    return 'done';
  }
  return 'active';
}

export interface StageSummaryRow {
  label: string;
  value: string;
}

function asDepositPlan(
  plan: ReviewedDepositPlan | undefined,
): DepositPlan | undefined {
  if (!plan || isStrategyDepositPlan(plan)) return undefined;
  return plan;
}

function usd6Label(value: string | undefined): string {
  return formatOr(value, (raw) => `${formatUnits(BigInt(raw), 6)} USDC`);
}

function tokenAmountLabel(draft: StageDraft): string {
  const amount = formatUnits(
    BigInt(draft.fromAmount),
    draft.sourceToken.decimals,
  );
  return `${amount} ${draft.sourceToken.symbol}`;
}

function compactAddress(value: string | undefined): string {
  return formatOr(value, (raw) => `${raw.slice(0, 8)}…${raw.slice(-6)}`);
}

/**
 * Human-readable summary for one destination inside a reviewed batch. HLP adds
 * the disclosures the vault itself imposes — the minimum, the escrow address,
 * and the withdrawal lock that starts at the latest deposit.
 *
 * `plan` is the whole merged batch, so every row here reads only the parts that
 * belong to this position: GMX keeper fees come from the calls that carry an
 * execution fee, and the HLP rows from the HyperCore follow-up and its bridge
 * leg. Batch-wide totals belong to `batchSummaryRows`.
 */
export function positionSummaryRows(params: {
  draft: StageDraft;
  plan: ReviewedDepositPlan | undefined;
}): StageSummaryRow[] {
  const plan = asDepositPlan(params.plan);
  const rows: StageSummaryRow[] = [
    { label: 'Funding', value: tokenAmountLabel(params.draft) },
  ];

  if (params.draft.positionId === 'gmx-arbitrum') {
    rows.push({
      label: 'Keeper fees',
      value: formatGmxExecutionFee(plan?.calls),
    });
  }

  if (params.draft.positionId === 'hlp') {
    const step = plan ? hlpStepFromPlan(plan) : null;
    const bridgeLeg = plan?.legs.find(
      (leg) => leg.kind === 'bridge' && leg.protocol === 'hyperliquid',
    );
    rows.push(
      {
        label: 'Route',
        value: hlpRouteLabel(params.draft.sourceToken, params.draft.ingress),
      },
      {
        label: 'Expected received',
        value: usd6Label(bridgeLeg?.toAmountMin ?? step?.expectedUsd),
      },
      { label: 'HLP minimum', value: usd6Label(step?.minDepositUsd) },
      {
        label: 'Official HLP vault',
        value: compactAddress(step?.action.vaultAddress),
      },
      {
        label: 'Withdrawal lock',
        value: step ? `${step.lockupDays} days after deposit` : '—',
      },
    );
  }

  return rows;
}

/** Totals for the one wallet batch every position in it shares. */
export function batchSummaryRows(
  plan: ReviewedDepositPlan | undefined,
): StageSummaryRow[] {
  const depositPlan = asDepositPlan(plan);
  const transactionCount =
    (depositPlan?.approvals.length ?? 0) + (depositPlan?.calls.length ?? 0);
  return [
    { label: 'Transactions', value: String(transactionCount) },
    { label: 'Source gas', value: formatPlanGas(depositPlan?.totalGasUsd) },
  ];
}

/**
 * Map the reviewed-queue state of the HLP batch onto the shared HLP progress
 * model, so the unified progress screen renders the same rows the standalone
 * HLP flow did.
 */
export function hlpStageProgressInput({
  hlpPlan,
  spotPlan,
  ...rest
}: Omit<HlpProgressInput, 'hasExactPlan' | 'hasHlpStep'> & {
  /** The reviewed HLP plan once its batch has landed, null before that. */
  hlpPlan: DepositPlan | null;
  /** The HyperCore-funded plan, which carries its own step and needs no batch. */
  spotPlan: HlpSpotDepositPlan | null;
}): HlpProgressInput {
  if (spotPlan) return { ...rest, hasExactPlan: true, hasHlpStep: true };
  return {
    ...rest,
    hasExactPlan: hlpPlan !== null,
    hasHlpStep: hlpPlan ? hlpStepFromPlan(hlpPlan) !== null : false,
  };
}

/** Completion line for the unified done card. */
export function investDoneStatusLabel(params: {
  drafts: readonly StageDraft[];
  /** True when HLP was funded from HyperCore, so it produced no stage draft. */
  hasHyperCoreLeg: boolean;
  hlpDeposited: boolean;
}): string {
  const hlpLabel = params.hlpDeposited ? 'HLP deposited' : 'HLP pending';
  const parts = params.drafts.map((draft) => {
    if (draft.positionId === 'morpho-base') return 'Morpho supplied';
    if (draft.positionId === 'gmx-arbitrum') return 'GMX settled';
    return hlpLabel;
  });
  if (params.hasHyperCoreLeg) parts.push(hlpLabel);
  return parts.length > 0 ? parts.join(' · ') : 'Route complete';
}
