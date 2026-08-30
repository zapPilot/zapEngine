export { humanizeSlug } from '@zapengine/types/shared';

export function formatUsdAmount(
  amount: number,
  options: { fractionDigits?: number; includeSign?: boolean } = {},
): string {
  const { fractionDigits = 0, includeSign = false } = options;
  const magnitude = Math.abs(amount).toLocaleString('en-US', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });

  // The sign goes outside the symbol either way. A negative amount keeps its
  // sign even when includeSign is off: that flag asks for an explicit `+` on
  // gains, not for the magnitude alone.
  if (amount < 0) {
    return `-$${magnitude}`;
  }
  return includeSign && amount > 0 ? `+$${magnitude}` : `$${magnitude}`;
}
