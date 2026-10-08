import { getRegimeLabel } from '@zapengine/app-core/lib/domain/regime';
import { tokens } from '@zapengine/design-tokens/tokens';

import type { CompositionTarget } from '@/integration/useStrategySuggestion';

/** Human-readable current market regime, or a dash when none is known. */
export function currentModeLabelFor(
  regimeId: string | null | undefined,
): string {
  return (regimeId && getRegimeLabel(regimeId)) || '—';
}

export interface CompositionRow {
  label: string;
  pct: number;
  color: string;
}

/** The three composition pillars, in display order, with their fixed swatch. */
const COMPOSITION_ROWS: {
  label: string;
  key: keyof CompositionTarget;
  color: string;
}[] = [
  { label: 'Equities', key: 'equities', color: tokens.sleeve.night.spy },
  { label: 'Crypto', key: 'crypto', color: tokens.sleeve.night.btc },
  { label: 'Stables', key: 'stables', color: tokens.sleeve.night.stable },
];

/**
 * Target allocation rows for the three composition pillars, as whole
 * percentages. Without a target every pillar reads 0% rather than an
 * invented allocation.
 */
export function compositionRows(
  target: CompositionTarget | null,
): CompositionRow[] {
  return COMPOSITION_ROWS.map((row) => ({
    label: row.label,
    color: row.color,
    pct: target ? Math.round(target[row.key]) : 0,
  }));
}
