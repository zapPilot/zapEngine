import {
  INVEST_POSITIONS,
  targetUsd6Shares,
  bpsToPercentInput,
  type InvestPositionId,
  type StageDraft,
  type TargetAllocation,
} from '@/integration/investTargetsModel';

export type InvestSectorId = 'crypto' | 'stable' | 'sp500';
export interface InvestSector {
  id: InvestSectorId;
  label: string;
  description: string;
  colorKey: 'btc' | 'usd' | 'spy';
  executable: boolean;
  lockedReason: string | null;
  positions: { positionId: InvestPositionId; intraBps: number }[];
}
export const INVEST_SECTORS: readonly InvestSector[] = [
  {
    id: 'crypto',
    label: 'Crypto',
    description: 'BTC and ETH market exposure',
    colorKey: 'btc',
    executable: true,
    lockedReason: null,
    positions: [{ positionId: 'gmx-arbitrum', intraBps: 10000 }],
  },
  {
    id: 'stable',
    label: 'Stable',
    description: 'Dollar-denominated yield',
    colorKey: 'usd',
    executable: true,
    lockedReason: null,
    positions: [
      { positionId: 'morpho-base', intraBps: 6000 },
      { positionId: 'hlp', intraBps: 4000 },
    ],
  },
  {
    id: 'sp500',
    label: 'S&P 500',
    description: 'US equities exposure',
    colorKey: 'spy',
    executable: false,
    lockedReason:
      'No executable S&P 500 position is live yet, so this sector stays at 0%.',
    positions: [],
  },
];
export type SectorWeights = Record<InvestSectorId, number>;
export const DEFAULT_SECTOR_WEIGHTS: SectorWeights = {
  crypto: 4000,
  stable: 6000,
  sp500: 0,
};
export function isValidSectorWeights(
  weights: SectorWeights,
  sectors = INVEST_SECTORS,
): boolean {
  return (
    sectors.every(
      (s) =>
        Number.isInteger(weights[s.id]) &&
        weights[s.id] >= 0 &&
        weights[s.id] <= 10000 &&
        (s.executable || weights[s.id] === 0),
    ) && Object.values(weights).reduce((a, b) => a + b, 0) === 10000
  );
}
export function isDefaultSectorWeights(weights: SectorWeights): boolean {
  return INVEST_SECTORS.every(
    (s) => weights[s.id] === DEFAULT_SECTOR_WEIGHTS[s.id],
  );
}
function distributeLargestRemainder(
  raw: readonly number[],
  total: number,
): number[] {
  const sum = raw.reduce((a, b) => a + b, 0);
  const exact = raw.map((v) =>
    sum === 0 ? total / raw.length : (v * total) / sum,
  );
  const result = exact.map(Math.floor);
  const order = exact
    .map((v, i) => ({ i, remainder: v - result[i]! }))
    .sort((a, b) => b.remainder - a.remainder || a.i - b.i);
  const left = total - result.reduce((a, b) => a + b, 0);
  for (let i = 0; i < left; i++) result[order[i]!.i]!++;
  return result;
}
export function rebalanceSectorWeights(
  current: SectorWeights,
  editedId: InvestSectorId,
  newBps: number,
  sectors = INVEST_SECTORS,
): SectorWeights {
  if (!sectors.find((s) => s.id === editedId)?.executable) return current;
  const locked = sectors
    .filter((s) => !s.executable)
    .reduce((n, s) => n + current[s.id], 0);
  const next = Math.max(
    0,
    Math.min(10000 - locked, Number.isFinite(newBps) ? Math.round(newBps) : 0),
  );
  const others = sectors.filter((s) => s.executable && s.id !== editedId);
  const shares = distributeLargestRemainder(
    others.map((s) => current[s.id]),
    10000 - locked - next,
  );
  const result = { ...current, [editedId]: next };
  others.forEach((s, i) => {
    result[s.id] = shares[i]!;
  });
  return result;
}
export function resolveTargetAllocations(
  weights: SectorWeights,
  sectors = INVEST_SECTORS,
): TargetAllocation[] {
  if (!isValidSectorWeights(weights, sectors))
    throw new Error('Invalid sector weights');
  const raw = INVEST_POSITIONS.map((p) =>
    sectors.reduce(
      (n, s) =>
        n +
        weights[s.id] *
          (s.positions.find((x) => x.positionId === p.id)?.intraBps ?? 0),
      0,
    ),
  );
  const bps = distributeLargestRemainder(raw, 10000);
  return INVEST_POSITIONS.map((p, i) => ({
    positionId: p.id,
    weightBps: bps[i]!,
  }));
}
export function sectorForPosition(positionId: InvestPositionId): InvestSector {
  return INVEST_SECTORS.find((s) =>
    s.positions.some((p) => p.positionId === positionId),
  )!;
}
export function sectorUsd6Shares(
  totalUsd6: string,
  weights: SectorWeights,
): Record<InvestSectorId, bigint> {
  const shares = targetUsd6Shares(totalUsd6, resolveTargetAllocations(weights));
  return Object.fromEntries(
    INVEST_SECTORS.map((s) => [
      s.id,
      s.positions.reduce((n, p) => n + (shares?.[p.positionId] ?? 0n), 0n),
    ]),
  ) as Record<InvestSectorId, bigint>;
}
export function sectorWeightsFromDrafts(
  drafts: readonly StageDraft[],
): SectorWeights {
  const result: SectorWeights = { crypto: 0, stable: 0, sp500: 0 };
  for (const d of drafts)
    result[sectorForPosition(d.positionId).id] += d.weightBps;
  return result;
}
export function sectorAllocationSummary(weights: SectorWeights): string {
  return INVEST_SECTORS.map(
    (s) => `${s.label} ${bpsToPercentInput(weights[s.id])}%`,
  ).join(', ');
}
