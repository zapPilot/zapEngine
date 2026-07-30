import type { PreparedTransaction } from '@zapengine/types/api';

const USD_DECIMALS = 6n;
const USD_SCALE = 10n ** USD_DECIMALS;
const PRICE_SCALE = 10n ** 12n;
const WEI_SCALE = 10n ** 18n;

function hasOnlyAsciiDigits(input: string): boolean {
  return (
    input.length > 0 &&
    [...input].every((character) => character >= '0' && character <= '9')
  );
}

function trimTrailingZeros(input: string): string {
  let end = input.length;
  while (end > 0 && input[end - 1] === '0') {
    end -= 1;
  }
  return input.slice(0, end);
}

function decimalToScaledInteger(value: string, scale: bigint): bigint {
  const parts = value.trim().split('.');
  const whole = parts[0] ?? '';
  const decimal = parts[1] ?? '';
  if (
    parts.length > 2 ||
    !hasOnlyAsciiDigits(whole) ||
    (parts.length === 2 && !hasOnlyAsciiDigits(decimal))
  ) {
    throw new Error(`Invalid decimal value: ${value}`);
  }

  const scaleDigits = scale.toString().length - 1;
  const fraction = decimal.slice(0, scaleDigits).padEnd(scaleDigits, '0');
  return BigInt(whole) * scale + BigInt(fraction || '0');
}

export function tokenAmountFromUsd(params: {
  usd6: bigint;
  decimals: number;
  priceUsd: string;
}): string {
  const price = decimalToScaledInteger(params.priceUsd, PRICE_SCALE);
  if (price <= 0n) {
    throw new Error('Funding token price must be greater than zero');
  }

  const amount =
    (params.usd6 * 10n ** BigInt(params.decimals) * PRICE_SCALE) /
    (USD_SCALE * price);
  if (amount <= 0n) {
    throw new Error('Strategy allocation is too small for the funding token');
  }
  return amount.toString();
}

function scaledIntegerToDecimal(value: bigint, scaleDigits: number): string {
  const scale = 10n ** BigInt(scaleDigits);
  const whole = value / scale;
  const fraction = (value % scale).toString().padStart(scaleDigits, '0');
  const trimmedFraction = trimTrailingZeros(fraction);
  return trimmedFraction ? `${whole}.${trimmedFraction}` : whole.toString();
}

export function sumGasUsd(values: readonly string[]): string {
  const totalUsd6 = values.reduce(
    (sum, value) => sum + decimalToScaledInteger(value || '0', USD_SCALE),
    0n,
  );
  return scaledIntegerToDecimal(totalUsd6, Number(USD_DECIMALS));
}

export function transactionGasUnits(
  transactions: readonly PreparedTransaction[],
): bigint {
  return transactions.reduce((total, transaction) => {
    const estimate = transaction.gasLimit ?? transaction.meta.estimatedGas;
    if (!estimate) {
      throw new Error(
        `Missing gas estimate for ${transaction.meta.intentType} transaction`,
      );
    }
    return total + BigInt(estimate);
  }, 0n);
}

export function gasUsdFromUnits(params: {
  gasUnits: bigint;
  gasPriceWei: bigint;
  nativePriceUsd: string;
}): string {
  const nativePrice = decimalToScaledInteger(
    params.nativePriceUsd,
    PRICE_SCALE,
  );
  if (params.gasPriceWei <= 0n || nativePrice <= 0n) {
    throw new Error('Chain gas price inputs must be greater than zero');
  }

  const denominator = WEI_SCALE * PRICE_SCALE;
  const numerator =
    params.gasUnits * params.gasPriceWei * nativePrice * USD_SCALE;
  const usd6 = (numerator + denominator - 1n) / denominator;
  return scaledIntegerToDecimal(usd6, Number(USD_DECIMALS));
}
