import type { OperationalSignal } from '../../../shared/types.js';

/**
 * Signal evidence is deliberately untyped scalars, so every reader has to agree
 * on what counts as a number. A NaN or Infinity that slipped past an adapter
 * must read as "not reported" rather than skew a score or a safety decision.
 */
export function evidenceNumber(
  signal: OperationalSignal,
  key: string,
): number | null {
  const value = signal.evidence[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
