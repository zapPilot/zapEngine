/**
 * 6-decimal USDC base-unit helpers. String math only — these sit on the
 * money path where float rounding is not acceptable.
 */

/** '49500000' (or 49500000n) → '49.50'. */
export function formatUsd6(value: bigint, fractionDigits = 2): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / 1_000_000n;
  const fraction = (abs % 1_000_000n)
    .toString()
    .padStart(6, '0')
    .slice(0, fractionDigits);
  const sign = negative ? '-' : '';
  return fractionDigits > 0 ? `${sign}${whole}.${fraction}` : `${sign}${whole}`;
}

/** User input like '100' or '99.5' → 6-decimal base units ('100000000'). */
export function parseUsdcInput(value: string): string {
  const match = /^(\d+)(?:\.(\d{1,6}))?$/.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid USDC amount: ${value}`);
  }
  const fraction = (match[2] ?? '').padEnd(6, '0');
  return (BigInt(match[1] ?? '0') * 1_000_000n + BigInt(fraction)).toString();
}
