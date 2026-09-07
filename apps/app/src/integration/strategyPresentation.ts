import { getRegimeLabel } from '@zapengine/app-core/lib/domain/regime';
import { tokens } from '@zapengine/design-tokens/tokens';

import type { CompositionTarget } from '@/integration/useStrategySuggestion';

export function liveNumberOrDemo(
  value: unknown,
  demoValue: number | null,
  isDemo: boolean,
): number | null {
  if (typeof value === 'number') {
    return value;
  }
  return isDemo ? demoValue : null;
}

export function liveTextOrDemo(
  value: string | null | undefined,
  demoValue: string,
  isDemo: boolean,
): string {
  return value ?? (isDemo ? demoValue : '—');
}

export function demoTextOrDash(
  demoValue: string,
  isDemo: boolean,
  fallback = '—',
): string {
  return isDemo ? demoValue : fallback;
}

function marketModeLabelFor(
  regimeLabel: string,
  demoLabel: string,
  isDemo: boolean,
): string {
  if (regimeLabel) {
    return `Market mode · ${regimeLabel}`;
  }
  return isDemo ? demoLabel : 'Market mode · —';
}

export function currentModeLabelFor(
  regimeLabel: string,
  demoLabel: string,
  isDemo: boolean,
): string {
  if (regimeLabel) {
    return regimeLabel;
  }
  return demoTextOrDash(demoLabel, isDemo);
}

export function regimeDisplayFromRegime(
  regimeId: string | null | undefined,
  demoMarketModeLabel: string,
  isDemo: boolean,
): { regimeLabel: string; marketModeLabel: string } {
  const regimeLabel = regimeId ? getRegimeLabel(regimeId) : '';
  return {
    regimeLabel,
    marketModeLabel: marketModeLabelFor(
      regimeLabel,
      demoMarketModeLabel,
      isDemo,
    ),
  };
}

/** The three composition pillars, in display order, with their fixed swatch. */
const COMPOSITION_ROWS: {
  label: string;
  key: keyof CompositionTarget;
  color: string;
}[] = [
  { label: 'Equities', key: 'equities', color: tokens.color.pillar.spy },
  { label: 'Crypto', key: 'crypto', color: tokens.color.pillar.btc },
  { label: 'Stables', key: 'stables', color: tokens.color.pillar.usd },
];

/**
 * Shared shape builder for the strategy pillars (`weight`) and allocation
 * (`pct`, rounded) rows: both are the same three composition pillars against
 * a different numeric key.
 */
export function compositionRows<T extends { label: string; color: string }>(
  target: CompositionTarget | null,
  demoRows: T[],
  isDemo: boolean,
  { valueKey, round = false }: { valueKey: keyof T; round?: boolean },
): T[] {
  if (target) {
    return COMPOSITION_ROWS.map(
      (row) =>
        ({
          label: row.label,
          color: row.color,
          [valueKey]: round ? Math.round(target[row.key]) : target[row.key],
        }) as unknown as T,
    );
  }
  if (isDemo) {
    return demoRows;
  }
  return COMPOSITION_ROWS.map(
    (row) =>
      ({ label: row.label, color: row.color, [valueKey]: 0 }) as unknown as T,
  );
}
