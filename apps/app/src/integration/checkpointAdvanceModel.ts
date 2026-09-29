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
  'The route has changed. Review the updated details and confirm again.';
export const CHECKPOINT_BLOCKED_REASON =
  'The next batch is blocked or expired. Refresh and retry.';

export interface CheckpointReviewedBatch {
  plan: ReviewedDepositPlan;
  review: DepositReviewGroup;
}

export interface CheckpointSubmitPorts {
  /** The exact reviewed batch currently visible to the user. */
  reviewed: CheckpointReviewedBatch;
  now: () => number;
  /** Record the pre-transfer HyperCore snapshot before anything can move USDC. */
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

export interface CheckpointAdvancePorts extends Omit<
  CheckpointSubmitPorts,
  'reviewed'
> {
  /** Re-review the queued batch on the chain it executes on. */
  reviewNext: () => Promise<CheckpointReviewedBatch>;
  /** The entry the user already saw, for the fingerprint comparison. */
  queued: CheckpointReviewedBatch;
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
 * Submit the exact reviewed batch the user can currently see. This deliberately
 * does not rebuild or re-review the plan: a live quote may legitimately move
 * between reviews, and confirming a changed review must submit that same
 * visible calldata rather than creating yet another quote. The wallet layer
 * still re-simulates this exact batch and checks its simulation/risk hashes
 * immediately before signing.
 */
export async function confirmCheckpointReview(
  ports: CheckpointSubmitPorts,
): Promise<CheckpointAdvanceOutcome> {
  const { reviewed } = ports;
  if (reviewGroupBlocked(reviewed.review, ports.now())) {
    return {
      status: 'blocked',
      fresh: reviewed,
      reason: CHECKPOINT_BLOCKED_REASON,
    };
  }

  const hlpStep = isStrategyDepositPlan(reviewed.plan)
    ? null
    : hlpStepFromPlan(reviewed.plan);
  if (hlpStep) {
    await ports.captureHlpBaseline(hlpStep);
  }

  const result = await ports.submitNext({
    plan: reviewed.plan,
    review: reviewed.review,
    ...riskAcknowledgement(reviewed.review),
  });
  return result.status === 'submitted'
    ? { status: 'submitted' }
    : { status: 'rejected', reason: result.reason };
}

/**
 * Carry one checkpoint to the next reviewed batch: re-review once, compare it
 * with the evidence already accepted, and either submit that fresh review or
 * pause so the changed review can be shown and explicitly confirmed.
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
  return confirmCheckpointReview({
    reviewed: fresh,
    now: ports.now,
    captureHlpBaseline: ports.captureHlpBaseline,
    submitNext: ports.submitNext,
  });
}
