/** Display formatters for the desktop UI (demo + live phases share these). */

import { formatAddress, formatCurrency } from '@zapengine/app-core/utils';

export type TokenAmountDisplayContext =
  | 'funding'
  | 'wallet-summary'
  | 'wallet-activity';

const TOKEN_AMOUNT_FRACTION_DIGITS: Record<
  TokenAmountDisplayContext,
  { default: number; symbols: Readonly<Record<string, number>> }
> = {
  funding: { default: 2, symbols: { ETH: 6 } },
  'wallet-summary': { default: 5, symbols: { USDC: 2, USDT: 2 } },
  'wallet-activity': {
    default: 6,
    symbols: { USDC: 2, USDT: 2, WBTC: 8, CBBTC: 8 },
  },
};

export function tokenAmountFractionDigits(
  symbol: string,
  context: TokenAmountDisplayContext,
): number {
  const config = TOKEN_AMOUNT_FRACTION_DIGITS[context];
  return config.symbols[symbol] ?? config.default;
}

export function formatUsd(value: number, decimals = 2): string {
  return formatCurrency(value, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Lenient numeric parse for indexer payloads that mix numbers and strings. */
export function numberFrom(
  value: string | number | null | undefined,
): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function formatTokenAmount(
  amount: number,
  symbol: string,
  context: TokenAmountDisplayContext,
): string {
  const amountLabel = amount.toLocaleString('en-US', {
    maximumFractionDigits: tokenAmountFractionDigits(symbol, context),
  });
  return `${amountLabel} ${symbol}`;
}

export function formatSignedTokenAmount(
  amount: number,
  symbol: string,
  context: TokenAmountDisplayContext,
): string {
  const sign = amount >= 0 ? '+' : '−';
  return `${sign}${formatTokenAmount(Math.abs(amount), symbol, context)}`;
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

export function formatPct(value: number, decimals = 1): string {
  return `${Math.abs(value).toFixed(decimals)}%`;
}

export function formatSignedUsd(value: number, decimals = 2): string {
  const sign = value >= 0 ? '+' : '−';
  return `${sign}${formatUsd(Math.abs(value), decimals)}`;
}

export function formatTokenBalance(
  balance: string | null | undefined,
  symbol: string,
  state: 'loading' | 'unavailable' | 'loaded',
): string {
  if (state === 'loading') return 'Loading…';
  if (state === 'unavailable') return 'Unavailable';

  const parsed = Number.parseFloat(balance ?? '0');
  const value = Number.isFinite(parsed) ? parsed : 0;
  return `${value.toLocaleString('en-US', {
    maximumFractionDigits: tokenAmountFractionDigits(symbol, 'funding'),
  })} ${symbol}`;
}

export function truncateAddress(
  address: string,
  prefix = 6,
  suffix = 4,
): string {
  return formatAddress(address, {
    prefixLength: prefix,
    suffixLength: suffix,
  });
}
