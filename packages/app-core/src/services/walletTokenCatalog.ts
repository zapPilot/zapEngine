export const WALLET_TOKEN_CHAINS = ['eth', 'base', 'arbitrum'] as const;

export type WalletTokenChain = (typeof WALLET_TOKEN_CHAINS)[number];

export type SupportedWalletTokenSymbol =
  | 'USDC'
  | 'USDT'
  | 'ETH'
  | 'WETH'
  | 'WBTC'
  | 'CBBTC';

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

export const SUPPORTED_WALLET_TOKEN_ADDRESSES_BY_CHAIN = {
  eth: {
    USDC: ['0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'],
    USDT: ['0xdac17f958d2ee523a2206206994597c13d831ec7'],
    WETH: ['0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'],
    WBTC: ['0x2260fac5e5542a773aa44fbcfedf7c193bc2c599'],
    CBBTC: ['0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf'],
  },
  base: {
    USDC: ['0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'],
    WETH: ['0x4200000000000000000000000000000000000006'],
    CBBTC: ['0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf'],
  },
  arbitrum: {
    USDC: ['0xaf88d065e77c8cc2239327c5edb3a432268e5831'],
    USDT: ['0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9'],
    WETH: ['0x82af49447d8a07e3bd95bd0d56f35241523fbab1'],
    WBTC: ['0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f'],
    CBBTC: ['0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf'],
  },
} as const satisfies SupportedTokenAddressMap;

export const SUPPORTED_WALLET_TOKEN_DEFINITIONS = {
  USDC: {
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    addresses: {
      eth: SUPPORTED_WALLET_TOKEN_ADDRESSES_BY_CHAIN.eth.USDC,
      base: SUPPORTED_WALLET_TOKEN_ADDRESSES_BY_CHAIN.base.USDC,
      arbitrum: SUPPORTED_WALLET_TOKEN_ADDRESSES_BY_CHAIN.arbitrum.USDC,
    },
  },
  USDT: {
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
    addresses: {
      eth: SUPPORTED_WALLET_TOKEN_ADDRESSES_BY_CHAIN.eth.USDT,
      arbitrum: SUPPORTED_WALLET_TOKEN_ADDRESSES_BY_CHAIN.arbitrum.USDT,
    },
  },
  ETH: {
    symbol: 'ETH',
    name: 'Ethereum',
    decimals: 18,
    addresses: {},
  },
  WETH: {
    symbol: 'WETH',
    name: 'Wrapped Ether',
    decimals: 18,
    addresses: {
      eth: SUPPORTED_WALLET_TOKEN_ADDRESSES_BY_CHAIN.eth.WETH,
      base: SUPPORTED_WALLET_TOKEN_ADDRESSES_BY_CHAIN.base.WETH,
      arbitrum: SUPPORTED_WALLET_TOKEN_ADDRESSES_BY_CHAIN.arbitrum.WETH,
    },
  },
  WBTC: {
    symbol: 'WBTC',
    name: 'Wrapped Bitcoin',
    decimals: 8,
    addresses: {
      eth: SUPPORTED_WALLET_TOKEN_ADDRESSES_BY_CHAIN.eth.WBTC,
      arbitrum: SUPPORTED_WALLET_TOKEN_ADDRESSES_BY_CHAIN.arbitrum.WBTC,
    },
  },
  CBBTC: {
    symbol: 'CBBTC',
    name: 'Coinbase Wrapped BTC',
    decimals: 8,
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
