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
    rows.map((row) => ({
      price: formatUnits(BigInt(row.price.wad), 18),
      dma: formatUnits(BigInt(row.dma.wad), 18),
    }));
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

export function dateFromDay(day: number): string {
  return day === 0 ? '' : new Date(day * 86400000).toISOString().slice(0, 10);
}
export function dayFromDate(date: string): number {
  return date === '' ? 0 : epochDay(date);
}

export function validateInput(input: CalculatorInput): Record<string, string> {
  const errors: Record<string, string> = {};
  const check = (key: string, run: () => unknown) => {
    try {
      run();
    } catch (error) {
      errors[key] = error instanceof Error ? error.message : 'Invalid input';
    }
  };
  check('date', () => epochDay(input.date));
  check('previousDate', () => {
    if (epochDay(input.previousDate) !== epochDay(input.date) - 1)
      throw new Error('Warmup must use the previous calendar day');
  });
  for (const period of ['previous', 'current'] as const) {
    input[period].forEach((row, index) => {
      for (const field of ['price', 'dma'] as const) {
        check(`${period}.${index}.${field}`, () => {
          const value = decimalToWad(row[field]);
          if (value > (2n ** 255n - 1n) / WAD)
            throw new Error('Price or DMA exceeds safe slice range');
        });
      }
    });
  }
  input.allocation.forEach((value, index) =>
    check(`allocation.${index}`, () => percentToWad(value)),
  );
  check('allocation', () => {
    const total = input.allocation
      .map(percentToWad)
      .reduce((a, b) => a + b, 0n);
    if (total < WAD - 1000000n || total > WAD + 1000000n)
      throw new Error(`Total is ${wadToPercent(total)}%, must be 100%`);
  });
  check('lastExecutedDay', () => {
    if (
      !Number.isInteger(input.lastExecutedDay) ||
      input.lastExecutedDay < 0 ||
      input.lastExecutedDay > epochDay(input.date)
    )
      throw new Error('Last exit must be on or before the decision day');
  });
  return errors;
}

// Presentation only: signed basis points from input prices, never a cross decision.
export function distancePercent(
  row: CalculatorInput['current'][number],
): string | null {
  try {
    const price = decimalToWad(row.price),
      dma = decimalToWad(row.dma);
    if (price === 0n || dma === 0n) return null;
    const points = ((price - dma) * 10000n) / dma;
    const absolute = points < 0n ? -points : points;
    return `${points < 0n ? '−' : '+'}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, '0')}%`;
  } catch {
    return null;
  }
}

export function previousDate(date: string): string {
  try {
    return dateFromDay(epochDay(date) - 1);
  } catch {
    return '';
  }
}

// Display-only rounding for idle inputs; the raw string is what gets encoded.
export function displayDecimal(value: string, fraction = 2): string {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) return value;
  const whole = match[1]!;
  const digits = match[2] ?? '';
  const scaled = BigInt(
    whole + digits.padEnd(fraction + 1, '0').slice(0, fraction + 1),
  );
  const rounded = ((scaled + 5n) / 10n).toString().padStart(fraction + 1, '0');
  if (/^0+$/.test(rounded) && /[1-9]/.test(digits))
    return `<0.${'1'.padStart(fraction, '0')}`;
  const integer = rounded
    .slice(0, rounded.length - fraction)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fraction ? `${integer}.${rounded.slice(-fraction)}` : integer;
}

// BTC/ETH/SPY/Stable shares with Alt folded into Stable, as the contract does.
export function foldAllocation(percents: readonly string[]): bigint[] {
  const wad = percents.map((value) => {
    try {
      return percentToWad(value);
    } catch {
      return 0n;
    }
  });
  return [
    wad[0] ?? 0n,
    wad[1] ?? 0n,
    wad[2] ?? 0n,
    (wad[3] ?? 0n) + (wad[4] ?? 0n),
  ];
}
