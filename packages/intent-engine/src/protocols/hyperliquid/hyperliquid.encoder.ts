import {
  type HlpSpotDepositPlan,
  HlpSpotDepositPlanSchema,
  type HyperliquidVaultDepositStep,
  HyperliquidVaultDepositStepSchema,
} from '@zapengine/types/api';
import type { Address } from 'viem';

import {
  HLP_LOCKUP_DAYS,
  HLP_MIN_DEPOSIT_USD,
  HLP_VAULTS,
  HYPERCORE_CHAIN_ID,
  HYPERLIQUID_EXCHANGE_API,
  type HyperliquidNetwork,
} from './hyperliquid.constants.js';

/**
 * Unsigned Hyperliquid exchange action. Signing is impossible at planning
 * time — the L1-action hash commits to the execution-time nonce — so this
 * module only ever emits declarative payloads; the execution plane owns
 * nonce, hash, signature, and submission.
 */
export interface HyperliquidVaultTransferAction {
  type: 'vaultTransfer';
  vaultAddress: Address;
  isDeposit: true;
}

export function buildVaultTransferAction(params: {
  vaultAddress: Address;
}): HyperliquidVaultTransferAction {
  return {
    type: 'vaultTransfer',
    vaultAddress: params.vaultAddress.toLowerCase() as Address,
    isDeposit: true,
  };
}

function hlpVaultStepBase(network: HyperliquidNetwork) {
  return {
    kind: 'hyperliquid-vault-deposit' as const,
    chainId: HYPERCORE_CHAIN_ID,
    minDepositUsd: HLP_MIN_DEPOSIT_USD,
    action: buildVaultTransferAction({ vaultAddress: HLP_VAULTS[network] }),
    signing: {
      scheme: 'hyperliquid-l1-action' as const,
      hyperliquidChain: network === 'mainnet' ? ('Mainnet' as const) : ('Testnet' as const),
      apiUrl: HYPERLIQUID_EXCHANGE_API[network],
    },
    lockupDays: HLP_LOCKUP_DAYS,
  };
}

/**
 * Build the declarative HLP deposit follow-up for a DepositPlan. The step
 * executes after `plan.legs[afterLegIndex]` (the bridge to HyperCore) lands,
 * using the actually-received HyperCore USDC balance.
 */
export function buildHlpDepositFollowUp(params: {
  afterLegIndex: number;
  /** Bridge leg's toAmountMin, 6-decimal base units (display estimate). */
  expectedUsd: string;
  network?: HyperliquidNetwork;
}): HyperliquidVaultDepositStep {
  const network = params.network ?? 'mainnet';

  return HyperliquidVaultDepositStepSchema.parse({
    ...hlpVaultStepBase(network),
    afterLegIndex: params.afterLegIndex,
    amount: { source: 'bridge-output', legIndex: params.afterLegIndex },
    expectedUsd: params.expectedUsd,
  });
}

/**
 * Build the single-action plan for funding an HLP deposit from the user's
 * existing HyperCore USDC. There is no bridge and no EVM transaction, so this
 * returns its own plan type rather than a `DepositPlan` with empty legs.
 *
 * Sufficiency is deliberately not checked here: the planner has no HyperCore
 * view, and any balance it did read would be stale by execution time. The
 * client gates on the live account-mode-aware spendable balance instead.
 */
export function buildHlpSpotDepositPlan(params: {
  /** Deposit size in 6-decimal base units. */
  amountUsd6: string;
  network?: HyperliquidNetwork;
}): HlpSpotDepositPlan {
  const network = params.network ?? 'mainnet';

  return HlpSpotDepositPlanSchema.parse({
    kind: 'hlp-spot-deposit',
    execution: 'hypercore-signatures',
    amountUsd6: params.amountUsd6,
    minDepositUsd: HLP_MIN_DEPOSIT_USD,
    lockupDays: HLP_LOCKUP_DAYS,
    step: {
      ...hlpVaultStepBase(network),
      amount: { source: 'fixed', amount: params.amountUsd6 },
    },
  });
}
