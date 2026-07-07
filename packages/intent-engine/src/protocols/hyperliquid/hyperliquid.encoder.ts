import {
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

/**
 * Build the declarative HLP deposit follow-up for a DepositPlan. The step
 * executes after `plan.legs[afterLegIndex]` (the bridge to HyperCore) lands,
 * using the actually-received perp USDC balance.
 */
export function buildHlpDepositFollowUp(params: {
  afterLegIndex: number;
  /** Bridge leg's toAmountMin, 6-decimal base units (display estimate). */
  expectedUsd: string;
  network?: HyperliquidNetwork;
}): HyperliquidVaultDepositStep {
  const network = params.network ?? 'mainnet';

  return HyperliquidVaultDepositStepSchema.parse({
    kind: 'hyperliquid-vault-deposit',
    chainId: HYPERCORE_CHAIN_ID,
    afterLegIndex: params.afterLegIndex,
    amount: { source: 'bridge-output', legIndex: params.afterLegIndex },
    expectedUsd: params.expectedUsd,
    minDepositUsd: HLP_MIN_DEPOSIT_USD,
    action: buildVaultTransferAction({ vaultAddress: HLP_VAULTS[network] }),
    signing: {
      scheme: 'hyperliquid-l1-action',
      hyperliquidChain: network === 'mainnet' ? 'Mainnet' : 'Testnet',
      apiUrl: HYPERLIQUID_EXCHANGE_API[network],
    },
    lockupDays: HLP_LOCKUP_DAYS,
  });
}
