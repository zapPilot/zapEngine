import { getRuntimeEnv } from '@core/lib/env/runtimeEnv';
import { formatUnits } from 'viem';

import {
  getSupportedWalletTokenDefinition,
  getSupportedWalletTokenSymbol,
  supportedWalletTokenAddresses,
  type SupportedWalletTokenSymbol,
  WALLET_TOKEN_CHAINS,
  type WalletTokenChain,
} from './walletTokenCatalog';

const ALCHEMY_RPC_NETWORK_BY_CHAIN = {
  eth: 'eth-mainnet',
  base: 'base-mainnet',
  arbitrum: 'arb-mainnet',
} as const satisfies Record<WalletTokenChain, string>;

const ALCHEMY_PRICE_BASE_URL = 'https://api.g.alchemy.com/prices/v1';
const JSON_RPC_VERSION = '2.0';

export const ALCHEMY_WALLET_CHAINS = WALLET_TOKEN_CHAINS;

export type AlchemyWalletChain = WalletTokenChain;
export type AlchemySupportedWalletSymbol = SupportedWalletTokenSymbol;

export interface AlchemyWalletTokenBalance {
  symbol: AlchemySupportedWalletSymbol;
  name: string;
  token_address: string | null;
  native_token: boolean;
  balance_formatted: string;
  usd_value: number | null;
  usd_price: number | null;
  possible_spam?: boolean;
}

export interface AlchemyWalletTokenBalancesResponse {
  result: AlchemyWalletTokenBalance[];
}

export interface AlchemyChainBalances {
  chain: AlchemyWalletChain;
  response: AlchemyWalletTokenBalancesResponse;
}

interface JsonRpcResponse<T> {
  result?: T;
  error?: {
    message?: string;
  };
}

interface AlchemyTokenBalance {
  contractAddress: string;
  tokenBalance: string | null;
}

interface AlchemyTokenBalancesResult {
  tokenBalances?: AlchemyTokenBalance[];
}

interface TokenPrice {
  currency?: string;
  value?: string | number | null;
  price?: string | number | null;
}

interface TokenPriceByAddressResult {
  address?: string;
  network?: string;
  prices?: TokenPrice[];
}

interface TokenPriceBySymbolResult {
  symbol?: string;
  prices?: TokenPrice[];
  price?: string | number | null;
}

function alchemyApiKey(): string {
  const key = getRuntimeEnv('VITE_ALCHEMY_API_KEY')?.trim();
  if (!key) {
    throw new Error('Missing VITE_ALCHEMY_API_KEY for Alchemy wallet data.');
  }
  return key;
}

function rpcUrl(network: string, apiKey: string): string {
  return `https://${network}.g.alchemy.com/v2/${apiKey}`;
}

function numberFrom(value: string | number | null | undefined): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function bigintFromRawBalance(value: string | null | undefined): bigint {
  if (!value) {
    return 0n;
  }

  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}

function isPositiveRawBalance(value: string | null | undefined): boolean {
  return bigintFromRawBalance(value) > 0n;
}

