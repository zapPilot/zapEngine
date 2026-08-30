#!/usr/bin/env tsx

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  DailySnapshot,
  Position,
  Transaction,
} from '../../packages/types/src/strategy/index.js';
import { DailySnapshotSchema } from '../../packages/types/src/strategy/index.js';
import { NATIVE_TOKEN_ADDRESS } from '../../packages/types/src/shared/tokens.js';
import { createSnapshotMessageHash } from '../../apps/landing-page/src/data/track-record-accessor';
import {
  createPublicClient,
  erc20Abi,
  formatEther,
  formatUnits,
  getAddress,
  http,
  type PublicClient,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { fetchFromIpfs } from './ipfs.js';

interface TrackedToken {
  chainId: number;
  asset: string;
  address?: `0x${string}`;
  decimals?: number;
  protocol?: string;
  pricingKey?: string;
  pricingSource?: string;
}

interface OraclePrice {
  usd: string | number;
}

interface PriceOracleResponse {
  prices: Record<string, OraclePrice | string | number>;
  benchmarks?: DailySnapshot['benchmarks'];
}

function parseArgs(): { out?: string } {
  const outIndex = process.argv.indexOf('--out');
  return {
    out:
      outIndex >= 0 && process.argv[outIndex + 1]
        ? process.argv[outIndex + 1]
        : undefined,
  };
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function parseCsv(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseJsonEnv<T>(name: string): T | null {
  const value = process.env[name];
  if (!value) return null;
  return JSON.parse(value) as T;
}

function parseRpcUrls(): Map<number, string> {
  const configured = JSON.parse(
    requiredEnv('TRACK_RECORD_RPC_URLS'),
  ) as unknown;
  if (
    !configured ||
    typeof configured !== 'object' ||
    Array.isArray(configured)
  ) {
    throw new Error(
      'TRACK_RECORD_RPC_URLS must be a JSON object keyed by chain id',
    );
  }

  const rpcUrls = new Map<number, string>();
  for (const [rawChainId, rawUrl] of Object.entries(configured)) {
    const chainId = Number(rawChainId);
    if (!Number.isInteger(chainId)) {
      throw new Error(
        `Invalid chain id in TRACK_RECORD_RPC_URLS: ${rawChainId}`,
      );
    }
    if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
      throw new Error(`Missing RPC URL for chain ${rawChainId}`);
    }
    if (rpcUrls.has(chainId)) {
      throw new Error(
        `Duplicate chain id in TRACK_RECORD_RPC_URLS: ${chainId}`,
      );
    }
    rpcUrls.set(chainId, rawUrl.trim());
  }
  if (rpcUrls.size === 0) {
    throw new Error('TRACK_RECORD_RPC_URLS must configure at least one chain');
  }
  return rpcUrls;
}

function parseTrackedTokens(
  chainIds: number[],
  rpcUrls: Map<number, string>,
): TrackedToken[] {
  const configured = parseJsonEnv<TrackedToken[]>('TRACK_RECORD_TOKENS_JSON');
  if (configured?.length) {
    const missingChainIds = [
      ...new Set(
        configured
          .map((token) => token.chainId)
          .filter((chainId) => !rpcUrls.has(chainId)),
      ),
    ].sort((a, b) => a - b);
    if (missingChainIds.length > 0) {
      throw new Error(
        `TRACK_RECORD_TOKENS_JSON references chains missing from TRACK_RECORD_RPC_URLS: ${missingChainIds.join(', ')}`,
      );
    }
    return configured;
  }

  return chainIds.map((chainId) => ({
    chainId,
    asset: chainId === 1 ? 'ETH' : `NATIVE-${chainId}`,
    decimals: 18,
    protocol: 'wallet',
    pricingKey: chainId === 1 ? 'ETH' : `native:${chainId}`,
    pricingSource: 'price-oracle',
  }));
}

function readPrice(
  prices: PriceOracleResponse['prices'],
  token: TrackedToken,
): number {
  const candidates = [
    token.pricingKey,
    token.address?.toLowerCase(),
    token.asset,
    token.address ? getAddress(token.address) : undefined,
    getAddress(NATIVE_TOKEN_ADDRESS),
  ].filter((value): value is string => !!value);

  for (const key of candidates) {
    const price = prices[key];
    if (typeof price === 'number') return price;
    if (typeof price === 'string') return Number(price);
    if (price && typeof price === 'object') return Number(price.usd);
  }

  throw new Error(
    `Missing USD price for ${token.asset} on chain ${token.chainId}`,
  );
}

async function fetchPriceOracle(): Promise<PriceOracleResponse> {
  const inline = parseJsonEnv<PriceOracleResponse>(
    'TRACK_RECORD_PRICE_ORACLE_JSON',
  );
  if (inline) return inline;

  const url = requiredEnv('TRACK_RECORD_PRICE_ORACLE_URL');
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Price oracle failed: HTTP ${res.status}`);
  return (await res.json()) as PriceOracleResponse;
}

// Reuse one public client and transport for every tracked token on a chain.
const clientsByChainId = new Map<number, PublicClient>();

function getClient(chainId: number, rpcUrls: Map<number, string>) {
  const cached = clientsByChainId.get(chainId);
  if (cached) return cached;

  const rpcUrl = rpcUrls.get(chainId);
  if (!rpcUrl) throw new Error(`Missing RPC URL for chain ${chainId}`);
  const client = createPublicClient({
    transport: http(rpcUrl),
  }) as PublicClient;
  clientsByChainId.set(chainId, client);
  return client;
}

async function readTokenAmount(
  token: TrackedToken,
  walletAddresses: `0x${string}`[],
  rpcUrls: Map<number, string>,
): Promise<string> {
  const client = getClient(token.chainId, rpcUrls);
  // One balance read per wallet, all independent; the sum is order-agnostic.
  const balances = await Promise.all(
    walletAddresses.map((walletAddress) =>
      token.address
        ? (client.readContract({
            address: token.address,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [walletAddress],
          } as never) as Promise<bigint>)
        : client.getBalance({ address: walletAddress }),
    ),
  );
  const total = balances.reduce((sum, balance) => sum + balance, 0n);

  if (!token.address) return formatEther(total);
  const decimals =
    token.decimals ??
    Number(
      await client.readContract({
        address: token.address,
        abi: erc20Abi,
        functionName: 'decimals',
      } as never),
    );
  return formatUnits(total, decimals);
}

function formatUsd(value: number): string {
  return value.toFixed(2);
}

function formatPercent(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${(value * 100).toFixed(2)}%`;
}

function formatDrawdown(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

async function fetchNavHistoryFromPreviousCid(
  previousCid: string | null,
  limit = 90,
): Promise<Array<{ navUsd: number }>> {
  if (!previousCid) return [];

  const snapshots: DailySnapshot[] = [];
  const visited = new Set<string>();
  let currentCid: string | null = previousCid;

  while (currentCid && snapshots.length < limit) {
    if (visited.has(currentCid)) break;
    visited.add(currentCid);

    const snapshot = DailySnapshotSchema.parse(await fetchFromIpfs(currentCid));
    snapshots.unshift(snapshot);
    currentCid = snapshot.previousCid;
  }

  return snapshots.map((snapshot) => ({ navUsd: Number(snapshot.nav.usd) }));
}

async function parseNavHistory(
  previousCid: string | null,
): Promise<Array<{ navUsd: number }>> {
  const history = parseJsonEnv<
    Array<{ nav?: { usd: string }; navUsd?: number }>
  >('TRACK_RECORD_HISTORY_JSON');
  if (!history) return fetchNavHistoryFromPreviousCid(previousCid);

  return history.map((entry) => ({
    navUsd:
      typeof entry.navUsd === 'number'
        ? entry.navUsd
        : Number(entry.nav?.usd ?? '0'),
  }));
}

function computePerformance(
  navUsd: number,
  navHistory: Array<{ navUsd: number }>,
): DailySnapshot['performance'] {
  const previousNav = navHistory.at(-1)?.navUsd;
  const firstNav =
    Number(process.env['TRACK_RECORD_INITIAL_NAV_USD']) ||
    navHistory[0]?.navUsd ||
    navUsd;
  const dailyReturn =
    previousNav && previousNav > 0 ? navUsd / previousNav - 1 : 0;
  const cumulativeReturn = firstNav > 0 ? navUsd / firstNav - 1 : 0;
  const peakNav = Math.max(...navHistory.map((entry) => entry.navUsd), navUsd);
  const maxDrawdown = peakNav > 0 ? navUsd / peakNav - 1 : 0;

  return {
    dailyReturn: formatPercent(dailyReturn),
    cumulativeReturn: formatPercent(cumulativeReturn),
    maxDrawdown: formatDrawdown(maxDrawdown),
  };
}

async function buildPositions(
  tokens: TrackedToken[],
  walletAddresses: `0x${string}`[],
  rpcUrls: Map<number, string>,
  prices: PriceOracleResponse['prices'],
): Promise<Position[]> {
  const rawPositions = await Promise.all(
    tokens.map(async (token) => {
      const amount = await readTokenAmount(token, walletAddresses, rpcUrls);
      const amountNumber = Number(amount);
      const priceUsd = readPrice(prices, token);
      return {
        chainId: token.chainId,
        protocol: token.protocol ?? 'wallet',
        asset: token.asset,
        tokenAddress: token.address,
        amount,
        valueUsd: amountNumber * priceUsd,
        pricingSource: token.pricingSource ?? 'price-oracle',
      };
    }),
  );

  const navUsd = rawPositions.reduce(
    (sum, position) => sum + position.valueUsd,
    0,
  );

  return rawPositions.map((position) => ({
    ...position,
    valueUsd: formatUsd(position.valueUsd),
    weight:
      navUsd > 0
        ? `${((position.valueUsd / navUsd) * 100).toFixed(2)}%`
        : '0.00%',
  }));
}

async function signSnapshot(
  snapshot: DailySnapshot,
): Promise<DailySnapshot['signature'] | undefined> {
  const privateKey = process.env['TRACK_RECORD_SIGNER_PRIVATE_KEY'];
  if (!privateKey) return undefined;

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const messageHash = createSnapshotMessageHash(snapshot);
  return {
    signer: account.address,
    signedAt: new Date().toISOString(),
    messageHash,
    signature: await account.signMessage({ message: { raw: messageHash } }),
  };
}

async function main(): Promise<void> {
  const { out } = parseArgs();
  const rpcUrls = parseRpcUrls();
  const chainIds = [...rpcUrls.keys()].sort((a, b) => a - b);
  const walletAddresses = parseCsv(
    requiredEnv('TRACK_RECORD_WALLET_ADDRESSES'),
  ).map((address) => getAddress(address) as `0x${string}`);
  const tokens = parseTrackedTokens(chainIds, rpcUrls);
  const oracle = await fetchPriceOracle();
  const positions = await buildPositions(
    tokens,
    walletAddresses,
    rpcUrls,
    oracle.prices,
  );
  const navUsd = positions.reduce(
    (sum, position) => sum + Number(position.valueUsd),
    0,
  );
  const previousCid = process.env['TRACK_RECORD_PREVIOUS_CID'] || null;
  const navHistory = await parseNavHistory(previousCid);
  const unsignedSnapshot: DailySnapshot = {
    schemaVersion: process.env['TRACK_RECORD_SCHEMA_VERSION'] ?? '1',
    strategyId:
      process.env['TRACK_RECORD_STRATEGY_ID'] ?? 'dma_fgi_portfolio_rules',
    strategyVersion: process.env['TRACK_RECORD_STRATEGY_VERSION'] ?? 'v1',
    date:
      process.env['TRACK_RECORD_DATE'] ?? new Date().toISOString().slice(0, 10),
    timestamp: new Date().toISOString(),
    chainIds,
    walletAddresses,
    previousCid,
    nav: { usd: formatUsd(navUsd) },
    performance: computePerformance(navUsd, navHistory),
    positions,
    costs: parseJsonEnv<DailySnapshot['costs']>('TRACK_RECORD_COSTS_JSON') ?? {
      gasUsd: '0',
      slippageUsd: '0',
      protocolFeesUsd: '0',
      totalUsd: '0',
    },
    transactions:
      parseJsonEnv<Transaction[]>('TRACK_RECORD_TRANSACTIONS_JSON') ?? [],
    benchmarks: oracle.benchmarks ?? [],
  };

  const signature = await signSnapshot(unsignedSnapshot);
  const snapshot = DailySnapshotSchema.parse({
    ...unsignedSnapshot,
    ...(signature ? { signature } : {}),
  });
  const output = `${JSON.stringify(snapshot, null, 2)}\n`;

  if (out) {
    await mkdir(path.dirname(out), { recursive: true });
    await writeFile(out, output);
    console.log(`Wrote DailySnapshot to ${out}`);
    return;
  }

  process.stdout.write(output);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
