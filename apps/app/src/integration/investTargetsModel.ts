import { CHAIN_BRAND } from '@zapengine/brand-assets';
import {
  type ChainBatchPosition,
  type ChainSplit,
  HLP_MIN_DEPOSIT_USD6,
  HYPERCORE_CHAIN_ID,
  type ReviewedDepositRequest,
  SUPPORTED_DEPOSIT_CHAINS,
} from '@zapengine/types/api';
import { formatEther } from 'viem';

import {
  ARBITRUM_DEPOSIT_TOKENS,
  BASE_DEPOSIT_TOKENS,
  ETHEREUM_DEPOSIT_TOKENS,
  type DesktopDepositToken,
} from '@/integration/depositTokens';
import {
  ARBITRUM_GMX_BASKET_EXECUTION_FEE_WEI,
  balanceForFundingToken,
  singleChainFromAmount,
  spendableUsdForFundingToken,
} from '@/integration/investAmountModel';
import type { ChainTokenBalanceRow } from '@/integration/walletTokens';

export type InvestPositionId = 'morpho-base' | 'gmx-arbitrum' | 'hlp';

/** Morpho accepts dust, so this floor only keeps the test deposit meaningful. */
const MIN_BASE_MORPHO_DEPOSIT_USD6 = 10_000n;
/** Below $1 the four GMX keeper fees dominate the deposit. */
const MIN_ARBITRUM_GMX_DEPOSIT_USD6 = 1_000_000n;

export interface InvestPosition {
  id: InvestPositionId;
  label: string;
  /** Chain + venue, shown under the label on the allocation editor. */
  detail: string;
  /** Smallest deposit this destination accepts, in 6-decimal USD. */
  minUsd6: bigint;
}

/**
 * The destinations one invest amount can fan out to, in execution order.
 * Destinations that draw on the same source chain are planned together and
 * become a single reviewed wallet batch.
 */
export const INVEST_POSITIONS: readonly InvestPosition[] = [
  {
    id: 'morpho-base',
    label: 'Morpho',
    detail: 'Base · Morpho USDC vault',
    minUsd6: MIN_BASE_MORPHO_DEPOSIT_USD6,
  },
  {
    id: 'gmx-arbitrum',
    label: 'GMX',
    detail: 'Arbitrum · diversified GM basket',
    minUsd6: MIN_ARBITRUM_GMX_DEPOSIT_USD6,
  },
  {
    id: 'hlp',
    label: 'HLP',
    detail: 'Hyperliquid · official HLP vault',
    minUsd6: HLP_MIN_DEPOSIT_USD6,
  },
];

export interface TargetAllocation {
  positionId: InvestPositionId;
  weightBps: number;
}

export const DEFAULT_TARGET_ALLOCATIONS: readonly TargetAllocation[] = [
  { positionId: 'morpho-base', weightBps: 4_000 },
  { positionId: 'gmx-arbitrum', weightBps: 3_500 },
  { positionId: 'hlp', weightBps: 2_500 },
];

/** Every HyperCore deposit names 1337 as its only destination. */
export const HYPERLIQUID_HLP_SPLIT: ChainSplit = {
  [String(HYPERCORE_CHAIN_ID)]: 1,
};

export type TargetUsd6Shares = Record<InvestPositionId, bigint>;

export function weightBpsFor(
  allocations: readonly TargetAllocation[],
  positionId: InvestPositionId,
): number {
  return (
    allocations.find((entry) => entry.positionId === positionId)?.weightBps ?? 0
  );
}

export function isValidTargetAllocation(
  allocations: readonly TargetAllocation[],
): boolean {
  if (allocations.length !== INVEST_POSITIONS.length) return false;
  const seen = new Set<InvestPositionId>();
  let total = 0;
  for (const entry of allocations) {
    if (seen.has(entry.positionId)) return false;
    seen.add(entry.positionId);
    if (
      !Number.isInteger(entry.weightBps) ||
      entry.weightBps < 0 ||
      entry.weightBps > 10_000
    ) {
      return false;
    }
    total += entry.weightBps;
  }
  return (
    total === 10_000 &&
    INVEST_POSITIONS.every((position) => seen.has(position.id))
  );
}

function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator - 1n) / denominator;
}

/**
 * Smallest total that keeps every funded destination above its own minimum.
 * The default 40/35/25 mix is driven by HLP's $10 floor: 10 / 0.25 = $40.
 */
