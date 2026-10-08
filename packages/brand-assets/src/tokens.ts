import { sleeveColors } from './token-colors.js';
export type TokenBrandSymbol =
  | 'USDC'
  | 'USDT'
  | 'ETH'
  | 'WETH'
  | 'WBTC'
  | 'CBBTC'
  | 'BTC'
  | 'SPY'
  | 'ALT';

export interface TokenBrand {
  readonly label: string;
  readonly color: string;
  readonly glyph: string;
}

export const TOKEN_BRAND: Record<TokenBrandSymbol, TokenBrand> = {
  USDC: { label: 'USD Coin', color: sleeveColors.stable, glyph: '$' },
  USDT: { label: 'Tether USD', color: sleeveColors.stable, glyph: '₮' },
  ETH: { label: 'Ethereum', color: sleeveColors.eth, glyph: 'Ξ' },
  WETH: { label: 'Wrapped Ether', color: sleeveColors.eth, glyph: 'Ξ' },
  WBTC: {
    label: 'Wrapped Bitcoin',
    color: sleeveColors.btc,
    glyph: '₿',
  },
  CBBTC: {
    label: 'Coinbase Wrapped BTC',
    color: sleeveColors.btc,
    glyph: '₿',
  },
  BTC: { label: 'Bitcoin', color: sleeveColors.btc, glyph: '₿' },
  SPY: { label: 'S&P 500', color: sleeveColors.spy, glyph: 'S' },
  ALT: { label: 'Altcoins', color: sleeveColors.alt, glyph: 'A' },
};

export function tokenBrandSymbolFor(raw: string): TokenBrandSymbol | undefined {
  const normalized = raw.trim().toUpperCase();
  return normalized in TOKEN_BRAND
    ? (normalized as TokenBrandSymbol)
    : undefined;
}
