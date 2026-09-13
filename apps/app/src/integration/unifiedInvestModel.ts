import {
  DEPOSIT_USDC_ADDRESSES,
  HYPERCORE_CHAIN_ID,
  type ReviewedDepositRequest,
  SUPPORTED_DEPOSIT_CHAINS,
} from '@zapengine/types/api';

import {
  ARBITRUM_DEPOSIT_TOKENS,
  BASE_DEPOSIT_TOKENS,
  ETHEREUM_DEPOSIT_TOKENS,
  type DesktopDepositToken,
} from '@/integration/depositTokens';
import {
  balanceForFundingToken,
  singleChainFromAmount,
  spendableUsdForFundingToken,
} from '@/integration/investAmountModel';
import type { ChainTokenBalanceRow } from '@/integration/walletTokens';

export interface UnifiedInvestAllocation {
  morphoBps: number;
  gmxBps: number;
  hlpBps: number;
}

export const DEFAULT_UNIFIED_INVEST_ALLOCATION: UnifiedInvestAllocation = {
  morphoBps: 4_000,
  gmxBps: 3_500,
  hlpBps: 2_500,
};

const TARGET_MIN_USD6 = {
  morpho: 10_000n,
  gmx: 1_000_000n,
  hlp: 10_000_000n,
} as const;

export type UnifiedInvestTargetId = keyof typeof TARGET_MIN_USD6;
export type UnifiedInvestStage = 'target' | 'hlp-ingress' | 'hlp-bridge2';

export interface UnifiedHlpFundingSource {
  token: DesktopDepositToken;
  spendableUsd: number;
  reservedUsd: number;
  availableUsd: number;
  requiresArbitrumIngress: boolean;
}

export interface UnifiedInvestTargetDraft {
  id: UnifiedInvestTargetId;
  stage: UnifiedInvestStage;
  label: string;
  detail: string;
  allocationBps: number;
  request: ReviewedDepositRequest;
  hlpFunding?: UnifiedHlpFundingSource;
}

export interface UnifiedInvestRequestInput {
  userAddress: `0x${string}`;
  totalUsd6: string;
  allocation: UnifiedInvestAllocation;
  baseFundingToken: DesktopDepositToken;
  arbitrumFundingToken: DesktopDepositToken;
  rows: readonly ChainTokenBalanceRow[];
}

const HLP_SOURCE_TOKENS: readonly DesktopDepositToken[] = [
  ARBITRUM_DEPOSIT_TOKENS[0],
  BASE_DEPOSIT_TOKENS[0],
  ETHEREUM_DEPOSIT_TOKENS[0],
  BASE_DEPOSIT_TOKENS[1],
  ETHEREUM_DEPOSIT_TOKENS[2],
];

function sameFundingToken(
  left: DesktopDepositToken,
  right: DesktopDepositToken,
): boolean {
  return (
    left.chainId === right.chainId &&
    left.depositAddress.toLowerCase() === right.depositAddress.toLowerCase()
  );
}

function chainLabel(token: DesktopDepositToken): string {
  if (token.chainId === SUPPORTED_DEPOSIT_CHAINS.ETHEREUM) return 'Ethereum';
  if (token.chainId === SUPPORTED_DEPOSIT_CHAINS.BASE) return 'Base';
  return 'Arbitrum';
}

export function isValidUnifiedAllocation(
  allocation: UnifiedInvestAllocation,
): boolean {
  const values = [
    allocation.morphoBps,
    allocation.gmxBps,
    allocation.hlpBps,
  ];
  return (
    values.every(
      (value) => Number.isInteger(value) && value >= 0 && value <= 10_000,
    ) && values.reduce((sum, value) => sum + value, 0) === 10_000
  );
}

function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator - 1n) / denominator;
}

