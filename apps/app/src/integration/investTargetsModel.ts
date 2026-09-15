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

import { type DesktopDepositToken } from '@/integration/depositTokens';
import { ARBITRUM_GMX_BASKET_EXECUTION_FEE_WEI } from '@/integration/investAmountModel';

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
  venue: string;
  protocol: string;
  chainKey: import('@zapengine/brand-assets').ChainBrandKey;
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
    venue: 'Morpho USDC vault',
    protocol: 'morpho',
    chainKey: 'base',
    detail: 'Base · Morpho USDC vault',
    minUsd6: MIN_BASE_MORPHO_DEPOSIT_USD6,
  },
  {
    id: 'gmx-arbitrum',
    label: 'GMX',
    venue: 'Diversified GM basket',
    protocol: 'gmx-v2',
    chainKey: 'arbitrum',
    detail: 'Arbitrum · diversified GM basket',
    minUsd6: MIN_ARBITRUM_GMX_DEPOSIT_USD6,
  },
  {
    id: 'hlp',
    label: 'HLP',
    venue: 'Official HLP vault',
    protocol: 'hyperliquid',
    chainKey: 'hyperliquid',
    detail: 'Hyperliquid · official HLP vault',
    minUsd6: HLP_MIN_DEPOSIT_USD6,
  },
];

export interface TargetAllocation {
  positionId: InvestPositionId;
  weightBps: number;
}

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
 * The default sector mix puts 57% in HLP: its $10 floor requires $17.55.
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

export function hlpIngressFor(token: DesktopDepositToken): HlpIngress {
  return token.chainId === SUPPORTED_DEPOSIT_CHAINS.ARBITRUM &&
    token.symbol === 'USDC'
    ? 'bridge2'
    : 'lifi';
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
    const protocol = INVEST_POSITIONS.find(
      (position) => position.id === draft.positionId,
    )!.protocol;
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

export function chainBatchActionSummary(batch: ChainBatchDraft): string {
  return batch.positions
    .map((draft) =>
      draft.positionId === 'hlp'
        ? 'Bridge to Hyperliquid for HLP'
        : draft.positionId === 'gmx-arbitrum'
          ? 'Deposit into GMX GM basket'
          : 'Deposit into Morpho USDC vault',
    )
    .join(' · ');
}