export function targetMinimumUsd6(
  allocations: readonly TargetAllocation[],
): bigint {
  if (!isValidTargetAllocation(allocations)) return 0n;

  let minimum = 0n;
  for (const position of INVEST_POSITIONS) {
    const weightBps = weightBpsFor(allocations, position.id);
    if (weightBps <= 0) continue;
    const required = ceilDiv(position.minUsd6 * 10_000n, BigInt(weightBps));
    if (required > minimum) minimum = required;
  }
  return minimum;
}

/**
 * Split the total across the funded destinations. Floors each share and hands
 * the rounding remainder to the last funded destination so the shares always
 * add back up to the exact total the user entered.
 */
export function targetUsd6Shares(
  totalUsd6: string,
  allocations: readonly TargetAllocation[],
): TargetUsd6Shares | null {
  if (!/^\d+$/u.test(totalUsd6) || !isValidTargetAllocation(allocations)) {
    return null;
  }
  const total = BigInt(totalUsd6);
  if (total <= 0n) return null;

  const funded = INVEST_POSITIONS.map((position) => ({
    id: position.id,
    weightBps: weightBpsFor(allocations, position.id),
  })).filter((entry) => entry.weightBps > 0);
  if (funded.length === 0) return null;

  const shares: TargetUsd6Shares = {
    'morpho-base': 0n,
    'gmx-arbitrum': 0n,
    hlp: 0n,
  };
  let allocated = 0n;
  funded.forEach((entry, index) => {
    const amount =
      index === funded.length - 1
        ? total - allocated
        : (total * BigInt(entry.weightBps)) / 10_000n;
    allocated += amount;
    shares[entry.id] = amount;
  });
  return shares;
}

/** How an HLP allocation reaches HyperCore. */
export type HlpIngress = 'bridge2' | 'lifi';

/**
 * Every wallet token that can fund HLP on its own, most preferred first.
 * Native Arbitrum USDC leads because it is the one source the planner can hand
 * to Hyperliquid's own Bridge2 escrow at 1:1 with no bridge fee. USDT is
 * absent: the `invest` request schema accepts canonical USDC or native ETH
 * only.
 */
export const HLP_FUNDING_CANDIDATES: readonly DesktopDepositToken[] = [
  ARBITRUM_DEPOSIT_TOKENS[0],
  BASE_DEPOSIT_TOKENS[0],
  ETHEREUM_DEPOSIT_TOKENS[0],
  BASE_DEPOSIT_TOKENS[1],
  ARBITRUM_DEPOSIT_TOKENS[2],
  ETHEREUM_DEPOSIT_TOKENS[1],
];

export function hlpIngressFor(token: DesktopDepositToken): HlpIngress {
  return token.chainId === SUPPORTED_DEPOSIT_CHAINS.ARBITRUM &&
    token.symbol === 'USDC'
    ? 'bridge2'
    : 'lifi';
}

function sameToken(
  left: DesktopDepositToken,
  right: DesktopDepositToken,
): boolean {
  return (
    left.chainId === right.chainId &&
    left.depositAddress.toLowerCase() === right.depositAddress.toLowerCase()
  );
}

/** Stablecoins are $1 even when the balance row carries no quote. */
function usdPriceForToken(
  token: DesktopDepositToken,
  rows: readonly ChainTokenBalanceRow[],
): number | null {
  if (token.symbol === 'USDC' || token.symbol === 'USDT') return 1;
  return balanceForFundingToken(rows, token)?.usdPrice ?? null;
}

function usd6FromUsd(value: number): bigint | null {
  if (!Number.isFinite(value) || value < 0) return null;
  const scaled = Math.floor(value * 1_000_000);
  return Number.isSafeInteger(scaled) ? BigInt(scaled) : null;
}

export interface HlpFundingSource {
  token: DesktopDepositToken;
  ingress: HlpIngress;
  /** Source-token base units frozen for the HLP share. */
  fromAmount: string;
  spendableUsd6: bigint;
  /** Already claimed by Morpho/GMX when they draw on the same token. */
  reservedUsd6: bigint;
  availableUsd6: bigint;
}

/**
 * Pick the one wallet source that can fund the whole HLP share by itself.
 * Splitting HLP across chains would mean two bridges and two vault deposits,
 * so a candidate that only partly covers the share is rejected outright.
 */
