import { z } from 'zod';

import { AddressSchema, DepositPlanSchema } from './deposit.js';

const decimalStringSchema = z.string().regex(/^\d+$/, {
  message: 'Expected a base-unit integer string',
});

/**
 * A single withdrawal routing leg. Mirrors DepositLeg but the kinds reflect the
 * withdrawal flow: `withdraw` (redeem shares / burn GM tokens) and `swap`
 * (LiFi conversion of the redeemed asset into the user's chosen token).
 */
export const WithdrawLegSchema = z.object({
  chainId: z.number().int().positive(),
  kind: z.enum(['withdraw', 'swap']),
  protocol: z.string().optional(),
  toToken: AddressSchema,
  fromAmount: decimalStringSchema,
  toAmountMin: decimalStringSchema,
  gasUsd: z.string(),
  durationSec: z.number().int().nonnegative(),
});

/**
 * Executable withdrawal plan. Shares DepositPlan's execution envelope
 * (approvals/calls/totalGasUsd/sourceChainId) — so the frontend's EIP-7702
 * executor runs either without branching — and only swaps in withdrawal legs.
 */
export const WithdrawPlanSchema = DepositPlanSchema.omit({ legs: true }).extend(
  {
    legs: z.array(WithdrawLegSchema),
  },
);

/**
 * Request body for `POST /plan-orchestration/withdraw`.
 *
 * - `morpho`: redeem ERC-4626 vault shares; optionally swap the underlying into
 *   `toToken` via LiFi (omit `toToken` to receive the vault's native asset).
 * - `gmx-v2`: burn GM market tokens. The GMX keeper settles the market's native
 *   long/short tokens asynchronously, so there is no `toToken` swap option.
 */
export const PlanOrchestrationWithdrawRequestSchema = z.discriminatedUnion(
  'kind',
  [
    z.object({
      kind: z.literal('morpho'),
      userAddress: AddressSchema,
      vaultAddress: AddressSchema,
      shareAmount: decimalStringSchema,
      chainId: z.number().int().positive(),
      toToken: AddressSchema.optional(),
    }),
    z.object({
      kind: z.literal('gmx-v2'),
      userAddress: AddressSchema,
      marketKey: z.enum(['btc-btc', 'eth-eth', 'btc-usdc', 'eth-usdc']),
      gmAmount: decimalStringSchema,
    }),
  ],
);

export type WithdrawLeg = z.infer<typeof WithdrawLegSchema>;
export type WithdrawPlan = z.infer<typeof WithdrawPlanSchema>;
export type PlanOrchestrationWithdrawRequest = z.infer<
  typeof PlanOrchestrationWithdrawRequestSchema
>;
