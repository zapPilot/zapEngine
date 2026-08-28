export { humanizeSlug } from '@zapengine/types/shared';

export function formatUsdAmount(amount: number): string {
  return `$${amount.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}
