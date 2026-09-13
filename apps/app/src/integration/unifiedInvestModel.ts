import {
  HYPERCORE_CHAIN_ID,
  type ReviewedDepositRequest,
  SUPPORTED_DEPOSIT_CHAINS,
} from '@zapengine/types/api';

import type { DesktopDepositToken } from '@/integration/depositTokens';
import {
  singleChainFromAmount,
  spendableUsdForFundingToken,
  type StrategyFundingOption,
} from '@/integration/investAmountModel';

export const UNIFIED_INVEST_ALLOCATIONS = {
  morphoBps: 4_000,
  gmxBps: 3_500,
  hlpBps: 2_500,
} as const;

// HLP's own minimum is $10 and represents 25% of this preset.
export const UNIFIED_INVEST_MIN_USD6 = 40_000_000n;

export type UnifiedInvestTargetId = 'morpho' | 'gmx' | 'hlp';

export interface UnifiedInvestTargetDraft {
  id: UnifiedInvestTargetId;
  label: string;
  detail: string;
  allocationBps: number;
  request: ReviewedDepositRequest;
}

export interface UnifiedInvestRequestInput {
  userAddress: `0x${string}`;
  totalUsd6: string;
  baseFundingToken: DesktopDepositToken;
  baseUsdPrice: number | null;
  arbitrumFundingToken: DesktopDepositToken;
  arbitrumUsdPrice: number | null;
}

function shareUsd6(totalUsd6: bigint, bps: bigint): bigint {
  return (totalUsd6 * bps) / 10_000n;
}

export function unifiedInvestUsd6Shares(totalUsd6: string): {
  morphoUsd6: bigint;
  gmxUsd6: bigint;
  hlpUsd6: bigint;
} | null {
  if (!/^\d+$/u.test(totalUsd6)) return null;
  const total = BigInt(totalUsd6);
  if (total <= 0n) return null;

  const morphoUsd6 = shareUsd6(total, 4_000n);
  const gmxUsd6 = shareUsd6(total, 3_500n);
  // Give rounding dust to the final leg so the three targets always sum to
  // the exact amount the user entered.
  const hlpUsd6 = total - morphoUsd6 - gmxUsd6;
  return { morphoUsd6, gmxUsd6, hlpUsd6 };
}

function sourceAmount(params: {
  usd6: bigint;
  token: DesktopDepositToken;
  usdPrice: number | null;
}): string | null {
  return singleChainFromAmount({
    totalUsd6: params.usd6.toString(),
    token: params.token,
    usdPrice: params.usdPrice,
  });
}

/**
 * Build three independently reviewed requests for the fixed Balanced Yield
 * preset. Transaction construction stays server-authoritative; this model only
 * freezes the user's target allocation and funding-token amounts.
 */
export function buildUnifiedInvestRequests(
  input: UnifiedInvestRequestInput,
): UnifiedInvestTargetDraft[] | null {
  const shares = unifiedInvestUsd6Shares(input.totalUsd6);
  if (!shares) return null;

  const morphoAmount = sourceAmount({
    usd6: shares.morphoUsd6,
    token: input.baseFundingToken,
    usdPrice: input.baseUsdPrice,
  });
  const gmxAmount = sourceAmount({
    usd6: shares.gmxUsd6,
    token: input.arbitrumFundingToken,
    usdPrice: input.arbitrumUsdPrice,
  });
  const hlpAmount = sourceAmount({
    usd6: shares.hlpUsd6,
    token: input.baseFundingToken,
    usdPrice: input.baseUsdPrice,
  });
  if (!morphoAmount || !gmxAmount || !hlpAmount) return null;

  return [
    {
      id: 'morpho',
      label: 'Morpho',
      detail: 'Base · Moonwell USDC',
      allocationBps: UNIFIED_INVEST_ALLOCATIONS.morphoBps,
      request: {
        kind: 'invest',
        userAddress: input.userAddress,
        fromToken: input.baseFundingToken.depositAddress,
        fromAmount: morphoAmount,
        sourceChainId: SUPPORTED_DEPOSIT_CHAINS.BASE,
        split: { [String(SUPPORTED_DEPOSIT_CHAINS.BASE)]: 1 },
      },
    },
    {
      id: 'gmx',
      label: 'GMX',
      detail: 'Arbitrum · diversified GM basket',
      allocationBps: UNIFIED_INVEST_ALLOCATIONS.gmxBps,
      request: {
        kind: 'gmx-v2-basket',
        userAddress: input.userAddress,
        fromToken: input.arbitrumFundingToken.depositAddress,
        amount: gmxAmount,
      },
    },
    {
      id: 'hlp',
      label: 'HLP',
      detail: 'Hyperliquid · official HLP vault',
      allocationBps: UNIFIED_INVEST_ALLOCATIONS.hlpBps,
      request: {
        kind: 'invest',
        userAddress: input.userAddress,
        fromToken: input.baseFundingToken.depositAddress,
        fromAmount: hlpAmount,
        sourceChainId: SUPPORTED_DEPOSIT_CHAINS.BASE,
        split: { [String(HYPERCORE_CHAIN_ID)]: 1 },
      },
    },
  ];
}

/** Base funds Morpho + HLP (65%); Arbitrum funds GMX (35%). */
export function unifiedStrategyMaxTotalUsd(params: {
  base: StrategyFundingOption;
  arbitrum: StrategyFundingOption;
}): number | null {
  const baseSpendable = spendableUsdForFundingToken(
    params.base.balance,
    params.base.token,
  );
  const arbitrumSpendable = spendableUsdForFundingToken(
    params.arbitrum.balance,
    params.arbitrum.token,
  );

  if (baseSpendable === 0 || arbitrumSpendable === 0) return 0;
  if (baseSpendable === null || arbitrumSpendable === null) return null;

  return Math.max(
    0,
    Math.min(baseSpendable / 0.65, arbitrumSpendable / 0.35),
  );
}
