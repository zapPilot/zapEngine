import { getRuntimeEnv } from '@core/lib/env/runtimeEnv';
import { z } from 'zod';

import {
  getSupportedWalletTokenSymbol,
  SUPPORTED_WALLET_TOKEN_ADDRESSES_BY_CHAIN,
  supportedWalletTokenAddresses,
  type SupportedWalletTokenSymbol,
  WALLET_TOKEN_CHAINS,
  type WalletTokenChain,
} from './walletTokenCatalog';

const MORALIS_BASE_URL = 'https://deep-index.moralis.io/api/v2.2';
const DEFAULT_HISTORY_LIMIT = 10;

export const MORALIS_WALLET_CHAINS = WALLET_TOKEN_CHAINS;

export type MoralisWalletChain = WalletTokenChain;

export type MoralisSupportedWalletSymbol = SupportedWalletTokenSymbol;

export const MORALIS_SUPPORTED_TOKEN_ADDRESSES_BY_CHAIN =
  SUPPORTED_WALLET_TOKEN_ADDRESSES_BY_CHAIN;

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

export function getSupportedMoralisWalletSymbol(
  chain: MoralisWalletChain,
  candidate: Pick<
    MoralisWalletTokenBalance,
    'native_token' | 'symbol' | 'token_address'
  >,
): MoralisSupportedWalletSymbol | null {
  return getSupportedWalletTokenSymbol(chain, candidate);
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
      token_addresses: supportedWalletTokenAddresses(chain).join(','),
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