export function unifiedInvestMinimumUsd6(
  allocation: UnifiedInvestAllocation,
): bigint {
  if (!isValidUnifiedAllocation(allocation)) return 0n;

  const required = (
    [
      ['morpho', allocation.morphoBps],
      ['gmx', allocation.gmxBps],
      ['hlp', allocation.hlpBps],
    ] as const
  )
    .filter(([, bps]) => bps > 0)
    .map(([id, bps]) =>
      ceilDiv(TARGET_MIN_USD6[id] * 10_000n, BigInt(bps)),
    );
  return required.reduce((max, value) => (value > max ? value : max), 0n);
}

export function unifiedInvestUsd6Shares(
  totalUsd6: string,
  allocation: UnifiedInvestAllocation,
): { morphoUsd6: bigint; gmxUsd6: bigint; hlpUsd6: bigint } | null {
  if (!/^\d+$/u.test(totalUsd6) || !isValidUnifiedAllocation(allocation)) {
    return null;
  }
  const total = BigInt(totalUsd6);
  if (total <= 0n) return null;

  const entries = (
    [
      ['morpho', allocation.morphoBps],
      ['gmx', allocation.gmxBps],
      ['hlp', allocation.hlpBps],
    ] as const
  ).filter(([, bps]) => bps > 0);
  if (entries.length === 0) return null;

  const result = { morphoUsd6: 0n, gmxUsd6: 0n, hlpUsd6: 0n };
  let allocated = 0n;
  entries.forEach(([id, bps], index) => {
    const amount =
      index === entries.length - 1
        ? total - allocated
        : (total * BigInt(bps)) / 10_000n;
    allocated += amount;
    result[`${id}Usd6`] = amount;
  });
  return result;
}

function priceForToken(
  token: DesktopDepositToken,
  rows: readonly ChainTokenBalanceRow[],
): number | null {
  const row = balanceForFundingToken(rows, token);
  if (token.symbol === 'USDC' || token.symbol === 'USDT') return 1;
  return row?.usdPrice ?? null;
}

function sourceAmount(params: {
  usd6: bigint;
  token: DesktopDepositToken;
  rows: readonly ChainTokenBalanceRow[];
}): string | null {
  if (params.usd6 <= 0n) return null;
  return singleChainFromAmount({
    totalUsd6: params.usd6.toString(),
    token: params.token,
    usdPrice: priceForToken(params.token, params.rows),
  });
}

function targetUsd(totalUsd6: string, bps: number): number {
  return (Number(BigInt(totalUsd6)) / 1_000_000) * (bps / 10_000);
}

function reservedUsdForHlpSource(params: {
  token: DesktopDepositToken;
  totalUsd6: string;
  allocation: UnifiedInvestAllocation;
  baseFundingToken: DesktopDepositToken;
  arbitrumFundingToken: DesktopDepositToken;
}): number {
  let reserved = 0;
  if (
    params.allocation.morphoBps > 0 &&
    sameFundingToken(params.token, params.baseFundingToken)
  ) {
    reserved += targetUsd(params.totalUsd6, params.allocation.morphoBps);
  }
  if (
    params.allocation.gmxBps > 0 &&
    sameFundingToken(params.token, params.arbitrumFundingToken)
  ) {
    reserved += targetUsd(params.totalUsd6, params.allocation.gmxBps);
  }
  return reserved;
}

