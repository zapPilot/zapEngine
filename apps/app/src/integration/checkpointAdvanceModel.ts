import { hlpStepFromPlan } from '@zapengine/app-core/lib/wallet/depositWizardMachine';
import type {
  DepositReviewGroup,
  HyperliquidVaultDepositStep,
  ReviewedDepositPlan,
} from '@zapengine/types/api';

import {
  reviewGroupBlocked,
  riskAcknowledgement,
  sameReviewFingerprints,
} from '@/integration/investReviewModel';
import { isStrategyDepositPlan } from '@/integration/simulationPreviewModel';

export const CHECKPOINT_REVIEW_CHANGED_REASON =
  'The next route review changed. Inspect the updated evidence and confirm again.';
export const CHECKPOINT_BLOCKED_REASON =
  'The next batch is blocked or expired. Refresh and retry.';

export interface CheckpointReviewedBatch {
  plan: ReviewedDepositPlan;
  review: DepositReviewGroup;
}

export interface CheckpointAdvancePorts {
  /** Re-review the queued batch on the chain it executes on. */
  reviewNext: () => Promise<CheckpointReviewedBatch>;
  /** The entry the user already saw, for the fingerprint comparison. */
  queued: CheckpointReviewedBatch;
  now: () => number;
  /** Record the pre-transfer HyperCore snapshot the follow-up measures against. */
  captureHlpBaseline: (step: HyperliquidVaultDepositStep) => Promise<void>;
  submitNext: (input: {
    plan: ReviewedDepositPlan;
    review: DepositReviewGroup;
    acknowledgedRiskHash?: string;
  }) => Promise<
    | { status: 'submitted' }
    | { status: 'review-changed' | 'blocked'; reason: string }
  >;
}

export type CheckpointAdvanceOutcome =
  | { status: 'submitted' }
  | {
      status: 'review-changed' | 'blocked';
      /** The refreshed evidence, to replace the queued entry the user saw. */
      fresh: CheckpointReviewedBatch;
      reason: string;
    }
  | { status: 'rejected'; reason: string };

/**
 * Carry one checkpoint to the next reviewed batch, in the only safe order:
 * re-review, compare against the evidence the user already accepted, then take
 * the HyperCore snapshot before anything can move USDC, and only then submit.
 *
 * Every outcome other than `submitted` leaves the queue paused for a person —
 * changed evidence has to be looked at, and a refused submit is not retried
 * here.
 */
export async function advanceCheckpoint(
  ports: CheckpointAdvancePorts,
): Promise<CheckpointAdvanceOutcome> {
  const fresh = await ports.reviewNext();
  if (!sameReviewFingerprints(ports.queued.review, fresh.review)) {
    return {
      status: 'review-changed',
      fresh,
      reason: CHECKPOINT_REVIEW_CHANGED_REASON,
    };
  }
  if (reviewGroupBlocked(fresh.review, ports.now())) {
    return { status: 'blocked', fresh, reason: CHECKPOINT_BLOCKED_REASON };
  }

  const hlpStep = isStrategyDepositPlan(fresh.plan)
    ? null
    : hlpStepFromPlan(fresh.plan);
  if (hlpStep) {
    await ports.captureHlpBaseline(hlpStep);
  }

  const result = await ports.submitNext({
    plan: fresh.plan,
    review: fresh.review,
    ...riskAcknowledgement(fresh.review),
  });
  return result.status === 'submitted'
    ? { status: 'submitted' }
    : { status: 'rejected', reason: result.reason };
}
