export { humanizeSlug } from '@zapengine/types/shared';

export function formatUsdAmount(
  amount: number,
  options: { fractionDigits?: number; includeSign?: boolean } = {},
): string {
  const { fractionDigits = 0, includeSign = false } = options;
  const absolute = Math.abs(amount).toLocaleString('en-US', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
  const formatted = `$${absolute}`;

  if (!includeSign || amount === 0) {
    return formatted;
  }

  return amount > 0 ? `+${formatted}` : `-${formatted}`;
}
