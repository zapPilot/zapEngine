export interface CompactTokenAmountOptions {
  /**
   * `significant` keeps six fractional digits after any leading zeros for
   * tiny values; `decimal-places` caps the fraction at six places.
   */
  fractionPrecision?: 'significant' | 'decimal-places';
}

function trimTrailingZeros(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === '0') {
    end -= 1;
  }
  return value.slice(0, end);
}

function firstSignificantDigit(value: string): number {
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== '0') return index;
  }
  return -1;
}

/**
 * Renders an integer base-unit amount as an exact decimal string, with no
 * floating-point conversion and no precision cap.
 */
export function formatTokenBaseUnits(
  rawAmount: string | bigint,
  decimals: number,
): string {
  const raw = String(rawAmount);
  const negative = raw.startsWith('-');
  const digits = negative ? raw.slice(1) : raw;
  const padded = digits.padStart(decimals + 1, '0');
  const integer = decimals === 0 ? padded : padded.slice(0, -decimals);
  const fractionRaw = decimals === 0 ? '' : padded.slice(-decimals);
  const fraction = trimTrailingZeros(fractionRaw);
  return `${negative ? '-' : ''}${integer}${fraction ? `.${fraction}` : ''}`;
}

/** Formats an integer base-unit token amount without floating-point loss. */
export function formatCompactTokenAmount(
  rawAmount: string | bigint,
  decimals: number,
  { fractionPrecision = 'significant' }: CompactTokenAmountOptions = {},
): string {
  const exact = formatTokenBaseUnits(rawAmount, decimals);
  const negative = exact.startsWith('-');
  const unsigned = negative ? exact.slice(1) : exact;
  const [integer = '0', fraction] = unsigned.split('.');
  if (!fraction) return exact;

  const firstSignificant = firstSignificantDigit(fraction);
  const visibleFractionLength =
    fractionPrecision === 'significant' &&
    integer === '0' &&
    firstSignificant >= 0
      ? firstSignificant + 6
      : 6;
  const visibleFraction = trimTrailingZeros(
    fraction.slice(0, visibleFractionLength),
  );
  return `${negative ? '-' : ''}${integer}${
    visibleFraction ? `.${visibleFraction}` : ''
  }`;
}