export function selectHlpFundingSource(params: {
  shares: TargetUsd6Shares;
  baseFundingToken: DesktopDepositToken;
  arbitrumFundingToken: DesktopDepositToken;
  rows: readonly ChainTokenBalanceRow[];
}): HlpFundingSource | null {
  const required = params.shares.hlp;
  if (required <= 0n) return null;

  for (const token of HLP_FUNDING_CANDIDATES) {
    const spendableUsd = spendableUsdForFundingToken(
      balanceForFundingToken(params.rows, token),
      token,
    );
    if (spendableUsd === null) continue;
    const spendableUsd6 = usd6FromUsd(spendableUsd);
    if (spendableUsd6 === null || spendableUsd6 <= 0n) continue;

    let reservedUsd6 = 0n;
    if (sameToken(token, params.baseFundingToken)) {
      reservedUsd6 += params.shares['morpho-base'];
    }
    if (sameToken(token, params.arbitrumFundingToken)) {
      reservedUsd6 += params.shares['gmx-arbitrum'];
    }
    const availableUsd6 =
      spendableUsd6 > reservedUsd6 ? spendableUsd6 - reservedUsd6 : 0n;
    if (availableUsd6 < required) continue;

    const fromAmount = singleChainFromAmount({
      totalUsd6: required.toString(),
      token,
      usdPrice: usdPriceForToken(token, params.rows),
    });
    // A native candidate with no live quote cannot freeze an exact amount.
    if (fromAmount === null) continue;

    return {
      token,
      ingress: hlpIngressFor(token),
      fromAmount,
      spendableUsd6,
      reservedUsd6,
      availableUsd6,
    };
  }

  return null;
}

interface StageDraftShape {
  weightBps: number;
  /** This stage's share of the total, in 6-decimal USD. */
  usd6: string;
  sourceToken: DesktopDepositToken;
  /** Frozen source-token base units sent to plan-orchestration. */
  fromAmount: string;
}

export type StageDraft =
  | ({ positionId: 'morpho-base' } & StageDraftShape)
  | ({ positionId: 'gmx-arbitrum' } & StageDraftShape)
  | ({ positionId: 'hlp'; ingress: HlpIngress } & StageDraftShape);

export interface BuildStageDraftsInput {
  totalUsd6: string;
  allocations: readonly TargetAllocation[];
  baseFundingToken: DesktopDepositToken;
  arbitrumFundingToken: DesktopDepositToken;
  rows: readonly ChainTokenBalanceRow[];
}

/**
 * Freeze one executable stage per funded destination. Returns null when any
 * stage cannot be frozen — a partially funded plan would silently drop a
 * destination the user asked for.
 */
export function buildStageDrafts(
  input: BuildStageDraftsInput,
): StageDraft[] | null {
  const shares = targetUsd6Shares(input.totalUsd6, input.allocations);
  if (!shares) return null;

  const drafts: StageDraft[] = [];

  const morphoUsd6 = shares['morpho-base'];
  if (morphoUsd6 > 0n) {
    const fromAmount = singleChainFromAmount({
      totalUsd6: morphoUsd6.toString(),
      token: input.baseFundingToken,
      usdPrice: usdPriceForToken(input.baseFundingToken, input.rows),
    });
    if (fromAmount === null) return null;
    drafts.push({
      positionId: 'morpho-base',
      weightBps: weightBpsFor(input.allocations, 'morpho-base'),
      usd6: morphoUsd6.toString(),
      sourceToken: input.baseFundingToken,
      fromAmount,
    });
  }

  const gmxUsd6 = shares['gmx-arbitrum'];
  if (gmxUsd6 > 0n) {
    const fromAmount = singleChainFromAmount({
      totalUsd6: gmxUsd6.toString(),
      token: input.arbitrumFundingToken,
      usdPrice: usdPriceForToken(input.arbitrumFundingToken, input.rows),
    });
    if (fromAmount === null) return null;
    drafts.push({
      positionId: 'gmx-arbitrum',
      weightBps: weightBpsFor(input.allocations, 'gmx-arbitrum'),
      usd6: gmxUsd6.toString(),
      sourceToken: input.arbitrumFundingToken,
      fromAmount,
    });
  }

  if (shares.hlp > 0n) {
    const funding = selectHlpFundingSource({
      shares,
      baseFundingToken: input.baseFundingToken,
      arbitrumFundingToken: input.arbitrumFundingToken,
      rows: input.rows,
    });
    if (!funding) return null;
    drafts.push({
      positionId: 'hlp',
      ingress: funding.ingress,
      weightBps: weightBpsFor(input.allocations, 'hlp'),
      usd6: shares.hlp.toString(),
      sourceToken: funding.token,
      fromAmount: funding.fromAmount,
    });
  }

  return drafts.length > 0 ? drafts : null;
}

/** Every frozen stage funded from one source chain, in position order. */
export interface ChainBatchDraft {
  chainId: number;
  positions: StageDraft[];
}

