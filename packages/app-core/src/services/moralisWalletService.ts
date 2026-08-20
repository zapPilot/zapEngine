import { getRuntimeEnv } from '@core/lib/env/runtimeEnv';
import { httpGet } from '@core/lib/http';
import { createApiServiceCaller } from '@core/lib/http/createServiceCaller';
import { z } from 'zod';

import {
  WALLET_TOKEN_CHAINS,
  type WalletTokenChain,
} from './walletTokenCatalog';

const MORALIS_BASE_URL = 'https://deep-index.moralis.io/api/v2.2';
const DEFAULT_HISTORY_LIMIT = 10;

export const MORALIS_WALLET_CHAINS = WALLET_TOKEN_CHAINS;

export type MoralisWalletChain = WalletTokenChain;

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

function moralisApiKey(): string {
  const key = getRuntimeEnv('VITE_MORALIS_API_KEY')?.trim();
  if (!key) {
    throw new Error('Missing VITE_MORALIS_API_KEY for Moralis wallet data.');
  }
  return key;
}

const callMoralisApi = createApiServiceCaller(
  {
    401: 'Moralis rejected the configured API key.',
    429: 'Moralis rate limit reached for wallet history.',
    500: 'Moralis wallet history request failed.',
    503: 'Moralis wallet history is temporarily unavailable.',
  },
  'Moralis request failed',
);

async function fetchMoralisJson<T>(
  path: string,
  params: Record<string, string>,
  schema: z.ZodType<T>,
): Promise<T> {
  const url = new URL(`${MORALIS_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  // Resolved outside the API caller so a missing key stays a configuration
  // error instead of being mapped to a transport error.
  const apiKey = moralisApiKey();

  // Production note: proxy Moralis through account-engine/backend before exposing
  // this outside the current POC so the API key stays off desktop/web clients.
  const payload = await callMoralisApi(() =>
    httpGet<unknown>(url.toString(), {
      headers: {
        accept: 'application/json',
        'X-API-Key': apiKey,
      },
    }),
  );

  return schema.parse(payload);
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
