import { useQuery } from '@tanstack/react-query';
import { CHAIN_BRAND, TOKEN_BRAND } from '@zapengine/brand-assets';
import {
  getMoralisWalletHistory,
  getSupportedMoralisWalletSymbol,
  getSupportedWalletTokenDefinition,
  type MoralisChainHistory,
  type MoralisSupportedWalletSymbol,
  type MoralisWalletChain,
  type MoralisWalletTokenBalance,
} from '@zapengine/app-core/services';

import {
  type ActivityCategoryFlow,
  type ActivityGroup,
  type DemoAsset,
} from '@/data/demo';
import {
  collapseBursts,
  mapMoralisEvent,
  summarizeCategoryFlows,
  type MappedActivityEvent,
} from '@/integration/activityEventModel';
import {
  BASE_DEPOSIT_TOKENS,
  type DesktopDepositToken,
} from '@/integration/depositTokens';
import { formatTokenAmount, numberFrom } from '@/lib/format';

export type MoralisChainKey = MoralisWalletChain;

export type {
  MoralisWalletHistoryResponse,
  MoralisWalletTokenBalancesResponse,
} from '@zapengine/app-core/services';

type SupportedWalletSymbol = MoralisSupportedWalletSymbol;

type DesktopChainKey = DemoAsset['chains'][number];

interface ChainConfig {
  moralis: MoralisChainKey;
  desktop: DesktopChainKey;
  label: string;
  chainId: number;
}

/** Raw transactions fetched per chain per wallet before semantic filtering. */
const MORALIS_HISTORY_FETCH_LIMIT = 50;
/** Logical events shown in the feed after dedupe and burst collapsing. */
const ACTIVITY_DISPLAY_LIMIT = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const MORALIS_WALLET_CHAINS = [
  {
    moralis: 'eth',
    desktop: 'ethereum',
    label: CHAIN_BRAND.ethereum.label,
    chainId: CHAIN_BRAND.ethereum.chainId,
  },
  {
    moralis: 'base',
    desktop: 'base',
    label: CHAIN_BRAND.base.label,
    chainId: CHAIN_BRAND.base.chainId,
  },
  {
    moralis: 'arbitrum',
    desktop: 'arbitrum',
    label: CHAIN_BRAND.arbitrum.label,
    chainId: CHAIN_BRAND.arbitrum.chainId,
  },
] as const satisfies readonly ChainConfig[];

/** Fallback name for a balance the indexer returned without one. */
function tokenBrandName(symbol: SupportedWalletSymbol): string {
  return TOKEN_BRAND[symbol].label;
}

const CHAIN_BY_MORALIS = new Map(
  MORALIS_WALLET_CHAINS.map((chain) => [chain.moralis, chain]),
);
const CHAIN_ORDER = new Map(
  MORALIS_WALLET_CHAINS.map((chain, index) => [chain.desktop, index]),
);

export interface DesktopWalletAsset extends DemoAsset {
  symbol: SupportedWalletSymbol;
  rawAmount: number;
  usdPrice: number | null;
  holdings: DesktopWalletAssetHolding[];
}

export interface DesktopWalletAssetHolding {
  chain: DesktopChainKey;
  chainId: number;
  tokenAddress: `0x${string}` | null;
  decimals: number;
  /** Exact decimal balance for display/input; never derived from JS number. */
  balance?: string;
  /** Exact chain base units for transaction validation and Max. */
  balanceBaseUnits?: string;
  rawAmount: number;
  usdValue: number | null;
}

export interface ChainTokenBalanceRow {
  id: string;
  chain: DesktopChainKey;
  chainLabel: string;
  chainId: number;
  tokenAddress: `0x${string}` | null;
  decimals: number;
  balance: string;
  balanceBaseUnits: string;
  usdValue: number | null;
  usdPrice: number | null;
  token: {
    symbol: SupportedWalletSymbol;
    name: string;
  };
}

export interface InvestableBalanceRow {
  token: {
    symbol: SupportedWalletSymbol;
    name: string;
  };
  chains: DesktopChainKey[];
  depositToken: DesktopDepositToken | null;
  balance: string | null;
  amountLabel: string;
  usdValue: number | null;
  usdPrice: number | null;
  isDepositSupported: boolean;
  isLoading: boolean;
  isError: boolean;
}

export interface WalletAssetsQueryData {
  assets: DesktopWalletAsset[];
  rows: InvestableBalanceRow[];
  chainRows: ChainTokenBalanceRow[];
  failedChains?: MoralisChainKey[];
}

function buildHookStatus(
  query: {
    isLoading: boolean;
    isError: boolean;
    error: Error | null | undefined;
  },
  enabled: boolean,
): Pick<
  UseMoralisWalletAssetsResult,
  'isConnected' | 'isLoading' | 'isError' | 'error'
