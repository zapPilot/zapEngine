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

/**
 * `usdClassTransfer` denominates its amount in DOLLARS while `vaultTransfer`
 * uses 6-decimal base units. Converting here — once, in the planner — keeps
 * every client off that division: emitting base units to the exchange would
 * transfer 1e6 times the intended amount.
 */
function dollarsFromUsd6(usd6: string): string {
  const value = BigInt(usd6);
  const fraction = (value % 1_000_000n).toString().padStart(6, '0');
  return `${value / 1_000_000n}.${fraction}`;
}

/**
 * Build the two-signature plan for funding an HLP deposit from the user's
 * existing HyperCore spot USDC. There is no bridge and no EVM transaction, so
 * this returns its own plan type rather than a `DepositPlan` with empty legs.
 *
 * Sufficiency of the spot balance is deliberately not checked: the planner has
 * no HyperCore view, and any balance it did read would be stale by signing
 * time. The client gates on the live balance instead.
 */
export function buildHlpSpotDepositPlan(params: {
  /** Deposit size in 6-decimal base units. */
  amountUsd6: string;
  network?: HyperliquidNetwork;
}): HlpSpotDepositPlan {
  const network = params.network ?? 'mainnet';
  const signing = {
    scheme: 'hyperliquid-l1-action',
    hyperliquidChain: network === 'mainnet' ? 'Mainnet' : 'Testnet',
    apiUrl: HYPERLIQUID_EXCHANGE_API[network],
  };

  return HlpSpotDepositPlanSchema.parse({
    kind: 'hlp-spot-deposit',
    execution: 'hypercore-signatures',
    amountUsd6: params.amountUsd6,
    minDepositUsd: HLP_MIN_DEPOSIT_USD,
    lockupDays: HLP_LOCKUP_DAYS,
    steps: [
      {
        kind: 'hyperliquid-usd-class-transfer',
        chainId: HYPERCORE_CHAIN_ID,
        amountUsd6: params.amountUsd6,
        action: {
          type: 'usdClassTransfer',
          toPerp: true,
          amountUsd: dollarsFromUsd6(params.amountUsd6),
        },
        signing,
      },
      {
        kind: 'hyperliquid-vault-deposit',
        chainId: HYPERCORE_CHAIN_ID,
        amount: { source: 'fixed', amount: params.amountUsd6 },
        minDepositUsd: HLP_MIN_DEPOSIT_USD,
        action: buildVaultTransferAction({ vaultAddress: HLP_VAULTS[network] }),
        signing,
        lockupDays: HLP_LOCKUP_DAYS,
      },
    ],
  });
}
