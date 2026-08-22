/**
 * Platform-neutral identity registry for the chains, tokens, and protocols the
 * product renders. It deliberately holds no image references: Metro resolves an
 * asset through `require` while webpack resolves it through `import`, and the
 * two return different shapes, so each app owns its own resolution map keyed by
 * the identifiers below.
 *
 * Rasterized 256x256 marks live next to this file under `assets/` and are
 * reachable through the package's `./assets/*` export.
 */

export type ChainBrandKey = 'ethereum' | 'base' | 'arbitrum' | 'hyperliquid';

export type TokenBrandSymbol =
  | 'USDC'
  | 'USDT'
  | 'ETH'
  | 'WETH'
  | 'WBTC'
  | 'CBBTC'
  | 'BTC'
  | 'SPY';

export type ProtocolBrandKey = 'morpho' | 'gmx-v2' | 'hyperliquid' | 'ondo';

export interface ChainBrand {
  /** Human-readable chain name, safe for an accessibility label. */
  readonly label: string;
  /** Brand fill used only when no mark is available. */
  readonly color: string;
  readonly chainId: number;
}

export interface TokenBrand {
  readonly label: string;
  readonly color: string;
  /** Single-character stand-in rendered when no mark is available. */
  readonly glyph: string;
}

export interface ProtocolBrand {
  readonly label: string;
  readonly color: string;
}

/**
 * Chain ids are inlined rather than imported from `@zapengine/types` so this
 * package stays dependency-free. They are immutable public network constants.
 */
export const CHAIN_BRAND: Record<ChainBrandKey, ChainBrand> = {
  ethereum: { label: 'Ethereum', color: '#627eea', chainId: 1 },
  base: { label: 'Base', color: '#0052ff', chainId: 8453 },
  arbitrum: { label: 'Arbitrum', color: '#12aaff', chainId: 42161 },
  // HyperCore, the Hyperliquid L1 that HLP deposits settle on.
  hyperliquid: { label: 'Hyperliquid', color: '#50d2c1', chainId: 1337 },
};

export const TOKEN_BRAND: Record<TokenBrandSymbol, TokenBrand> = {
  USDC: { label: 'USD Coin', color: '#2775ca', glyph: '$' },
  USDT: { label: 'Tether USD', color: '#26a17b', glyph: '₮' },
  ETH: { label: 'Ethereum', color: '#627eea', glyph: 'Ξ' },
  WETH: { label: 'Wrapped Ether', color: '#ec4899', glyph: 'Ξ' },
  WBTC: { label: 'Wrapped Bitcoin', color: '#f7931a', glyph: '₿' },
  CBBTC: { label: 'Coinbase Wrapped BTC', color: '#0052ff', glyph: '₿' },
  BTC: { label: 'Bitcoin', color: '#f7931a', glyph: '₿' },
  SPY: { label: 'S&P 500', color: '#d7dde7', glyph: 'S' },
};

export const PROTOCOL_BRAND: Record<ProtocolBrandKey, ProtocolBrand> = {
  morpho: { label: 'Morpho', color: '#2470ff' },
  'gmx-v2': { label: 'GMX', color: '#4e09f8' },
  hyperliquid: { label: 'Hyperliquid', color: '#50d2c1' },
  ondo: { label: 'Ondo', color: '#f4f4f5' },
};

const CHAIN_BRAND_KEY_BY_CHAIN_ID = new Map<number, ChainBrandKey>(
  (Object.keys(CHAIN_BRAND) as ChainBrandKey[]).map((key) => [
    CHAIN_BRAND[key].chainId,
    key,
  ]),
);

/**
 * Chain id is the only chain identifier the whole repository agrees on, and the
 * only one that can name HyperCore. Unknown ids resolve to `undefined` so the
 * caller renders a neutral fallback rather than a wrong chain.
 */
export function chainBrandKeyForChainId(
  chainId: number,
): ChainBrandKey | undefined {
  return CHAIN_BRAND_KEY_BY_CHAIN_ID.get(chainId);
}

/** Spellings of a protocol that reach the client from plan payloads and copy. */
const PROTOCOL_BRAND_KEY_ALIASES: Record<string, ProtocolBrandKey> = {
  gmx: 'gmx-v2',
  gmxv2: 'gmx-v2',
  'gmx-v-2': 'gmx-v2',
  hlp: 'hyperliquid',
  hypercore: 'hyperliquid',
};

function normalizeKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/-{2,}/g, '-');
}

/**
 * `DepositLeg.protocol` is an open `z.string()` on the wire, so an unknown
 * protocol is an expected input, not an error — it resolves to `undefined` and
 * the caller falls back to a monogram.
 */
export function protocolBrandKeyFor(raw: string): ProtocolBrandKey | undefined {
  const normalized = normalizeKey(raw);
  if (normalized in PROTOCOL_BRAND) {
    return normalized as ProtocolBrandKey;
  }
  return PROTOCOL_BRAND_KEY_ALIASES[normalized];
}

/**
 * Token symbols arrive from wallet indexers and simulation payloads in mixed
 * case (`cbBTC`, `usdc`). Unknown symbols resolve to `undefined` so the caller
 * renders the symbol's own initial instead of an unrelated mark.
 */
export function tokenBrandSymbolFor(raw: string): TokenBrandSymbol | undefined {
  const normalized = raw.trim().toUpperCase();
  return normalized in TOKEN_BRAND
    ? (normalized as TokenBrandSymbol)
    : undefined;
}
