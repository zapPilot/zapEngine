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
  USDC: { label: 'USD Coin', color: '#2775ca', glyph: '$' },
  USDT: { label: 'Tether USD', color: '#26a17b', glyph: '₮' },
  ETH: { label: 'Ethereum', color: '#627eea', glyph: 'Ξ' },
  WETH: { label: 'Wrapped Ether', color: '#ec4899', glyph: 'Ξ' },
  WBTC: { label: 'Wrapped Bitcoin', color: '#f7931a', glyph: '₿' },
  CBBTC: { label: 'Coinbase Wrapped BTC', color: '#0052ff', glyph: '₿' },
  BTC: { label: 'Bitcoin', color: '#f7931a', glyph: '₿' },
  SPY: { label: 'S&P 500', color: '#d7dde7', glyph: 'S' },
  ALT: { label: 'Altcoins', color: '#6b7280', glyph: 'A' },
};

export function tokenBrandSymbolFor(raw: string): TokenBrandSymbol | undefined {
  const normalized = raw.trim().toUpperCase();
  return normalized in TOKEN_BRAND
    ? (normalized as TokenBrandSymbol)
    : undefined;
}
