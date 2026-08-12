import {
  CANONICAL_TOKEN_ADDRESSES,
  type CanonicalTokenSymbol,
  TOKEN_METADATA,
} from '@zapengine/types/shared';

export const WALLET_TOKEN_CHAINS = ['eth', 'base', 'arbitrum'] as const;

export type WalletTokenChain = (typeof WALLET_TOKEN_CHAINS)[number];

export type SupportedWalletTokenSymbol = CanonicalTokenSymbol;

export type SupportedWalletErc20Symbol = Exclude<
  SupportedWalletTokenSymbol,
  'ETH'
>;

export interface WalletTokenDefinition {
  symbol: SupportedWalletTokenSymbol;
  name: string;
  decimals: number;
  addresses: Partial<Record<WalletTokenChain, readonly `0x${string}`[]>>;
}

type SupportedTokenAddressMap = Record<
  WalletTokenChain,
  Partial<Record<SupportedWalletErc20Symbol, readonly `0x${string}`[]>>
>;

const WALLET_TOKEN_CHAIN_IDS = {
  eth: 1,
  base: 8453,
  arbitrum: 42161,
} as const;

function canonicalWalletTokenAddress(
  chain: WalletTokenChain,
  symbol: SupportedWalletErc20Symbol,
): readonly `0x${string}`[] {
  const chainAddresses: Partial<
    Record<SupportedWalletErc20Symbol, `0x${string}`>
  > = CANONICAL_TOKEN_ADDRESSES[WALLET_TOKEN_CHAIN_IDS[chain]];
  const address = chainAddresses[symbol];
  if (!address) {
    throw new Error(`Missing ${symbol} address for ${chain}`);
  }
  return [address.toLowerCase() as `0x${string}`];
}

export const SUPPORTED_WALLET_TOKEN_ADDRESSES_BY_CHAIN = {
  eth: {
    USDC: canonicalWalletTokenAddress('eth', 'USDC'),
    USDT: canonicalWalletTokenAddress('eth', 'USDT'),
    WETH: canonicalWalletTokenAddress('eth', 'WETH'),
    WBTC: canonicalWalletTokenAddress('eth', 'WBTC'),
    CBBTC: canonicalWalletTokenAddress('eth', 'CBBTC'),
  },
  base: {
    USDC: canonicalWalletTokenAddress('base', 'USDC'),
    WETH: canonicalWalletTokenAddress('base', 'WETH'),
    CBBTC: canonicalWalletTokenAddress('base', 'CBBTC'),
  },
  arbitrum: {
    USDC: canonicalWalletTokenAddress('arbitrum', 'USDC'),
    USDT: canonicalWalletTokenAddress('arbitrum', 'USDT'),
    WETH: canonicalWalletTokenAddress('arbitrum', 'WETH'),
    WBTC: canonicalWalletTokenAddress('arbitrum', 'WBTC'),
    CBBTC: canonicalWalletTokenAddress('arbitrum', 'CBBTC'),
  },
} as const satisfies SupportedTokenAddressMap;