export function selectUnifiedHlpFundingSource(params: {
  totalUsd6: string;
  allocation: UnifiedInvestAllocation;
  baseFundingToken: DesktopDepositToken;
  arbitrumFundingToken: DesktopDepositToken;
  rows: readonly ChainTokenBalanceRow[];
}): UnifiedHlpFundingSource | null {
  if (params.allocation.hlpBps <= 0) return null;
  const requiredUsd = targetUsd(params.totalUsd6, params.allocation.hlpBps);
  if (!(requiredUsd > 0)) return null;

  const candidates = HLP_SOURCE_TOKENS.flatMap((token) => {
    const row = balanceForFundingToken(params.rows, token);
    const spendableUsd = spendableUsdForFundingToken(row, token);
    if (spendableUsd === null || spendableUsd <= 0) return [];
    const reservedUsd = reservedUsdForHlpSource({ ...params, token });
    const availableUsd = Math.max(0, spendableUsd - reservedUsd);
    if (availableUsd + 1e-6 < requiredUsd) return [];
    return [
      {
        token,
        spendableUsd,
        reservedUsd,
        availableUsd,
        requiresArbitrumIngress:
          token.chainId !== SUPPORTED_DEPOSIT_CHAINS.ARBITRUM,
      },
    ];
  });

  candidates.sort((left, right) => {
    const leftHop = left.requiresArbitrumIngress ? 1 : 0;
    const rightHop = right.requiresArbitrumIngress ? 1 : 0;
    if (leftHop !== rightHop) return leftHop - rightHop;
    const leftStable = left.token.symbol === 'USDC' ? 0 : 1;
    const rightStable = right.token.symbol === 'USDC' ? 0 : 1;
    if (leftStable !== rightStable) return leftStable - rightStable;
    return right.availableUsd - left.availableUsd;
  });
  return candidates[0] ?? null;
}

export function buildHlpBridge2Request(params: {
  userAddress: `0x${string}`;
  amountUsd6: string;
}): ReviewedDepositRequest {
  return {
    kind: 'invest',
    userAddress: params.userAddress,
    fromToken: DEPOSIT_USDC_ADDRESSES[
      SUPPORTED_DEPOSIT_CHAINS.ARBITRUM
    ]! as `0x${string}`,
    fromAmount: params.amountUsd6,
    sourceChainId: SUPPORTED_DEPOSIT_CHAINS.ARBITRUM,
    split: { [String(HYPERCORE_CHAIN_ID)]: 1 },
  };
}

/**
 * Freeze the executable target requests for the current amount/allocation.
 * HLP from Base/Ethereum intentionally stops at Arbitrum here; the review hook
 * derives a second reviewed Bridge2 batch from the ingress quote's toAmountMin.
 */
export function buildUnifiedInvestRequests(
  input: UnifiedInvestRequestInput,
): UnifiedInvestTargetDraft[] | null {
  const shares = unifiedInvestUsd6Shares(input.totalUsd6, input.allocation);
  if (!shares) return null;
  const drafts: UnifiedInvestTargetDraft[] = [];

  if (input.allocation.morphoBps > 0) {
    const amount = sourceAmount({
      usd6: shares.morphoUsd6,
      token: input.baseFundingToken,
      rows: input.rows,
    });
    if (!amount) return null;
    drafts.push({
      id: 'morpho',
      stage: 'target',
      label: 'Morpho',
      detail: 'Base · Moonwell USDC',
      allocationBps: input.allocation.morphoBps,
      request: {
        kind: 'invest',
        userAddress: input.userAddress,
        fromToken: input.baseFundingToken.depositAddress,
        fromAmount: amount,
        sourceChainId: SUPPORTED_DEPOSIT_CHAINS.BASE,
        split: { [String(SUPPORTED_DEPOSIT_CHAINS.BASE)]: 1 },
      },
    });
  }

  if (input.allocation.gmxBps > 0) {
    const amount = sourceAmount({
      usd6: shares.gmxUsd6,
      token: input.arbitrumFundingToken,
      rows: input.rows,
    });
    if (!amount) return null;
    drafts.push({
      id: 'gmx',
      stage: 'target',
      label: 'GMX',
      detail: 'Arbitrum · diversified GM basket',
      allocationBps: input.allocation.gmxBps,
      request: {
        kind: 'gmx-v2-basket',
        userAddress: input.userAddress,
        fromToken: input.arbitrumFundingToken.depositAddress,
        amount,
      },
    });
  }

  if (input.allocation.hlpBps > 0) {
    const hlpFunding = selectUnifiedHlpFundingSource({
      totalUsd6: input.totalUsd6,
      allocation: input.allocation,
      baseFundingToken: input.baseFundingToken,
      arbitrumFundingToken: input.arbitrumFundingToken,
      rows: input.rows,
    });
    if (!hlpFunding) return null;
    const amount = sourceAmount({
      usd6: shares.hlpUsd6,
      token: hlpFunding.token,
      rows: input.rows,
    });
    if (!amount) return null;
    const source = chainLabel(hlpFunding.token);
    drafts.push({
      id: 'hlp',
      stage: hlpFunding.requiresArbitrumIngress ? 'hlp-ingress' : 'hlp-bridge2',
      label: 'HLP',
      detail: hlpFunding.requiresArbitrumIngress
        ? `${source} → Arbitrum USDC → Hyperliquid`
        : 'Arbitrum USDC → Hyperliquid',
      allocationBps: input.allocation.hlpBps,
      hlpFunding,
      request: hlpFunding.requiresArbitrumIngress
        ? {
            kind: 'invest',
            userAddress: input.userAddress,
            fromToken: hlpFunding.token.depositAddress,
            fromAmount: amount,
            sourceChainId: hlpFunding.token.chainId,
            split: { [String(SUPPORTED_DEPOSIT_CHAINS.ARBITRUM)]: 1 },
          }
        : buildHlpBridge2Request({
            userAddress: input.userAddress,
            amountUsd6: shares.hlpUsd6.toString(),
          }),
    });
  }

  return drafts;
}

