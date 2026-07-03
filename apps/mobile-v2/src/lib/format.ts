/** Display formatters for the desktop UI (demo + live phases share these). */

export function formatUsd(value: number, decimals = 2): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Split a USD amount into a whole part and a `.dd` fraction for the
 * serif-display treatment used across the design (dimmed decimals). */
export function splitUsd(value: number): { whole: string; fraction: string } {
  const [whole = '0', fraction = '00'] = formatUsd(value).split('.');
  return { whole, fraction: `.${fraction}` };
}

export function formatSignedPct(value: number, decimals = 1): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${Math.abs(value).toFixed(decimals)}%`;
}

export function formatSignedUsd(value: number, decimals = 2): string {
  const sign = value >= 0 ? '+' : '−';
  return `${sign}${formatUsd(Math.abs(value), decimals)}`;
}

export function truncateAddress(
  address: string,
  prefix = 6,
  suffix = 4,
): string {
  if (address.length <= prefix + suffix + 1) {
    return address;
  }
  return `${address.slice(0, prefix)}…${address.slice(-suffix)}`;
}
