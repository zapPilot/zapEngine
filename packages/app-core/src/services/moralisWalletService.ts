import { getRuntimeEnv } from '@core/lib/env/runtimeEnv';
import { z } from 'zod';

const MORALIS_BASE_URL = 'https://deep-index.moralis.io/api/v2.2';
const DEFAULT_HISTORY_LIMIT = 10;

export const MORALIS_WALLET_CHAINS = ['eth', 'base', 'arbitrum'] as const;

export type MoralisWalletChain = (typeof MORALIS_WALLET_CHAINS)[number];

export type MoralisSupportedWalletSymbol =
  | 'USDC'
  | 'USDT'
  | 'ETH'
  | 'WETH'
  | 'WBTC'
  | 'CBBTC';

type SupportedErc20Symbol = Exclude<MoralisSupportedWalletSymbol, 'ETH'>;

type SupportedTokenAddressMap = Record<
  MoralisWalletChain,
  Partial<Record<SupportedErc20Symbol, readonly `0x${string}`[]>>
>;

export const MORALIS_SUPPORTED_TOKEN_ADDRESSES_BY_CHAIN = {
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

const stringOrNumberSchema = z.union([z.string(), z.number()]).nullish();

const walletTokenBalanceSchema = z.looseObject({
  symbol: z.string().nullish(),
  name: z.string().nullish(),
  token_address: z.string().nullish(),
  native_token: z.boolean().nullish(),
  balance_formatted: stringOrNumberSchema,
  usd_value: stringOrNumberSchema,
  usd_price: stringOrNumberSchema,
  possible_spam: z.boolean().nullish(),
});

const walletTokenBalancesResponseSchema = z.looseObject({
  result: z.array(walletTokenBalanceSchema).default([]),
});

const walletTransferSchema = z.looseObject({
  token_symbol: z.string().nullish(),
  token_address: z.string().nullish(),
  direction: z.string().nullish(),
  value_formatted: stringOrNumberSchema,
  value_usd: stringOrNumberSchema,
  total_usd: stringOrNumberSchema,
});

const walletHistoryEventSchema = z.looseObject({
  hash: z.string().default(''),
  block_timestamp: z.string().nullish(),
  summary: z.string().nullish(),
  category: z.string().nullish(),
  receipt_status: z.union([z.string(), z.number(), z.boolean()]).nullish(),
  erc20_transfers: z.array(walletTransferSchema).nullish(),
  native_transfers: z.array(walletTransferSchema).nullish(),
});

const walletHistoryResponseSchema = z.looseObject({
  result: z.array(walletHistoryEventSchema).default([]),
  cursor: z.string().nullable().optional(),
});

export type MoralisWalletTokenBalance = z.infer<
  typeof walletTokenBalanceSchema
>;

export type MoralisWalletTokenBalancesResponse = z.infer<
  typeof walletTokenBalancesResponseSchema
>;

export type MoralisWalletTransfer = z.infer<typeof walletTransferSchema>;

export type MoralisWalletHistoryEvent = z.infer<
  typeof walletHistoryEventSchema
>;

export type MoralisWalletHistoryResponse = z.infer<
  typeof walletHistoryResponseSchema
>;

export interface MoralisChainBalances {
  chain: MoralisWalletChain;
  response: MoralisWalletTokenBalancesResponse;
}

export interface MoralisChainHistory {
  chain: MoralisWalletChain;
  response: MoralisWalletHistoryResponse;
}

function normalizeSymbol(
  symbol: string | null | undefined,
): MoralisSupportedWalletSymbol | null {
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

function lowerAddress(address: string): `0x${string}` {
  return address.toLowerCase() as `0x${string}`;
}

function supportedTokenAddresses(chain: MoralisWalletChain): `0x${string}`[] {
  return Object.values(
    MORALIS_SUPPORTED_TOKEN_ADDRESSES_BY_CHAIN[chain],
  ).flat();
}

function supportedTokenSymbolForAddress(
  chain: MoralisWalletChain,
  address: string | null | undefined,
): MoralisSupportedWalletSymbol | null {
  if (!address) {
    return null;
  }

  const lower = lowerAddress(address);
  const entries = Object.entries(
    MORALIS_SUPPORTED_TOKEN_ADDRESSES_BY_CHAIN[chain],
  ) as [SupportedErc20Symbol, readonly `0x${string}`[]][];

  const match = entries.find(([, addresses]) => addresses.includes(lower));
  return match?.[0] ?? null;
}

export function getSupportedMoralisWalletSymbol(
  chain: MoralisWalletChain,
  candidate: Pick<
    MoralisWalletTokenBalance,
    'native_token' | 'symbol' | 'token_address'
  >,
): MoralisSupportedWalletSymbol | null {
  if (candidate.native_token === true) {
    return 'ETH';
  }

  const symbolByAddress = supportedTokenSymbolForAddress(
    chain,
    candidate.token_address,
  );
  if (!symbolByAddress) {
    return null;
  }

  const symbolByPayload = normalizeSymbol(candidate.symbol);
  return symbolByPayload === symbolByAddress ? symbolByAddress : null;
}

function moralisApiKey(): string {
  const key = getRuntimeEnv('VITE_MORALIS_API_KEY')?.trim();
  if (!key) {
    throw new Error('Missing VITE_MORALIS_API_KEY for Moralis wallet data.');
  }
  return key;
}

async function fetchMoralisJson<T>(
  path: string,
  params: Record<string, string>,
  schema: z.ZodType<T>,
): Promise<T> {
  const url = new URL(`${MORALIS_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  // Production note: proxy Moralis through account-engine/backend before exposing
  // this outside the current POC so the API key stays off desktop/web clients.
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      'X-API-Key': moralisApiKey(),
    },
  });

  if (!response.ok) {
    throw new Error(`Moralis request failed with HTTP ${response.status}.`);
  }

  return schema.parse(await response.json());
}

async function getMoralisWalletTokenBalancesForChain(
  address: string,
  chain: MoralisWalletChain,
): Promise<MoralisChainBalances> {
  const response = await fetchMoralisJson(
    `/wallets/${address}/tokens`,
    {
      chain,
      exclude_native: 'false',
      exclude_spam: 'true',
      exclude_unverified_contracts: 'true',
      token_addresses: supportedTokenAddresses(chain).join(','),
    },
    walletTokenBalancesResponseSchema,
  );

  return {
    chain,
    response: {
      ...response,
      result: response.result.filter(
        (balance) => getSupportedMoralisWalletSymbol(chain, balance) !== null,
      ),
    },
  };
}

async function getMoralisWalletHistoryForChain(
  address: string,
  chain: MoralisWalletChain,
  limit: number,
): Promise<MoralisChainHistory> {
  const response = await fetchMoralisJson(
    `/wallets/${address}/history`,
    { chain, limit: String(limit), order: 'DESC' },
    walletHistoryResponseSchema,
  );
  return { chain, response };
}

export function getMoralisWalletTokenBalances(
  address: string,
): Promise<MoralisChainBalances[]> {
  return Promise.all(
    MORALIS_WALLET_CHAINS.map((chain) =>
      getMoralisWalletTokenBalancesForChain(address, chain),
    ),
  );
}

export function getMoralisWalletHistory(
  address: string,
  options: { limit?: number } = {},
): Promise<MoralisChainHistory[]> {
  const limit = options.limit ?? DEFAULT_HISTORY_LIMIT;
  return Promise.all(
    MORALIS_WALLET_CHAINS.map((chain) =>
      getMoralisWalletHistoryForChain(address, chain, limit),
    ),
  );
}