> {
  return {
    isConnected: enabled,
    isLoading: enabled && query.isLoading,
    isError: query.isError,
    error: query.error ?? null,
  };
}

export function buildWalletAssetsResult(
  query: {
    data?: WalletAssetsQueryData | null | undefined;
    isLoading: boolean;
    isError: boolean;
    error: Error | null | undefined;
    refetch?: (() => Promise<unknown>) | undefined;
  },
  enabled: boolean,
): UseMoralisWalletAssetsResult {
  const rows = query.data?.rows ?? [];
  const liveValues = rows
    .map((row) => row.usdValue)
    .filter((value): value is number => typeof value === 'number');

  return {
    assets: query.data?.assets ?? [],
    rows,
    chainRows: query.data?.chainRows ?? [],
    failedChains: query.data?.failedChains ?? [],
    totalUsdValue:
      liveValues.length > 0
        ? liveValues.reduce((total, value) => total + value, 0)
        : null,
    ...buildHookStatus(query, enabled),
    refetch: query.refetch ?? (async () => undefined),
  };
}

export interface MoralisHookStatus {
  isConnected: boolean;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
}

export interface UseMoralisWalletAssetsResult extends MoralisHookStatus {
  assets: DesktopWalletAsset[];
  rows: InvestableBalanceRow[];
  chainRows: ChainTokenBalanceRow[];
  failedChains: MoralisChainKey[];
  totalUsdValue: number | null;
}

export interface ActivityHistoryData {
  groups: ActivityGroup[];
  summary: ActivityCategoryFlow[];
}

export interface UseMoralisWalletHistoryResult
  extends ActivityHistoryData, MoralisHookStatus {}

export interface ActivityHistoryOptions {
  limit: number;
  nowMs?: number;
  timeZone?: string;
}

export type WalletAddressInput =
  | string
  | null
  | undefined
  | readonly (string | null | undefined)[];

export type WalletTokenBalanceLike = Pick<
  MoralisWalletTokenBalance,
  | 'balance_formatted'
  | 'name'
  | 'native_token'
  | 'possible_spam'
  | 'symbol'
  | 'token_address'
  | 'usd_value'
>;

export interface WalletChainBalancesLike {
  chain: MoralisChainKey;
  response: {
    result: WalletTokenBalanceLike[];
  };
}

export function normalizeWalletAddressList(
  input: WalletAddressInput,
): string[] {
  const candidates = Array.isArray(input) ? input : [input];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const normalized = candidate?.trim().toLowerCase();
    if (normalized) {
      seen.add(normalized);
    }
  }

  return Array.from(seen);
}

function usdPriceFor(amount: number, usdValue: number | null): number | null {
  if (amount <= 0 || typeof usdValue !== 'number' || usdValue <= 0) {
    return null;
  }
  return usdValue / amount;
}

function decimalToBaseUnits(value: string, decimals: number): bigint {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) return 0n;
  const fraction = (match[2] ?? '').slice(0, decimals).padEnd(decimals, '0');
  return BigInt(match[1]!) * 10n ** BigInt(decimals) + BigInt(fraction || '0');
}

function baseUnitsToDecimal(value: bigint, decimals: number): string {
  if (decimals === 0) return value.toString();
  const scale = 10n ** BigInt(decimals);
  const whole = value / scale;
  const fraction = (value % scale).toString().padStart(decimals, '0');
  const trimmed = fraction.replace(/0+$/u, '');
  return trimmed ? `${whole}.${trimmed}` : whole.toString();
}

interface WalletAggregationEntry {
  amount: number;
  usdValue: number;
  chains: Set<DesktopChainKey>;
  holdings: Map<DesktopChainKey, DesktopWalletAssetHolding>;
  name: string;
}

type WalletAggregationMap = Map<SupportedWalletSymbol, WalletAggregationEntry>;

function sortChains(chains: DesktopChainKey[]): DesktopChainKey[] {
  return [...chains].sort(
    (a, b) => (CHAIN_ORDER.get(a) ?? 99) - (CHAIN_ORDER.get(b) ?? 99),
  );
}