/**
 * Group the frozen stages by source chain. One group is one reviewed wallet
 * batch and one checkpoint-queue entry, so this ordering — a chain takes the
 * place of the first position that funds from it — is also execution order.
 */
export function chainBatchDrafts(
  drafts: readonly StageDraft[],
): ChainBatchDraft[] {
  const batches: ChainBatchDraft[] = [];
  for (const draft of drafts) {
    const existing = batches.find(
      (batch) => batch.chainId === draft.sourceToken.chainId,
    );
    if (existing) {
      existing.positions.push(draft);
      continue;
    }
    batches.push({ chainId: draft.sourceToken.chainId, positions: [draft] });
  }
  return batches;
}

/** One destination inside a chain-batch request. */
export function positionRequest(draft: StageDraft): ChainBatchPosition {
  if (draft.positionId === 'gmx-arbitrum') {
    return {
      kind: 'gmx-v2-basket',
      fromToken: draft.sourceToken.depositAddress,
      amount: draft.fromAmount,
    };
  }
  return {
    kind: 'invest',
    fromToken: draft.sourceToken.depositAddress,
    fromAmount: draft.fromAmount,
    split:
      draft.positionId === 'hlp'
        ? HYPERLIQUID_HLP_SPLIT
        : { [String(SUPPORTED_DEPOSIT_CHAINS.BASE)]: 1 },
  };
}

/**
 * The exact plan-orchestration request one chain batch executes. A
 * single-position batch uses the same shape, so the client never has to decide
 * between two request kinds.
 */
export function chainBatchRequest(
  batch: ChainBatchDraft,
  userAddress: `0x${string}`,
): ReviewedDepositRequest {
  return {
    kind: 'chain-batch',
    userAddress,
    sourceChainId: batch.chainId,
    positions: batch.positions.map(positionRequest),
  };
}

/** Stable cache key for a frozen stage set. */
export function stageDraftsKey(drafts: readonly StageDraft[]): string {
  return drafts
    .map((draft) =>
      [
        draft.positionId,
        draft.sourceToken.chainId,
        draft.sourceToken.depositAddress,
        draft.fromAmount,
        draft.usd6,
      ].join(':'),
    )
    .join('|');
}

export function hlpRouteLabel(
  token: DesktopDepositToken,
  ingress: HlpIngress = hlpIngressFor(token),
): string {
  return ingress === 'bridge2'
    ? 'Arbitrum USDC → Hyperliquid Bridge2'
    : `${CHAIN_BRAND[token.chainKey].label} ${token.symbol} → Hyperliquid (LI.FI)`;
}

export function stageLabel(draft: StageDraft): string {
  if (draft.positionId === 'morpho-base') return 'Morpho · Base';
  if (draft.positionId === 'gmx-arbitrum') return 'GMX · Arbitrum';
  return `HLP · ${hlpRouteLabel(draft.sourceToken, draft.ingress)}`;
}

/** The `DepositLeg.protocol` each position's own legs carry. */
const POSITION_LEG_PROTOCOL: Record<InvestPositionId, string> = {
  'morpho-base': 'morpho',
  'gmx-arbitrum': 'gmx-v2',
  hlp: 'hyperliquid',
};

/**
 * Each venue's share of the whole invest amount, for the review chips. A merged
 * batch can fund two positions from different source tokens, so the chips
 * cannot derive their shares from leg amounts alone.
 */
export function batchProtocolWeightsBps(
  batch: ChainBatchDraft,
): Record<string, number> {
  const weights: Record<string, number> = {};
  for (const draft of batch.positions) {
    const protocol = POSITION_LEG_PROTOCOL[draft.positionId];
    weights[protocol] = (weights[protocol] ?? 0) + draft.weightBps;
  }
  return weights;
}

/** Heading for one reviewed batch, e.g. `Arbitrum · GMX + HLP`. */
export function chainBatchLabel(batch: ChainBatchDraft): string {
  const first = batch.positions[0];
  const chainLabel = first
    ? CHAIN_BRAND[first.sourceToken.chainKey].label
    : `Chain ${batch.chainId}`;
  const venues = batch.positions.map(
    (draft) =>
      INVEST_POSITIONS.find((position) => position.id === draft.positionId)
        ?.label ?? draft.positionId,
  );
  return `${chainLabel} · ${venues.join(' + ')}`;
}

function capacityForShare(spendableUsd: number, weightBps: number): number {
  if (weightBps <= 0) return Number.POSITIVE_INFINITY;
  return spendableUsd / (weightBps / 10_000);
}

/**
 * Display-only capacity for the current funding choices. HLP may use any one
 * supported source, so when it shares a token with Morpho or GMX the combined
 * weight is used and the same balance is never counted twice.
 */
