import { z } from 'zod';

import {
  PlanOrchestrationDepositRequestSchema,
  PlanOrchestrationDepositPlanSchema,
} from './deposit.js';
import {
  SimulationApprovalSchema,
  SimulationAssetChangeSchema,
  SimulationBytes32Schema,
  SimulationCallSchema,
  SimulationContractSchema,
  SimulationReviewEvidenceShape,
  SimulationTokenSchema,
  SimulationWarningCodeSchema,
  SimulationWarningSchema,
} from './simulation-review.js';

/**
 * The common, wallet-neutral evidence produced by a transaction simulation.
 *
 * Privy still exposes its existing `PrivySimulation*` names for compatibility
 * with the wallet execution API.  New execution rails should consume these
 * neutral schemas instead so that the review contract does not imply a
 * particular wallet provider.
 */

export const ExecutionSimulationTokenSchema = SimulationTokenSchema;
export const ExecutionSimulationCallSchema = SimulationCallSchema;
export const ExecutionSimulationAssetChangeSchema = SimulationAssetChangeSchema;
export const ExecutionSimulationApprovalSchema = SimulationApprovalSchema;
export const ExecutionSimulationContractSchema = SimulationContractSchema;
export const ExecutionSimulationWarningCodeSchema = SimulationWarningCodeSchema;
export const ExecutionSimulationWarningSchema = SimulationWarningSchema;
const ExecutionSimulationEvidenceShape = SimulationReviewEvidenceShape;

/** A Tenderly (or equivalent) result without wallet-provider signing data. */
export const ExecutionSimulationPassedReviewSchema = z
  .object({
    status: z.literal('passed'),
    ...ExecutionSimulationEvidenceShape,
    warnings: z.array(ExecutionSimulationWarningSchema).max(0),
  })
  .strict();

export const ExecutionSimulationWarningReviewSchema = z
  .object({
    status: z.literal('warning'),
    ...ExecutionSimulationEvidenceShape,
    warnings: z.array(ExecutionSimulationWarningSchema).min(1),
  })
  .strict();

export const ExecutionSimulationFailedReviewSchema = z
  .object({
    status: z.literal('failed'),
    ...ExecutionSimulationEvidenceShape,
    failureReason: z.string().min(1),
  })
  .strict();

export const ExecutionSimulationUnavailableReviewSchema = z
  .object({
    status: z.literal('unavailable'),
    ...ExecutionSimulationEvidenceShape,
    unavailableReason: z.string().min(1),
  })
  .strict();

export const ExecutionSimulationReviewSchema = z.discriminatedUnion('status', [
  ExecutionSimulationPassedReviewSchema,
  ExecutionSimulationWarningReviewSchema,
  ExecutionSimulationFailedReviewSchema,
  ExecutionSimulationUnavailableReviewSchema,
]);

/** Metadata binding a simulation to one authoritative plan execution group. */
const DepositReviewGroupMetadataShape = {
  groupId: z.string().min(1),
  groupFingerprint: SimulationBytes32Schema,
  batchFingerprint: SimulationBytes32Schema,
  reviewedAt: z.number().int().positive(),
  expiresAt: z.number().int().positive(),
  expectedSimulationFingerprint: SimulationBytes32Schema,
  expectedRiskHash: SimulationBytes32Schema,
  /** Failed/unavailable reviews are renderable but can never be executed. */
  blocked: z.boolean(),
  executionAllowed: z.boolean(),
  requiresRiskAcknowledgement: z.boolean(),
};

export const DepositReviewGroupSchema = z.discriminatedUnion('status', [
  ExecutionSimulationPassedReviewSchema.extend(DepositReviewGroupMetadataShape),
  ExecutionSimulationWarningReviewSchema.extend(
    DepositReviewGroupMetadataShape,
  ),
  ExecutionSimulationFailedReviewSchema.extend(DepositReviewGroupMetadataShape),
  ExecutionSimulationUnavailableReviewSchema.extend(
    DepositReviewGroupMetadataShape,
  ),
]);

/**
 * The review endpoint intentionally accepts the exact same request as
 * `/plan-orchestration/deposit`; this keeps plan construction authoritative
 * on the server and avoids a client-side second planning contract.
 */
export const PlanOrchestrationDepositReviewRequestSchema =
  PlanOrchestrationDepositRequestSchema;

export const PlanOrchestrationDepositReviewResponseSchema = z
  .object({
    plan: PlanOrchestrationDepositPlanSchema,
    planFingerprint: SimulationBytes32Schema,
    reviewedAt: z.number().int().positive(),
    expiresAt: z.number().int().positive(),
    reviews: z.record(z.string().min(1), DepositReviewGroupSchema),
  })
  .strict();

export type ExecutionSimulationToken = z.infer<
  typeof ExecutionSimulationTokenSchema
>;
export type ExecutionSimulationCall = z.infer<
  typeof ExecutionSimulationCallSchema
>;
export type ExecutionSimulationAssetChange = z.infer<
  typeof ExecutionSimulationAssetChangeSchema
>;
export type ExecutionSimulationApproval = z.infer<
  typeof ExecutionSimulationApprovalSchema
>;
export type ExecutionSimulationContract = z.infer<
  typeof ExecutionSimulationContractSchema
>;
export type ExecutionSimulationWarning = z.infer<
  typeof ExecutionSimulationWarningSchema
>;
export type DepositReviewGroup = z.infer<typeof DepositReviewGroupSchema>;
export type PlanOrchestrationDepositReviewRequest = z.infer<
  typeof PlanOrchestrationDepositReviewRequestSchema
>;
export type PlanOrchestrationDepositReviewResponse = z.infer<
  typeof PlanOrchestrationDepositReviewResponseSchema
>;

// Keep this import in the public module's type graph: downstream consumers
// can refer to the plan type without importing an implementation package.
export type { PlanOrchestrationDepositPlan } from './deposit.js';
