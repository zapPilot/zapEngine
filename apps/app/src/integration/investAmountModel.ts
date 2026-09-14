import { GMX_V2_BASKET_EXECUTION_FEE_WEI } from '@zapengine/app-core/gmxFees';
import { parseBaseUnits } from '@zapengine/app-core/lib/wallet/usd6';
import { CHAIN_BRAND } from '@zapengine/brand-assets';

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

/** Floors a computed wallet capacity to the same precision accepted on-chain. */
export function maxUsdAmountInput(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '';

  const scaled = Math.floor(value * 10 ** USD_INPUT_DECIMALS);
  if (!Number.isSafeInteger(scaled) || scaled <= 0) return '';

  const whole = Math.floor(scaled / 10 ** USD_INPUT_DECIMALS);
  const fraction = String(scaled % 10 ** USD_INPUT_DECIMALS)
    .padStart(USD_INPUT_DECIMALS, '0')
    .replace(/0+$/u, '');
  return normalizeAmountInput(
    fraction ? `${whole}.${fraction}` : String(whole),
  );
}

/** Grouped USD input for a basis-point share of the wallet capacity. */
export function quickAmountUsdInput(
  maxTotalUsd: number | null,
  bps: number,
): string {
  if (maxTotalUsd === null) return '';
  if (bps >= 10_000) return maxUsdAmountInput(maxTotalUsd);
  return maxUsdAmountInput((maxTotalUsd * bps) / 10_000);
}

export function amountUsdFromInput(groupedAmount: string): number | null {
  const value = parseAmount(groupedAmount);
  return value > 0 ? value : null;
}

// Stablecoins are worth $1 when the balance row carries no quote of its own.
function usableUsdPrice(
  token: DesktopDepositToken,
  row: ChainTokenBalanceRow | null,
): number | null {
  const price =
    row?.usdPrice ??
    (token.symbol === 'USDC' || token.symbol === 'USDT' ? 1 : null);
  return price !== null && Number.isFinite(price) && price > 0 ? price : null;
}

/** Convert a user-entered USD decimal to an exact 6-decimal integer string. */
export function amountInputToUsd6(groupedAmount: string): string {
  const parsed = parseBaseUnits(groupedAmount.replace(/,/gu, ''), {
    truncateExcessFraction: true,
    allowEmptyFraction: true,
  });
  return (parsed ?? 0n).toString();
}

export interface StrategyFundingOption {
  token: DesktopDepositToken;
  balance: ChainTokenBalanceRow | null;
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

export function buildStrategyFundingOptions(
  tokens: readonly DesktopDepositToken[],
  rows: readonly ChainTokenBalanceRow[],
  search = '',
): StrategyFundingOption[] {
  const query = search.trim().toLowerCase();
  return tokens
    .filter((token) =>
      `${token.symbol} ${token.name} ${CHAIN_BRAND[token.chainKey].label}`
        .toLowerCase()
        .includes(query),
    )
    .map((token) => ({ token, balance: balanceForFundingToken(rows, token) }))
    .sort((a, b) => {
      const aPositive = BigInt(a.balance?.balanceBaseUnits ?? '0') > 0n;
      const bPositive = BigInt(b.balance?.balanceBaseUnits ?? '0') > 0n;
      if (aPositive !== bPositive) return aPositive ? -1 : 1;
      return (b.balance?.usdValue ?? 0) - (a.balance?.usdValue ?? 0);
    });
}

const NATIVE_GAS_RESERVE_ETH = 0.003;

export function spendableUsdForFundingToken(
  row: ChainTokenBalanceRow | null,
  token: DesktopDepositToken,
): number | null {
  if (!row || BigInt(row.balanceBaseUnits) <= 0n) {
    return 0;
  }

  if (token.symbol === 'USDC' || token.symbol === 'USDT') {
    const balance = Number.parseFloat(row.balance);
    return Number.isFinite(balance) && balance > 0 ? balance : 0;
  }

  if (row.usdValue === null || row.usdPrice === null) {
    return null;
  }

  return Math.max(0, row.usdValue - row.usdPrice * NATIVE_GAS_RESERVE_ETH);
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

/**
 * Display-only funding amount for one strategy allocation. Transaction amounts
 * are still calculated server-side from the exact USD6 request.
 */
export function fundingTokenAmountFromUsd(
  totalUsd: number | null,
  allocationBps: number,
  token: DesktopDepositToken,
  row: ChainTokenBalanceRow | null,
): number | null {
  if (totalUsd === null || totalUsd <= 0 || allocationBps <= 0) return null;

  const price = usableUsdPrice(token, row);
  if (price === null) return null;

  return (totalUsd * allocationBps) / 10_000 / price;
}
