import { z } from 'zod';

import { equalsAddress } from '../shared/wallet.js';
import {
  AddressSchema,
  ChainSplitSchema,
  DEPOSIT_USDC_ADDRESSES,
  HYPERCORE_CHAIN_ID,
  NATIVE_TOKEN_ADDRESS,
  PlanOrchestrationDepositRequestSchema,
  SUPPORTED_DEPOSIT_CHAINS,
} from './deposit.js';

const decimalStringSchema = z.string().regex(/^\d+$/, {
  message: 'Expected a base-unit integer string',
});

const SOURCE_CHAIN_IDS = new Set<number>(
  Object.values(SUPPORTED_DEPOSIT_CHAINS),
);
const DESTINATION_CHAIN_IDS = new Set<number>([
  ...Object.values(SUPPORTED_DEPOSIT_CHAINS),
  HYPERCORE_CHAIN_ID,
]);

/**
 * Routed `invest` request used by the unified planner.
 *
 * Legacy `PlanOrchestrationDepositRequestSchema` intentionally restricted
 * cross-chain splits to Base while the destination-requote prototype was the
 * only caller. Unified invest needs all supported EVM wallets to bridge into
 * the chain where a target actually executes.
 *
 * Hyperliquid remains stricter than ordinary EVM routing: its canonical
 * Bridge2 ingress is native Arbitrum USDC, so Base/Ethereum must first route
 * to Arbitrum and a second reviewed request performs the Bridge2 deposit.
 */
export const RoutedInvestDepositRequestSchema = z
  .object({
    kind: z.literal('invest'),
    userAddress: AddressSchema,
    fromToken: AddressSchema,
    fromAmount: decimalStringSchema,
    sourceChainId: z.number().int().positive(),
    split: ChainSplitSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (!SOURCE_CHAIN_IDS.has(value.sourceChainId)) {
      ctx.addIssue({
        code: 'custom',
        message: 'sourceChainId must be a supported EVM deposit chain',
        path: ['sourceChainId'],
      });
      return;
    }

    const canonicalUsdc = DEPOSIT_USDC_ADDRESSES[value.sourceChainId];
    if (
      !equalsAddress(value.fromToken, canonicalUsdc) &&
      !equalsAddress(value.fromToken, NATIVE_TOKEN_ADDRESS)
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'fromToken must be canonical USDC or native ETH',
        path: ['fromToken'],
      });
    }

    const destinations = Object.keys(value.split ?? {}).map(Number);
    for (const chainId of destinations) {
      if (!DESTINATION_CHAIN_IDS.has(chainId)) {
        ctx.addIssue({
          code: 'custom',
          message: `Unsupported split chain ${chainId}`,
          path: ['split'],
        });
      }
    }

    if (destinations.includes(HYPERCORE_CHAIN_ID)) {
      if (value.sourceChainId !== SUPPORTED_DEPOSIT_CHAINS.ARBITRUM) {
        ctx.addIssue({
          code: 'custom',
          message:
            'Hyperliquid deposits must first route to native USDC on Arbitrum',
          path: ['sourceChainId'],
        });
      }
      const arbitrumUsdc =
        DEPOSIT_USDC_ADDRESSES[SUPPORTED_DEPOSIT_CHAINS.ARBITRUM];
      if (!equalsAddress(value.fromToken, arbitrumUsdc)) {
        ctx.addIssue({
          code: 'custom',
          message: 'Hyperliquid Bridge2 accepts native Arbitrum USDC only',
          path: ['fromToken'],
        });
      }
    }
  });

/**
 * Drop-in request validator for orchestration endpoints. The routed invest
 * branch is tried first; every other request kind retains the legacy schema.
 */
export const RoutedPlanOrchestrationDepositRequestSchema = z.union([
  RoutedInvestDepositRequestSchema,
  PlanOrchestrationDepositRequestSchema,
]);

export type RoutedPlanOrchestrationDepositRequest = z.infer<
  typeof RoutedPlanOrchestrationDepositRequestSchema
>;
