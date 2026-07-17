import { STRATEGY_MIN_DEPOSIT_USD6 } from '@zapengine/types/api';

import type { ChainTokenBalanceRow } from '@/integration/walletTokens';
import {
  BASE_DEPOSIT_TOKENS,
  type DesktopDepositToken,
} from '@/integration/depositTokens';

export type AmountUnit = 'USD' | 'Token';

// Shared with the server-side request schema so the amount screen and the
// zValidator reject the same floor.
export const MIN_STRATEGY_DEPOSIT_USD6 = STRATEGY_MIN_DEPOSIT_USD6;
const USD_INPUT_DECIMALS = 6;

/** Parse the grouped display amount (e.g. "1,000.50") to a number. */
export function parseAmount(grouped: string): number {
  const parsed = Number(grouped.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function joinWithAnd(items: string[]): string {
  if (items.length <= 1) {
    return items[0] ?? '';
  }
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
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

export function depositSupportLabel(
  tokens: readonly { symbol: string }[] = BASE_DEPOSIT_TOKENS,
): string {
  const supported = joinWithAnd(tokens.map((token) => `Base ${token.symbol}`));
  return `Deposit v1 supports ${supported}`;
}

export function amountUsdFromInput(
  groupedAmount: string,
  unit: AmountUnit,
  usdPrice: number | null,
): number | null {
  const value = parseAmount(groupedAmount);
  if (value <= 0) {
    return null;
  }
  if (unit === 'USD') {
    return value;
  }
  if (typeof usdPrice === 'number' && usdPrice > 0) {
    return value * usdPrice;
  }
  return null;
}

/** Convert a user-entered USD decimal to an exact 6-decimal integer string. */
export function amountInputToUsd6(groupedAmount: string): string {
  const cleaned = groupedAmount.replace(/,/gu, '');
  const match = /^(\d+)(?:\.(\d*))?$/u.exec(cleaned);
  if (!match) return '0';
  const fraction = (match[2] ?? '').slice(0, 6).padEnd(6, '0');
  return `${match[1]!}${fraction}`.replace(/^0+(?=\d)/u, '') || '0';
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
      `${token.symbol} ${token.name} ${token.chainLabel}`
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

  const price =
    row?.usdPrice ??
    (token.symbol === 'USDC' || token.symbol === 'USDT' ? 1 : null);
  if (price === null || !Number.isFinite(price) || price <= 0) return null;

  return (totalUsd * allocationBps) / 10_000 / price;
}

export function strategyMaxTotalUsd(params: {
  base: StrategyFundingOption;
  arbitrum: StrategyFundingOption;
}): number | null {
  const baseSpendable = spendableUsdForFundingToken(
    params.base.balance,
    params.base.token,
  );
  const arbitrumSpendable = spendableUsdForFundingToken(
    params.arbitrum.balance,
    params.arbitrum.token,
  );

  if (baseSpendable === 0 || arbitrumSpendable === 0) {
    return 0;
  }
  if (baseSpendable === null || arbitrumSpendable === null) {
    return null;
  }

  const baseCapacity = baseSpendable / 0.4;
  const arbitrumCapacity = arbitrumSpendable / 0.6;
  return Math.max(0, Math.min(baseCapacity, arbitrumCapacity));
}