export const SUPPORTED_WALLET_TOKEN_DEFINITIONS = {
  USDC: {
    symbol: 'USDC',
    ...TOKEN_METADATA.USDC,
    addresses: {
      eth: SUPPORTED_WALLET_TOKEN_ADDRESSES_BY_CHAIN.eth.USDC,
      base: SUPPORTED_WALLET_TOKEN_ADDRESSES_BY_CHAIN.base.USDC,
      arbitrum: SUPPORTED_WALLET_TOKEN_ADDRESSES_BY_CHAIN.arbitrum.USDC,
    },
  },
  USDT: {
    symbol: 'USDT',
    ...TOKEN_METADATA.USDT,
    addresses: {
      eth: SUPPORTED_WALLET_TOKEN_ADDRESSES_BY_CHAIN.eth.USDT,
      arbitrum: SUPPORTED_WALLET_TOKEN_ADDRESSES_BY_CHAIN.arbitrum.USDT,
    },
  },
  ETH: {
    symbol: 'ETH',
    ...TOKEN_METADATA.ETH,
    addresses: {},
  },
  WETH: {
    symbol: 'WETH',
    ...TOKEN_METADATA.WETH,
    addresses: {
      eth: SUPPORTED_WALLET_TOKEN_ADDRESSES_BY_CHAIN.eth.WETH,
      base: SUPPORTED_WALLET_TOKEN_ADDRESSES_BY_CHAIN.base.WETH,
      arbitrum: SUPPORTED_WALLET_TOKEN_ADDRESSES_BY_CHAIN.arbitrum.WETH,
    },
  },
  WBTC: {
    symbol: 'WBTC',
    ...TOKEN_METADATA.WBTC,
    addresses: {
      eth: SUPPORTED_WALLET_TOKEN_ADDRESSES_BY_CHAIN.eth.WBTC,
      arbitrum: SUPPORTED_WALLET_TOKEN_ADDRESSES_BY_CHAIN.arbitrum.WBTC,
    },
  },
  CBBTC: {
    symbol: 'CBBTC',
    ...TOKEN_METADATA.CBBTC,
    addresses: {
      eth: SUPPORTED_WALLET_TOKEN_ADDRESSES_BY_CHAIN.eth.CBBTC,
      base: SUPPORTED_WALLET_TOKEN_ADDRESSES_BY_CHAIN.base.CBBTC,
      arbitrum: SUPPORTED_WALLET_TOKEN_ADDRESSES_BY_CHAIN.arbitrum.CBBTC,
    },
  },
} as const satisfies Record<SupportedWalletTokenSymbol, WalletTokenDefinition>;

function lowerAddress(address: string): `0x${string}` {
  return address.toLowerCase() as `0x${string}`;
}

export function normalizeSupportedWalletTokenSymbol(
  symbol: string | null | undefined,
): SupportedWalletTokenSymbol | null {
  const normalized = symbol
    ?.trim()
    .replace(/^cbbtc$/i, 'CBBTC')
    .toUpperCase();
  if (
    normalized === 'USDC' ||
    normalized === 'USDT' ||
    normalized === 'ETH' ||
    normalized === 'WETH' ||
    normalized === 'WBTC' ||
    normalized === 'CBBTC'
  ) {
    return normalized;
  }
  return null;
}

export function supportedWalletTokenAddresses(
  chain: WalletTokenChain,
): `0x${string}`[] {
  return Object.values(
    SUPPORTED_WALLET_TOKEN_ADDRESSES_BY_CHAIN[chain],
  ).flat() as `0x${string}`[];
}

export function supportedWalletTokenSymbolForAddress(
  chain: WalletTokenChain,
  address: string | null | undefined,
): SupportedWalletTokenSymbol | null {
  if (!address) {
    return null;
  }

  const lower = lowerAddress(address);
  const entries = Object.entries(
    SUPPORTED_WALLET_TOKEN_ADDRESSES_BY_CHAIN[chain],
  ) as [SupportedWalletErc20Symbol, readonly `0x${string}`[]][];

  const match = entries.find(([, addresses]) => addresses.includes(lower));
  return match?.[0] ?? null;
}

export function getSupportedWalletTokenSymbol(
  chain: WalletTokenChain,
  candidate: {
    native_token?: boolean | null | undefined;
    symbol?: string | null | undefined;
    token_address?: string | null | undefined;
  },
): SupportedWalletTokenSymbol | null {
  if (candidate.native_token === true) {
    return 'ETH';
  }

  const symbolByAddress = supportedWalletTokenSymbolForAddress(
    chain,
    candidate.token_address,
  );
  if (!symbolByAddress) {
    return null;
  }

  const symbolByPayload = normalizeSupportedWalletTokenSymbol(candidate.symbol);
  return symbolByPayload === null || symbolByPayload === symbolByAddress
    ? symbolByAddress
    : null;
}

export function getSupportedWalletTokenDefinition(
  symbol: SupportedWalletTokenSymbol,
): WalletTokenDefinition {
  return SUPPORTED_WALLET_TOKEN_DEFINITIONS[symbol];
}
