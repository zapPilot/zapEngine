import { getRuntimeEnv } from '@core/lib/env/runtimeEnv';
import { z } from 'zod';

import {
  getSupportedWalletTokenSymbol,
  type SupportedWalletTokenSymbol,
  WALLET_TOKEN_CHAINS,
  type WalletTokenChain,
} from './walletTokenCatalog';

const MORALIS_BASE_URL = 'https://deep-index.moralis.io/api/v2.2';
const DEFAULT_HISTORY_LIMIT = 10;

export const MORALIS_WALLET_CHAINS = WALLET_TOKEN_CHAINS;

export type MoralisWalletChain = WalletTokenChain;

export type MoralisSupportedWalletSymbol = SupportedWalletTokenSymbol;

const stringOrNumberSchema = z.union([z.string(), z.number()]).nullish();

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

/**
 * Wallet token-balance row shape shared by the balance mappers. Alchemy is the
 * only producer now that the Moralis balance fallback is gone, so this is a
 * plain structural type — nothing parses it at a wire boundary.
 */
export interface MoralisWalletTokenBalance {
  symbol?: string | null | undefined;
  name?: string | null | undefined;
  token_address?: string | null | undefined;
  native_token?: boolean | null | undefined;
  balance_formatted?: string | number | null | undefined;
  usd_value?: string | number | null | undefined;
  usd_price?: string | number | null | undefined;
  possible_spam?: boolean | null | undefined;
}

export interface MoralisWalletTokenBalancesResponse {
  result: MoralisWalletTokenBalance[];
}

export type MoralisWalletTransfer = z.infer<typeof walletTransferSchema>;

export type MoralisWalletHistoryEvent = z.infer<
  typeof walletHistoryEventSchema
>;

export type MoralisWalletHistoryResponse = z.infer<
  typeof walletHistoryResponseSchema
>;

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