function aggregateChainBalance(
  grouped: WalletAggregationMap,
  chainConfig: (typeof MORALIS_WALLET_CHAINS)[number],
  balance: WalletTokenBalanceLike,
): void {
  const symbol = getSupportedMoralisWalletSymbol(chainConfig.moralis, balance);
  if (!symbol) {
    return;
  }

  const amount = numberFrom(balance.balance_formatted) ?? 0;
  const usdValue = numberFrom(balance.usd_value) ?? 0;
  if (amount <= 0 && usdValue <= 0) {
    return;
  }

  const definition = getSupportedWalletTokenDefinition(symbol);
  const tokenAddress =
    typeof balance.token_address === 'string' && balance.token_address.trim()
      ? (balance.token_address.trim().toLowerCase() as `0x${string}`)
      : null;
  const existing = grouped.get(symbol);
  const existingHolding = existing?.holdings.get(chainConfig.desktop);
  const baseUnits = decimalToBaseUnits(
    String(balance.balance_formatted ?? '0'),
    definition.decimals,
  );
  const balanceBaseUnits =
    BigInt(existingHolding?.balanceBaseUnits ?? '0') + baseUnits;
  const holdingUsdValue =
    usdValue > 0
      ? (existingHolding?.usdValue ?? 0) + usdValue
      : (existingHolding?.usdValue ?? null);
  const nextHolding: DesktopWalletAssetHolding = {
    chain: chainConfig.desktop,
    chainId: chainConfig.chainId,
    tokenAddress,
    decimals: definition.decimals,
    balance: baseUnitsToDecimal(balanceBaseUnits, definition.decimals),
    balanceBaseUnits: balanceBaseUnits.toString(),
    rawAmount: (existingHolding?.rawAmount ?? 0) + amount,
    usdValue: holdingUsdValue,
  };
  if (existing) {
    existing.amount += amount;
    existing.usdValue += usdValue;
    existing.chains.add(chainConfig.desktop);
    existing.holdings.set(chainConfig.desktop, nextHolding);
  } else {
    grouped.set(symbol, {
      amount,
      usdValue,
      chains: new Set([chainConfig.desktop]),
      holdings: new Map([[chainConfig.desktop, nextHolding]]),
      name:
        typeof balance.name === 'string' && balance.name.trim()
          ? balance.name.trim()
          : tokenBrandName(symbol),
    });
  }
}

export function buildChainTokenBalanceRows(
  assets: readonly DesktopWalletAsset[],
): ChainTokenBalanceRow[] {
  return assets
    .flatMap((asset) =>
      asset.holdings.map((holding) => {
        const chain = MORALIS_WALLET_CHAINS.find(
          (candidate) => candidate.chainId === holding.chainId,
        );
        const holdingAmount = numberFrom(holding.balance) ?? 0;
        return {
          id: `${holding.chainId}:${asset.symbol}`,
          chain: holding.chain,
          chainLabel: chain?.label ?? String(holding.chainId),
          chainId: holding.chainId,
          tokenAddress: holding.tokenAddress,
          decimals: holding.decimals,
          balance: holding.balance ?? String(holding.rawAmount),
          balanceBaseUnits:
            holding.balanceBaseUnits ??
            decimalToBaseUnits(
              String(holding.rawAmount),
              holding.decimals,
            ).toString(),
          usdValue: holding.usdValue,
          usdPrice: usdPriceFor(holdingAmount, holding.usdValue),
          token: {
            symbol: asset.symbol,
            name: asset.name || tokenBrandName(asset.symbol),
          },
        } satisfies ChainTokenBalanceRow;
      }),
    )
    .sort((a, b) => {
      const positiveDifference =
        Number(BigInt(b.balanceBaseUnits) > 0n) -
        Number(BigInt(a.balanceBaseUnits) > 0n);
      return positiveDifference || (b.usdValue ?? 0) - (a.usdValue ?? 0);
    });
}

export function buildDesktopWalletAssets(
  chainBalances: readonly WalletChainBalancesLike[],
): DesktopWalletAsset[] {
  const grouped: WalletAggregationMap = new Map();

  for (const { chain, response } of chainBalances) {
    const chainConfig = CHAIN_BY_MORALIS.get(chain);
    if (!chainConfig) {
      continue;
    }

    for (const balance of response.result ?? []) {
      if (balance.possible_spam) {
        continue;
      }
      aggregateChainBalance(grouped, chainConfig, balance);
    }
  }

  return Array.from(grouped.entries())
    .map(([symbol, entry]) => {
      const usdValue = entry.usdValue > 0 ? entry.usdValue : null;
      return {
        symbol,
        name: entry.name,
        usdValue,
        amountLabel: formatTokenAmount(entry.amount, symbol, 'wallet-activity'),
        chains: sortChains(Array.from(entry.chains)),
        holdings: sortChains(Array.from(entry.holdings.keys()))
          .map((chain) => entry.holdings.get(chain))
          .filter(
            (holding): holding is DesktopWalletAssetHolding =>
              holding !== undefined,
          ),
        rawAmount: entry.amount,
        usdPrice: usdPriceFor(entry.amount, usdValue),
      };
    })
    .sort((a, b) => (b.usdValue ?? 0) - (a.usdValue ?? 0));
}

