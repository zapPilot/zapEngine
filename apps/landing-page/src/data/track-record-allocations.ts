/**
 * The daily asset weights the backtest held, for the demo dataset.
 *
 * The chart never imports this: it reads allocation off the snapshots it is
 * already handed, so the demo and live paths render through one code path. This
 * module exists to seed the demo snapshots with the weights the backtest
 * actually held, replacing a static three-pillar split that contradicted the
 * trade markers drawn on the same page.
 *
 * Rows are positional against `series[0].values` and carry no dates of their
 * own — see the `allocations` comment in scripts/landing/equity_curve.py for
 * why, and the Python-side length check that holds the alignment.
 */
import equityCurveRaw from '@/data/equity-curve.json';

export interface AllocationWeights {
  /** Percentage points, the unit `Position.weight` is written in. */
  readonly btc: number;
  readonly eth: number;
  readonly spy: number;
  readonly stable: number;
}

/** Column order is part of the artifact contract, not a convention. */
const ALLOCATION_ASSETS = ['btc', 'eth', 'spy', 'stable'] as const;

const BOOK_TOTAL_TOLERANCE = 0.001;

function toPercent(fraction: number): number {
  // The artifact rounds to 4dp, which is exactly 2dp as a percentage.
  return Math.round(fraction * 10000) / 100;
}

/**
 * Parse one row per strategy point, or reject the entire artifact. Keeping this
 * pure lets tests exercise truncated and malformed inputs instead of only the
 * committed happy-path JSON.
 */
export function parseDailyAllocations(
  raw: unknown,
  expectedLength: number,
): readonly AllocationWeights[] {
  if (!Number.isInteger(expectedLength) || expectedLength < 0) return [];
  if (typeof raw !== 'object' || raw === null) return [];

  const { assets, values } = raw as { assets?: unknown; values?: unknown };
  if (!Array.isArray(assets) || !Array.isArray(values)) return [];
  if (
    assets.length !== ALLOCATION_ASSETS.length ||
    ALLOCATION_ASSETS.some((asset, index) => assets[index] !== asset) ||
    values.length !== expectedLength
  ) {
    return [];
  }

  const rows: AllocationWeights[] = [];
  for (const row of values) {
    if (!Array.isArray(row) || row.length !== ALLOCATION_ASSETS.length) {
      return [];
    }
    if (
      !row.every(
        (weight) =>
          typeof weight === 'number' &&
          Number.isFinite(weight) &&
          weight >= 0 &&
          weight <= 1,
      )
    ) {
      return [];
    }

    const valuesAsNumbers = row as number[];
    const total = valuesAsNumbers.reduce((sum, weight) => sum + weight, 0);
    if (Math.abs(total - 1) > BOOK_TOTAL_TOLERANCE) return [];

    const [btc, eth, spy, stable] = valuesAsNumbers;
    rows.push({
      btc: toPercent(btc!),
      eth: toPercent(eth!),
      spy: toPercent(spy!),
      stable: toPercent(stable!),
    });
  }
  return rows;
}

/**
 * One row per strategy series point, or `[]` when the artifact predates the
 * field or fails any validation. All-or-nothing on purpose: half-populated
 * weights would drive a chart that looks authoritative and is not.
 */
export function demoDailyAllocations(): readonly AllocationWeights[] {
  const artifact = equityCurveRaw as {
    allocations?: unknown;
    series?: Array<{ values?: unknown }>;
  };
  const strategyValues = artifact.series?.[0]?.values;
  if (!Array.isArray(strategyValues)) return [];
  return parseDailyAllocations(artifact.allocations, strategyValues.length);
}
