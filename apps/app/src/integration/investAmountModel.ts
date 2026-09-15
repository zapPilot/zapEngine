import { GMX_V2_BASKET_EXECUTION_FEE_WEI } from '@zapengine/app-core/gmxFees';
import { parseBaseUnits } from '@zapengine/app-core/lib/wallet/usd6';

import type { ChainTokenBalanceRow } from '@/integration/walletTokens';
import type { DesktopDepositToken } from '@/integration/depositTokens';

const USD_INPUT_DECIMALS = 6;
export const ARBITRUM_GMX_BASKET_EXECUTION_FEE_WEI =
  GMX_V2_BASKET_EXECUTION_FEE_WEI;

/** Parse the grouped display amount (e.g. "1,000.50") to a number. */
function parseAmount(grouped: string): number {
  const parsed = Number(grouped.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function groupWholeDigits(digits: string): string {
  const normalized = digits.replace(/^0+(?=\d)/, '') || '0';
  const groups: string[] = [];

  for (let end = normalized.length; end > 0; end -= 3) {
    groups.unshift(normalized.slice(Math.max(0, end - 3), end));
  }

  return groups.join(',');
}

/** Normalizes direct keyboard input into a grouped amount string. */
export function normalizeAmountInput(input: string): string {
  const cleaned = input.replace(/,/g, '').replace(/[^\d.]/g, '');
  if (cleaned === '') {
    return '';
  }

  const [whole = '', ...fractionParts] = cleaned.split('.');
  const hasDecimal = cleaned.includes('.');
  const groupedWhole = groupWholeDigits(whole);

  if (!hasDecimal) {
    return groupedWhole;
  }

  return `${groupedWhole}.${fractionParts.join('').slice(0, USD_INPUT_DECIMALS)}`;
}

/** Preserve the exact six-decimal wallet capacity in the amount editor. */
export function usd6ToAmountInput(value: bigint): string {
  if (value <= 0n) return '';
  const fraction = (value % 1000000n)
    .toString()
    .padStart(6, '0')
    .replace(/0+$/u, '');
  return normalizeAmountInput(
    `${value / 1000000n}${fraction ? `.${fraction}` : ''}`,
  );
}
export function quickAmountUsdInput(value: bigint | null, bps: number): string {
  return value === null
    ? ''
    : usd6ToAmountInput(
        (value * BigInt(Math.max(0, Math.min(10000, Math.round(bps))))) /
          10000n,
      );
}

export function amountUsdFromInput(groupedAmount: string): number | null {
  const value = parseAmount(groupedAmount);
  return value > 0 ? value : null;
}

/** Convert a user-entered USD decimal to an exact 6-decimal integer string. */
export function amountInputToUsd6(groupedAmount: string): string {
  const parsed = parseBaseUnits(groupedAmount.replace(/,/gu, ''), {
    truncateExcessFraction: true,
    allowEmptyFraction: true,
  });
  return (parsed ?? 0n).toString();
}

export function balanceForFundingToken(
  rows: readonly ChainTokenBalanceRow[],
  token: DesktopDepositToken,
): ChainTokenBalanceRow | null {
  return (
    rows.find(
      (row) =>
        row.chainId === token.chainId && row.token.symbol === token.symbol,
    ) ?? null
  );
}

const USD_PRICE_SCALE = 1_000_000;

/**
 * Convert an exact USD6 amount into the selected token's base units.
 *
 * ETH uses a price rounded up to USD6 precision, then integer division. Both
 * rounding choices bias the result down so a frozen draft never asks the
 * wallet for more ETH than the entered USD amount implies.
 */
export function singleChainFromAmount(params: {
  totalUsd6: string;
  token: DesktopDepositToken;
  usdPrice: number | null;
}): string | null {
  if (!/^\d+$/u.test(params.totalUsd6)) return null;
  const totalUsd6 = BigInt(params.totalUsd6);
  if (totalUsd6 <= 0n) return null;

  if (
    (params.token.symbol === 'USDC' || params.token.symbol === 'USDT') &&
    params.token.decimals === 6
  ) {
    return totalUsd6.toString();
  }
  if (params.token.symbol !== 'ETH' || params.token.decimals !== 18) {
    return null;
  }
  if (
    params.usdPrice === null ||
    !Number.isFinite(params.usdPrice) ||
    params.usdPrice <= 0
  ) {
    return null;
  }

  const priceUsd6Number = Math.ceil(params.usdPrice * USD_PRICE_SCALE);
  if (!Number.isSafeInteger(priceUsd6Number) || priceUsd6Number <= 0) {
    return null;
  }
  const fromAmount =
    (totalUsd6 * 10n ** BigInt(params.token.decimals)) /
    BigInt(priceUsd6Number);
  return fromAmount > 0n ? fromAmount.toString() : null;
}