export function targetMaxTotalUsd(params: {
  allocations: readonly TargetAllocation[];
  baseFundingToken: DesktopDepositToken;
  arbitrumFundingToken: DesktopDepositToken;
  rows: readonly ChainTokenBalanceRow[];
}): number | null {
  if (!isValidTargetAllocation(params.allocations)) return 0;

  const morphoBps = weightBpsFor(params.allocations, 'morpho-base');
  const gmxBps = weightBpsFor(params.allocations, 'gmx-arbitrum');
  const hlpBps = weightBpsFor(params.allocations, 'hlp');

  const baseSpendable = spendableUsdForFundingToken(
    balanceForFundingToken(params.rows, params.baseFundingToken),
    params.baseFundingToken,
  );
  const arbitrumSpendable = spendableUsdForFundingToken(
    balanceForFundingToken(params.rows, params.arbitrumFundingToken),
    params.arbitrumFundingToken,
  );
  if (
    (morphoBps > 0 && baseSpendable === null) ||
    (gmxBps > 0 && arbitrumSpendable === null)
  ) {
    return null;
  }

  const coreCapacity = Math.min(
    capacityForShare(baseSpendable ?? 0, morphoBps),
    capacityForShare(arbitrumSpendable ?? 0, gmxBps),
  );
  if (hlpBps <= 0) {
    return Number.isFinite(coreCapacity) ? Math.max(0, coreCapacity) : 0;
  }

  let best = 0;
  let sawUnknownPrice = false;
  for (const token of HLP_FUNDING_CANDIDATES) {
    const spendable = spendableUsdForFundingToken(
      balanceForFundingToken(params.rows, token),
      token,
    );
    if (spendable === null) {
      sawUnknownPrice = true;
      continue;
    }
    let combinedBps = hlpBps;
    if (sameToken(token, params.baseFundingToken)) combinedBps += morphoBps;
    if (sameToken(token, params.arbitrumFundingToken)) combinedBps += gmxBps;
    const candidate = Math.min(
      coreCapacity,
      capacityForShare(spendable, combinedBps),
    );
    if (Number.isFinite(candidate)) best = Math.max(best, candidate);
  }

  if (best <= 0 && sawUnknownPrice) return null;
  return Math.max(0, best);
}

/** Alchemy chain keys for the chains a funded allocation needs. */
export function requiredChainsUnavailable(
  allocations: readonly TargetAllocation[],
  failedChains: readonly string[],
  queryFailed: boolean,
): boolean {
  if (queryFailed) return true;
  if (
    weightBpsFor(allocations, 'morpho-base') > 0 &&
    failedChains.includes('base')
  ) {
    return true;
  }
  return (
    weightBpsFor(allocations, 'gmx-arbitrum') > 0 &&
    failedChains.includes('arbitrum')
  );
}

/**
 * Native-ETH GMX budgets pay four keeper execution fees out of the same
 * amount, so anything at or below the fee total invests nothing.
 */
export function gmxBasketBudgetTooSmall(draft: StageDraft): boolean {
  return (
    draft.positionId === 'gmx-arbitrum' &&
    draft.sourceToken.symbol === 'ETH' &&
    BigInt(draft.fromAmount) <= ARBITRUM_GMX_BASKET_EXECUTION_FEE_WEI
  );
}

export const GMX_BASKET_EXECUTION_FEE_LABEL = `${formatEther(
  ARBITRUM_GMX_BASKET_EXECUTION_FEE_WEI,
)} ETH`;

/** Keeps a partially typed percentage (`"12."`) editable. */
export function normalizePercentInput(input: string): string {
  const cleaned = input.replace(/[^\d.]/gu, '');
  if (cleaned === '') return '';
  const [whole = '', ...fractionParts] = cleaned.split('.');
  const hasDecimal = cleaned.includes('.');
  const fraction = fractionParts.join('').slice(0, 2);
  const wholeNumber = Math.min(100, Number(whole || '0'));
  if (wholeNumber >= 100) return '100';
  const normalizedWhole = whole === '' ? '' : String(wholeNumber);
  return hasDecimal ? `${normalizedWhole}.${fraction}` : normalizedWhole;
}

export function percentInputToBps(input: string): number {
  const parsed = Number(input === '' || input === '.' ? '0' : input);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(10_000, Math.round(parsed * 100)));
}

export function bpsToPercentInput(bps: number): string {
  const percent = bps / 100;
  return Number.isInteger(percent)
    ? String(percent)
    : percent.toFixed(2).replace(/0+$/u, '');
}