function depositTokenFor(
  asset: DesktopWalletAsset,
): DesktopDepositToken | null {
  if (!asset.chains.includes('base')) {
    return null;
  }
  return (
    BASE_DEPOSIT_TOKENS.find((token) => token.symbol === asset.symbol) ?? null
  );
}

export function buildInvestableBalanceRows(
  assets: DesktopWalletAsset[],
): InvestableBalanceRow[] {
  return assets.map((asset) => {
    const depositToken = depositTokenFor(asset);
    return {
      token: {
        symbol: asset.symbol,
        name: asset.name || tokenBrandName(asset.symbol),
      },
      chains: asset.chains,
      depositToken,
      balance: asset.rawAmount > 0 ? String(asset.rawAmount) : null,
      amountLabel: asset.amountLabel,
      usdValue: asset.usdValue,
      usdPrice: asset.usdPrice,
      isDepositSupported: depositToken !== null,
      isLoading: false,
      isError: false,
    };
  });
}

export const ACTIVITY_BUCKETS = ['Today', 'This week', 'Earlier'] as const;

export type ActivityBucket = (typeof ACTIVITY_BUCKETS)[number];

function bucketForTimestamp(timestamp: number, nowMs: number): ActivityBucket {
  if (timestamp <= 0) {
    return 'Earlier';
  }
  const diffDays = Math.floor((nowMs - timestamp) / MS_PER_DAY);
  if (diffDays <= 0) {
    return 'Today';
  }
  if (diffDays < 7) {
    return 'This week';
  }
  return 'Earlier';
}

function timeLabel(timestamp: number, nowMs: number): string {
  if (timestamp <= 0) {
    return '—';
  }
  const elapsedMs = Math.max(0, nowMs - timestamp);
  const elapsedMinutes = Math.floor(elapsedMs / (60 * 1000));
  if (elapsedMinutes < 1) {
    return 'now';
  }
  if (elapsedMinutes < 60) {
    return `${elapsedMinutes}m`;
  }
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return `${elapsedHours}h`;
  }
  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays < 7) {
    return `${elapsedDays}d`;
  }
  if (elapsedDays < 30) {
    return `${Math.floor(elapsedDays / 7)}w`;
  }
  if (elapsedDays < 365) {
    return `${Math.floor(elapsedDays / 30)}mo`;
  }
  return `${Math.floor(elapsedDays / 365)}y`;
}

export function buildActivityGroupsFromMoralisHistory(
  chainHistories: MoralisChainHistory[],
  options: ActivityHistoryOptions,
): ActivityHistoryData {
  const nowMs = options.nowMs ?? Date.now();

  const seen = new Set<string>();
  const mapped: MappedActivityEvent[] = [];
  for (const { chain, response } of chainHistories) {
    const context = CHAIN_BY_MORALIS.get(chain);
    if (!context) {
      continue;
    }
    for (const event of response.result ?? []) {
      const activity = mapMoralisEvent(context, event);
      if (!activity) {
        continue;
      }
      const dedupeKey = `${chain}:${event.hash}`;
      if (seen.has(dedupeKey)) {
        continue;
      }
      seen.add(dedupeKey);
      mapped.push(activity);
    }
  }

  const collapsed = collapseBursts(
    mapped.toSorted((a, b) => b.timestamp - a.timestamp),
  ).slice(0, options.limit);

  const groups = ACTIVITY_BUCKETS.map((label) => ({
    label,
    events: collapsed
      .filter((event) => bucketForTimestamp(event.timestamp, nowMs) === label)
      .map((event) => ({
        ...event,
        time: timeLabel(event.timestamp, nowMs),
      })),
  })).filter((group) => group.events.length > 0);

  return { groups, summary: summarizeCategoryFlows(collapsed) };
}

export function useMoralisWalletHistory(
  addressInput: WalletAddressInput,
): UseMoralisWalletHistoryResult {
  const walletAddresses = normalizeWalletAddressList(addressInput);
  const enabled = walletAddresses.length > 0;
  // jscpd:ignore-start
  const query = useQuery({
    queryKey: ['desktop', 'moralis', 'wallet-history', walletAddresses],
    enabled,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const responses = (
        await Promise.all(
          walletAddresses.map((address) =>
            getMoralisWalletHistory(address, {
              limit: MORALIS_HISTORY_FETCH_LIMIT,
            }),
          ),
        )
      ).flat();
      return buildActivityGroupsFromMoralisHistory(responses, {
        limit: ACTIVITY_DISPLAY_LIMIT,
      });
    },
  });
  // jscpd:ignore-end

  return {
    groups: query.data?.groups ?? [],
    summary: query.data?.summary ?? [],
    ...buildHookStatus(query, enabled),
    refetch: query.refetch,
  };
}
