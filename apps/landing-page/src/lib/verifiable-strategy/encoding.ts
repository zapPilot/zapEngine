import { formatUnits, parseUnits } from 'viem';
import type { CalculatorInput, Example } from './types';

export const WAD = 10n ** 18n;
export const ASSETS = ['SPY', 'BTC', 'ETH'] as const;
export const ALLOCATION_ASSETS = [
  'BTC',
  'ETH',
  'SPY',
  'Stable',
  'Alt',
] as const;

function exactUnits(value: string, decimals: number): bigint {
  if (!new RegExp(`^\\d+(?:\\.\\d{1,${decimals}})?$`).test(value))
    throw new Error(
      `Enter a nonnegative decimal with at most ${decimals} places`,
    );
  const result = parseUnits(value, decimals);
  if (result >= 2n ** 256n) throw new Error('Value exceeds uint256');
  return result;
}
export const decimalToWad = (value: string) => exactUnits(value, 18);
export function percentToWad(value: string): bigint {
  const result = exactUnits(value, 16);
  if (result > WAD) throw new Error('Allocation must be between 0 and 100%');
  return result;
}
export const wadToPercent = (value: bigint) => formatUnits(value, 16);
export function epochDay(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new Error('Use a YYYY-MM-DD date');
  const ms = Date.parse(`${value}T00:00:00Z`);
  if (
    !Number.isFinite(ms) ||
    new Date(ms).toISOString().slice(0, 10) !== value ||
    ms <= 0
  )
    throw new Error('Invalid epoch date');
  return ms / 86400000;
}
export function inputFromExample(example: Example): CalculatorInput {
  const prices = (rows: Example['current']) =>
    rows.map((row) => ({ price: row.price.decimal, dma: row.dma.decimal }));
  return {
    date: example.date,
    previousDate: example.previousDate,
    previous: prices(example.previous),
    current: prices(example.current),
    allocation: example.allocation.map((value) =>
      wadToPercent(BigInt(value.wad)),
    ),
    lastExecutedDay: example.lastExecutedDay,
    crossOnTouch: example.crossOnTouch,
    stateMode: example.stateMode,
    priorStates: example.priorStates,
  };
}
export function encodeInputs(input: CalculatorInput) {
  const day = epochDay(input.date);
  if (epochDay(input.previousDate) !== day - 1)
    throw new Error('Warmup must use the previous calendar day');
  const obs = (values: CalculatorInput['current']) => {
    if (values.length !== 3) throw new Error('Three assets required');
    return values.map((value) => {
      const price = decimalToWad(value.price),
        dma = decimalToWad(value.dma);
      if (price > (2n ** 255n - 1n) / WAD || dma > (2n ** 255n - 1n) / WAD)
        throw new Error('Price or DMA exceeds safe slice range');
      return { price, dma };
    });
  };
  if (input.allocation.length !== 5)
    throw new Error('Five allocation buckets required');
  const allocation = input.allocation.map(percentToWad);
  // Python round-trip decimal weights may sum slightly above or below one.
  // Apply the same 1e-12 per-allocation precision used by the example export.
  const delta = allocation.reduce((a, b) => a + b, 0n) - WAD;
  if (delta < -1000000n || delta > 1000000n)
    throw new Error('Allocation must total 100%');
  if (
    !Number.isInteger(input.lastExecutedDay) ||
    input.lastExecutedDay < 0 ||
    input.lastExecutedDay > day
  )
    throw new Error('Invalid last execution day');
  return {
    day,
    previous: obs(input.previous),
    current: obs(input.current),
    allocation,
  };
}