async function fetchJsonRpc<T>(
  network: string,
  apiKey: string,
  method: string,
  params: unknown[],
): Promise<T> {
  const response = await fetch(rpcUrl(network, apiKey), {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      id: 1,
      jsonrpc: JSON_RPC_VERSION,
      method,
      params,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Alchemy ${method} request failed with HTTP ${response.status}.`,
    );
  }

  const payload = (await response.json()) as JsonRpcResponse<T>;
  if (payload.error) {
    throw new Error(
      `Alchemy ${method} request failed: ${payload.error.message ?? 'unknown error'}.`,
    );
  }
  if (payload.result === undefined) {
    throw new Error(`Alchemy ${method} response did not include a result.`);
  }

  return payload.result;
}

function priceFromPrices(prices: TokenPrice[] | undefined): number | null {
  const selected =
    prices?.find((price) => price.currency?.toUpperCase() === 'USD') ??
    prices?.[0];
  return numberFrom(selected?.value ?? selected?.price);
}

interface PriceRow {
  data?: readonly { prices?: TokenPrice[] }[];
}

function buildPriceMap<T extends PriceRow>(
  payload: T | null,
  extract: (row: NonNullable<T['data']>[number]) => [string, number] | null,
): Map<string, number> {
  const prices = new Map<string, number>();
  for (const row of payload?.data ?? []) {
    const entry = extract(row);
    if (entry) {
      prices.set(entry[0], entry[1]);
    }
  }
  return prices;
}

async function fetchAlchemyJson<T>(
  url: string,
  init?: RequestInit,
): Promise<T | null> {
  const response = await fetch(url, init);
  if (!response.ok) {
    return null;
  }
  return (await response.json()) as T;
}

async function fetchPriceByAddress(
  apiKey: string,
  requests: { address: string; network: string }[],
): Promise<Map<string, number>> {
  if (requests.length === 0) {
    return new Map();
  }

  const payload = await fetchAlchemyJson<{
    data?: TokenPriceByAddressResult[];
  }>(`${ALCHEMY_PRICE_BASE_URL}/tokens/by-address`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ addresses: requests }),
  });

  return buildPriceMap(payload, (row) => {
    const price = priceFromPrices(row.prices);
    if (row.address && row.network && price !== null) {
      return [`${row.network}:${row.address.toLowerCase()}`, price];
    }
    return null;
  });
}

async function fetchPriceBySymbol(
  apiKey: string,
  symbols: readonly string[],
): Promise<Map<string, number>> {
  if (symbols.length === 0) {
    return new Map();
  }

  const query = new URLSearchParams();
  for (const symbol of symbols) {
    query.append('symbols', symbol);
  }

  const payload = await fetchAlchemyJson<{
    data?: TokenPriceBySymbolResult[];
  }>(`${ALCHEMY_PRICE_BASE_URL}/tokens/by-symbol?${query}`, {
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
  });

  return buildPriceMap(payload, (row) => {
    const price = priceFromPrices(row.prices) ?? numberFrom(row.price);
    const symbol = row.symbol?.toUpperCase();
    if (symbol && price !== null) {
      return [symbol, price];
    }
    return null;
  });
}

function buildTokenBalance(
  chain: WalletTokenChain,
  network: string,
  balance: AlchemyTokenBalance,
  prices: Map<string, number>,
): AlchemyWalletTokenBalance | null {
  const symbol = getSupportedWalletTokenSymbol(chain, {
    token_address: balance.contractAddress,
    native_token: false,
  });
  if (!symbol || !isPositiveRawBalance(balance.tokenBalance)) {
    return null;
  }

  const definition = getSupportedWalletTokenDefinition(symbol);
  const amount = formatUnits(
    bigintFromRawBalance(balance.tokenBalance),
    definition.decimals,
  );
  const numericAmount = numberFrom(amount) ?? 0;
  const address = balance.contractAddress.toLowerCase();
  const price = prices.get(`${network}:${address}`) ?? null;

  return {
    symbol,
    name: definition.name,
    token_address: address,
    native_token: false,
    balance_formatted: amount,
    usd_price: price,
    usd_value: price === null ? null : numericAmount * price,
  };
}

function buildNativeEthBalance(
  rawBalance: string,
  price: number | null,
): AlchemyWalletTokenBalance | null {
  if (!isPositiveRawBalance(rawBalance)) {
    return null;
  }

  const definition = getSupportedWalletTokenDefinition('ETH');
  const amount = formatUnits(
    bigintFromRawBalance(rawBalance),
    definition.decimals,
  );
  const numericAmount = numberFrom(amount) ?? 0;

  return {
    symbol: 'ETH',
    name: definition.name,
    token_address: null,
    native_token: true,
    balance_formatted: amount,
    usd_price: price,
    usd_value: price === null ? null : numericAmount * price,
  };
}

async function getAlchemyWalletTokenBalancesForChain(
  address: string,
  chain: AlchemyWalletChain,
  apiKey: string,
  addressPrices: Map<string, number>,
  symbolPrices: Map<string, number>,
): Promise<AlchemyChainBalances> {
  const network = ALCHEMY_RPC_NETWORK_BY_CHAIN[chain];
  const tokenAddresses = supportedWalletTokenAddresses(chain);
  const [tokenBalances, nativeBalance] = await Promise.all([
    fetchJsonRpc<AlchemyTokenBalancesResult>(
      network,
      apiKey,
      'alchemy_getTokenBalances',
      [address, tokenAddresses],
    ),
    fetchJsonRpc<string>(network, apiKey, 'eth_getBalance', [
      address,
      'latest',
    ]),
  ]);

  const erc20Balances = (tokenBalances.tokenBalances ?? [])
    .map((balance) => buildTokenBalance(chain, network, balance, addressPrices))
    .filter(
      (balance): balance is AlchemyWalletTokenBalance => balance !== null,
    );
  const native = buildNativeEthBalance(
    nativeBalance,
    symbolPrices.get('ETH') ?? null,
  );

  return {
    chain,
    response: {
      result: native ? [...erc20Balances, native] : erc20Balances,
    },
  };
}

export async function getAlchemyWalletTokenBalances(
  address: string,
): Promise<AlchemyChainBalances[]> {
  const apiKey = alchemyApiKey();
  const priceRequests = WALLET_TOKEN_CHAINS.flatMap((chain) => {
    const network = ALCHEMY_RPC_NETWORK_BY_CHAIN[chain];
    return supportedWalletTokenAddresses(chain).map((tokenAddress) => ({
      network,
      address: tokenAddress,
    }));
  });

  const [addressPrices, symbolPrices] = await Promise.all([
    fetchPriceByAddress(apiKey, priceRequests),
    fetchPriceBySymbol(apiKey, ['ETH']),
  ]);

  return Promise.all(
    ALCHEMY_WALLET_CHAINS.map((chain) =>
      getAlchemyWalletTokenBalancesForChain(
        address,
        chain,
        apiKey,
        addressPrices,
        symbolPrices,
      ),
    ),
  );
}