function capacityForShare(spendableUsd: number, bps: number): number {
  if (bps <= 0) return Number.POSITIVE_INFINITY;
  return spendableUsd / (bps / 10_000);
}

/**
 * Maximum total USD the current funding choices can support. HLP may choose
 * any one supported source; when it shares a token with Morpho/GMX, that
 * source's combined weight is used so the same wallet balance is never spent
 * twice in the capacity calculation.
 */
export function unifiedStrategyMaxTotalUsd(params: {
  allocation: UnifiedInvestAllocation;
  baseFundingToken: DesktopDepositToken;
  arbitrumFundingToken: DesktopDepositToken;
  rows: readonly ChainTokenBalanceRow[];
}): number | null {
  if (!isValidUnifiedAllocation(params.allocation)) return 0;

  const baseSpendable = spendableUsdForFundingToken(
    balanceForFundingToken(params.rows, params.baseFundingToken),
    params.baseFundingToken,
  );
  const arbitrumSpendable = spendableUsdForFundingToken(
    balanceForFundingToken(params.rows, params.arbitrumFundingToken),
    params.arbitrumFundingToken,
  );
  if (
    (params.allocation.morphoBps > 0 && baseSpendable === null) ||
    (params.allocation.gmxBps > 0 && arbitrumSpendable === null)
  ) {
    return null;
  }

  const morphoCapacity = capacityForShare(
    baseSpendable ?? 0,
    params.allocation.morphoBps,
  );
  const gmxCapacity = capacityForShare(
    arbitrumSpendable ?? 0,
    params.allocation.gmxBps,
  );
  const coreCapacity = Math.min(morphoCapacity, gmxCapacity);
  if (params.allocation.hlpBps <= 0) {
    return Number.isFinite(coreCapacity) ? Math.max(0, coreCapacity) : 0;
  }

  let best = 0;
  let sawUnknown = false;
  for (const token of HLP_SOURCE_TOKENS) {
    const spendable = spendableUsdForFundingToken(
      balanceForFundingToken(params.rows, token),
      token,
    );
    if (spendable === null) {
      sawUnknown = true;
      continue;
    }
    let combinedBps = params.allocation.hlpBps;
    if (sameFundingToken(token, params.baseFundingToken)) {
      combinedBps += params.allocation.morphoBps;
    }
    if (sameFundingToken(token, params.arbitrumFundingToken)) {
      combinedBps += params.allocation.gmxBps;
    }
    const candidate = Math.min(
      coreCapacity,
      capacityForShare(spendable, combinedBps),
    );
    if (Number.isFinite(candidate)) best = Math.max(best, candidate);
  }

  if (best <= 0 && sawUnknown) return null;
  return Math.max(0, best);
}