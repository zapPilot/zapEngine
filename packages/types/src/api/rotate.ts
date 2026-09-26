import { z } from 'zod';

import { AddressSchema, DepositPlanSchema } from './deposit.js';
import { PlanReviewEnvelopeShape } from './execution-review.js';

const positiveIntegerStringSchema = z.string().regex(/^0*[1-9]\d*$/, {
  message: 'Expected a positive base-unit integer string',
});

/**
 * Request body for `POST /plan-orchestration/rotate/review`: move
 * `shareAmount` shares of one ERC-4626 vault into another vault on the same
 * chain (redeem, LI.FI swap when the assets differ, deposit).
 */
export const PlanOrchestrationRotateReviewRequestSchema = z
  .object({
    userAddress: AddressSchema,
    chainId: z.number().int().positive(),
    fromVault: AddressSchema,
    toVault: AddressSchema,
    shareAmount: positiveIntegerStringSchema,
  })
  .strict()
  .refine(
    (request) =>
      request.fromVault.toLowerCase() !== request.toVault.toLowerCase(),
    { message: 'fromVault and toVault must differ', path: ['toVault'] },
  );

/**
 * One source-chain batch: approvals, then `[redeem, swap?, deposit]`. It
 * shares DepositPlan's execution envelope but has no bridge legs or
 * follow-ups.
 */
export const RotatePlanSchema = DepositPlanSchema.pick({
  approvals: true,
  calls: true,
  totalGasUsd: true,
  sourceChainId: true,
}).strict();

export const PlanOrchestrationRotateReviewResponseSchema = z
  .object({ plan: RotatePlanSchema, ...PlanReviewEnvelopeShape })
  .strict();

export type PlanOrchestrationRotateReviewRequest = z.infer<
  typeof PlanOrchestrationRotateReviewRequestSchema
>;
export type PlanOrchestrationRotateReviewResponse = z.infer<
  typeof PlanOrchestrationRotateReviewResponseSchema
>;
