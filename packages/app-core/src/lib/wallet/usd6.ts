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

export interface ParseBaseUnitsOptions {
  /** Base-unit scale of the target amount. Default 6 (USDC). */
  decimals?: number;
  /**
   * Accept fraction digits beyond `decimals` and drop the extras. When false
   * (default) such input is rejected outright.
   */
  truncateExcessFraction?: boolean;
  /** Accept a bare trailing separator (`'12.'`) as a whole number. */
  allowEmptyFraction?: boolean;
}

/**
 * Parse an unsigned plain-decimal string into integer base units.
 *
 * Returns `null` for anything that is not such a string (empty, signed,
 * exponent notation, stray characters) so each caller can pick its own failure
 * mode — throwing or falling back to zero.
 */
const DIGITS = /^\d+$/u;

export function parseBaseUnits(
  value: string,
  {
    decimals = 6,
    truncateExcessFraction = false,
    allowEmptyFraction = false,
  }: ParseBaseUnitsOptions = {},
): bigint | null {
  const [whole, fraction, ...extra] = value.split('.');
  if (extra.length > 0 || whole === undefined || !DIGITS.test(whole)) {
    return null;
  }

  if (fraction !== undefined) {
    if (fraction.length === 0) {
      if (!allowEmptyFraction) return null;
    } else if (!DIGITS.test(fraction)) {
      return null;
    } else if (!truncateExcessFraction && fraction.length > decimals) {
      return null;
    }
  }

  const scaled = (fraction ?? '').slice(0, decimals).padEnd(decimals, '0');
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(scaled);
}

/** User input like '100' or '99.5' → 6-decimal base units ('100000000'). */
export function parseUsdcInput(value: string): string {
  const parsed = parseBaseUnits(value.trim());
  if (parsed === null) {
    throw new Error(`Invalid USDC amount: ${value}`);
  }
  return parsed.toString();
}
