import { CHAIN_BRAND } from '@zapengine/brand-assets/chains';
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

export interface InvestPosition {
  id: InvestPositionId;
  label: string;
  /** Chain + venue, shown under the label on the allocation editor. */
  detail: string;
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
  },
  {
    id: 'gmx-arbitrum',
    label: 'GMX',
    venue: 'Diversified GM basket',
    protocol: 'gmx-v2',
    chainKey: 'arbitrum',
    detail: 'Arbitrum · diversified GM basket',
  },
  {
    id: 'hlp',
    label: 'HLP',
    venue: 'Official HLP vault',
    protocol: 'hyperliquid',
    chainKey: 'hyperliquid',
    detail: 'Hyperliquid · official HLP vault',
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

const USD6_PER_CENT = 10_000n;

/** How an HLP allocation reaches HyperCore. */
export type HlpIngress = 'bridge2' | 'lifi';

/** How the HLP share is funded: USDC already on HyperCore, or an EVM ingress. */
export type HlpFundingRoute = 'hypercore' | HlpIngress;

/**
 * The vault minimum is checked on LI.FI's quoted `toAmountMin`, i.e. the HLP
 * share less the bridge fee and our 50 bps slippage allowance. Live quotes near
 * $10 (2026-09-25) came in 25 bps under the share from Base USDC, ~96 from
 * Ethereum USDC, ~75 from Base ETH and up to ~122 from Arbitrum/Ethereum ETH.
 * 200 bps clears the worst with room for fee drift and for any gap between our
 * ETH price and LI.FI's. A quote that still falls short is refused at review
 * with `HLP_DEPOSIT_TOO_SMALL`.
 */
export const HLP_LIFI_HEADROOM_BPS = 200n;

/**
 * The HLP share a route needs for $10 to arrive. HyperCore and Bridge2 land
 * 1:1; only LI.FI loses value on the way. A share with no route yet has no
 * route cost to cover, so the vault's own minimum is all it can be held to.
 */
export function hlpMinimumShareUsd6(route: HlpFundingRoute | null): bigint {
  return route === 'lifi'
    ? ceilDiv(HLP_MIN_DEPOSIT_USD6 * 10_000n, 10_000n - HLP_LIFI_HEADROOM_BPS)
    : HLP_MIN_DEPOSIT_USD6;
}

/**
 * Smallest total whose HLP share still clears the vault's $10 floor on arrival
 * — the only deposit minimum in the mix, as neither Morpho nor GMX has one.
 * Rounded up to a whole cent so the figure the user reads is one they can
 * type: the default 57% HLP needs $17.55 over HyperCore or Bridge2 and $17.91
 * over LI.FI; 99% Stable (94.05% HLP) needs $10.64 and $10.85.
 */
export function targetMinimumUsd6(
  allocations: readonly TargetAllocation[],
  hlpRoute: HlpFundingRoute | null,
): bigint {
  if (!isValidTargetAllocation(allocations)) return 0n;
  const hlpBps = weightBpsFor(allocations, 'hlp');
  if (hlpBps <= 0) return 0n;
  const required = ceilDiv(
    hlpMinimumShareUsd6(hlpRoute) * 10_000n,
    BigInt(hlpBps),
  );
  return ceilDiv(required, USD6_PER_CENT) * USD6_PER_CENT;
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
