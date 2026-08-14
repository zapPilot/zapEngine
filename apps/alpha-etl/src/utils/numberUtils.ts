import { isFiniteNumber } from '@zapengine/types/shared';

export function toFiniteNumberOrNull(value: unknown): number | null {
  return isFiniteNumber(value) ? value : null;
}
