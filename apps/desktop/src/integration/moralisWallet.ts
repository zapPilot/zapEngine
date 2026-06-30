import { useQuery } from '@tanstack/react-query';
import {
  getMoralisWalletHistory,
  getMoralisWalletTokenBalances,
  getSupportedMoralisWalletSymbol,
  getSupportedWalletTokenDefinition,
  type MoralisChainHistory,
  type MoralisSupportedWalletSymbol,
  type MoralisWalletChain,
  type MoralisWalletHistoryEvent,
  type MoralisWalletTokenBalance,
  type MoralisWalletTransfer,
} from '@zapengine/app-core/services';

import {
  type ActivityEvent,
  type ActivityGroup,
  type ActivityKind,
  type DemoAsset,
  type MetricTone,
} from '@/data/demo';
import {
  BASE_DEPOSIT_TOKENS,
  type DesktopDepositToken,
} from '@/integration/depositTokens';

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

const WALLET_HISTORY_LIMIT = 10;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const MORALIS_WALLET_CHAINS = [
  { moralis: 'eth', desktop: 'ethereum', label: 'Ethereum', chainId: 1 },
  { moralis: 'base', desktop: 'base', label: 'Base', chainId: 8453 },
  {
    moralis: 'arbitrum',
    desktop: 'arbitrum',
    label: 'Arbitrum',
    chainId: 42161,
  },
] as const satisfies readonly ChainConfig[];

const TOKEN_META: Record<
  SupportedWalletSymbol,
  { name: string; iconBg: string; glyph: string }
> = {
  USDC: { name: 'USD Coin', iconBg: '#2775ca', glyph: '$' },
  USDT: { name: 'Tether USD', iconBg: '#26a17b', glyph: '₮' },
  ETH: { name: 'Ethereum', iconBg: '#2a2a30', glyph: 'Ξ' },
  WETH: { name: 'Wrapped Ether', iconBg: '#627eea', glyph: 'Ξ' },
  WBTC: { name: 'Wrapped Bitcoin', iconBg: '#f7931a', glyph: '₿' },
  CBBTC: { name: 'Coinbase Wrapped BTC', iconBg: '#0052ff', glyph: '₿' },
};

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
  rawAmount: number;
  usdValue: number | null;
}

export interface InvestableBalanceRow {
  token: {
    symbol: SupportedWalletSymbol;
    name: string;
    iconBg: string;
    glyph: string;
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
    totalUsdValue:
      liveValues.length > 0
        ? liveValues.reduce((total, value) => total + value, 0)
        : null,
    ...buildHookStatus(query, enabled),
  };
}

export interface UseMoralisWalletAssetsResult {
  assets: DesktopWalletAsset[];
  rows: InvestableBalanceRow[];
  totalUsdValue: number | null;
  isConnected: boolean;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
}

export interface UseMoralisWalletHistoryResult {
  groups: ActivityGroup[];
  isConnected: boolean;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
}

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

function formatAmount(amount: number, symbol: SupportedWalletSymbol): string {
  const maximumFractionDigits =
    symbol === 'USDC' || symbol === 'USDT' ? 2 : symbol.includes('BTC') ? 8 : 6;
  const amountLabel = amount.toLocaleString('en-US', {
    maximumFractionDigits,
  });
  return `${amountLabel} ${symbol}`;
}

function formatUsdAmount(
  value: number | null,
  kind: ActivityKind,
): string | undefined {
  if (typeof value !== 'number') {
    return undefined;
  }
  const abs = Math.abs(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const sign = kind === 'withdraw' ? '−' : '+';
  return `${sign}$${abs}`;
}

function usdPriceFor(amount: number, usdValue: number | null): number | null {
  if (amount <= 0 || typeof usdValue !== 'number' || usdValue <= 0) {
    return null;
  }
  return usdValue / amount;
}

function sortChains(chains: DesktopChainKey[]): DesktopChainKey[] {
  return [...chains].sort(
    (a, b) => (CHAIN_ORDER.get(a) ?? 99) - (CHAIN_ORDER.get(b) ?? 99),
  );
}

function aggregateChainBalance(
  grouped: Map<
    SupportedWalletSymbol,
    {
      amount: number;
      usdValue: number;
      chains: Set<DesktopChainKey>;
      holdings: Map<DesktopChainKey, DesktopWalletAssetHolding>;
      name: string;
    }
  >,
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

  const meta = TOKEN_META[symbol];
  const definition = getSupportedWalletTokenDefinition(symbol);
  const tokenAddress =
    typeof balance.token_address === 'string' && balance.token_address.trim()
      ? (balance.token_address.trim().toLowerCase() as `0x${string}`)
      : null;
  const existing = grouped.get(symbol);
  const existingHolding = existing?.holdings.get(chainConfig.desktop);
  const holdingUsdValue =
    usdValue > 0
      ? (existingHolding?.usdValue ?? 0) + usdValue
      : (existingHolding?.usdValue ?? null);
  const nextHolding: DesktopWalletAssetHolding = {
    chain: chainConfig.desktop,
    chainId: chainConfig.chainId,
    tokenAddress,
    decimals: definition.decimals,
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
          : meta.name,
    });
  }
}

export function buildDesktopWalletAssets(
  chainBalances: readonly WalletChainBalancesLike[],
): DesktopWalletAsset[] {
  const grouped = new Map<
    SupportedWalletSymbol,
    {
      amount: number;
      usdValue: number;
      chains: Set<DesktopChainKey>;
      holdings: Map<DesktopChainKey, DesktopWalletAssetHolding>;
      name: string;
    }
  >();

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
      const meta = TOKEN_META[symbol];
      const usdValue = entry.usdValue > 0 ? entry.usdValue : null;
      return {
        symbol,
        name: entry.name,
        usdValue,
        amountLabel: formatAmount(entry.amount, symbol),
        chains: sortChains(Array.from(entry.chains)),
        holdings: sortChains(Array.from(entry.holdings.keys()))
          .map((chain) => entry.holdings.get(chain))
          .filter(
            (holding): holding is DesktopWalletAssetHolding =>
              holding !== undefined,
          ),
        iconBg: meta.iconBg,
        glyph: meta.glyph,
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
    const meta = TOKEN_META[asset.symbol];
    return {
      token: {
        symbol: asset.symbol,
        name: asset.name || meta.name,
        iconBg: asset.iconBg,
        glyph: asset.glyph,
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

function bucketForDate(
  dateStr: string | null | undefined,
  nowMs: number,
): ActivityGroup['label'] {
  if (!dateStr) {
    return 'Earlier';
  }
  const ts = Date.parse(dateStr);
  if (Number.isNaN(ts)) {
    return 'Earlier';
  }
  const diffDays = Math.floor((nowMs - ts) / MS_PER_DAY);
  if (diffDays <= 0) {
    return 'Today';
  }
  if (diffDays < 7) {
    return 'This week';
  }
  return 'Earlier';
}

function dateFormatOptions(
  options: Intl.DateTimeFormatOptions,
  timeZone: string | undefined,
): Intl.DateTimeFormatOptions {
  return timeZone ? { ...options, timeZone } : options;
}

function timeLabel(
  dateStr: string | null | undefined,
  nowMs: number,
  timeZone: string | undefined,
): string {
  if (!dateStr) {
    return '—';
  }
  const ts = Date.parse(dateStr);
  if (Number.isNaN(ts)) {
    return dateStr;
  }
  const d = new Date(ts);
  const diffDays = Math.floor((nowMs - ts) / MS_PER_DAY);
  if (diffDays <= 0) {
    return d.toLocaleTimeString(
      'en-US',
      dateFormatOptions(
        { hour: '2-digit', minute: '2-digit', hour12: false },
        timeZone,
      ),
    );
  }
  if (diffDays < 7) {
    return d.toLocaleDateString(
      'en-US',
      dateFormatOptions({ weekday: 'short' }, timeZone),
    );
  }
  return d.toLocaleDateString(
    'en-US',
    dateFormatOptions({ month: 'short', day: 'numeric' }, timeZone),
  );
}

function eventKindFrom(
  event: MoralisWalletHistoryEvent,
  transfer: MoralisWalletTransfer | null,
): ActivityKind {
  const direction = transfer?.direction?.toLowerCase() ?? '';
  const category = event.category?.toLowerCase() ?? '';
  if (
    direction.includes('receive') ||
    direction === 'in' ||
    category.includes('receive') ||
    category.includes('deposit')
  ) {
    return 'deposit';
  }
  if (
    direction.includes('send') ||
    direction === 'out' ||
    category.includes('send') ||
    category.includes('withdraw')
  ) {
    return 'withdraw';
  }
  if (category.includes('swap') || category.includes('token')) {
    return 'rebalance';
  }
  return 'strategy-update';
}

function successfulStatus(
  status: MoralisWalletHistoryEvent['receipt_status'],
): boolean {
  return status == null || status === true || status === '1' || status === 1;
}

interface SupportedActivityTransfer {
  transfer: MoralisWalletTransfer;
  symbol: SupportedWalletSymbol;
}

function firstSupportedTransfer(
  chain: MoralisChainKey,
  event: MoralisWalletHistoryEvent,
): SupportedActivityTransfer | null {
  for (const transfer of event.erc20_transfers ?? []) {
    const symbol = getSupportedMoralisWalletSymbol(chain, {
      symbol: transfer.token_symbol,
      token_address: transfer.token_address,
      native_token: false,
    });
    if (symbol) {
      return { transfer, symbol };
    }
  }

  for (const transfer of event.native_transfers ?? []) {
    const symbol = getSupportedMoralisWalletSymbol(chain, {
      symbol: transfer.token_symbol ?? 'ETH',
      token_address: transfer.token_address,
      native_token: true,
    });
    if (symbol) {
      return { transfer, symbol };
    }
  }

  return null;
}

function fallbackTitle(kind: ActivityKind, symbol: string | undefined): string {
  if (kind === 'deposit') {
    return symbol ? `Received ${symbol}` : 'Received assets';
  }
  if (kind === 'withdraw') {
    return symbol ? `Sent ${symbol}` : 'Sent assets';
  }
  if (kind === 'rebalance') {
    return 'Token activity';
  }
  return 'Wallet activity';
}

function activityEventFromMoralis(
  chain: MoralisChainKey,
  event: MoralisWalletHistoryEvent,
): ActivityEvent | null {
  const chainConfig = CHAIN_BY_MORALIS.get(chain);
  if (!chainConfig) {
    return null;
  }

  const supported = firstSupportedTransfer(chain, event);
  if (!supported) {
    return null;
  }

  const { transfer, symbol } = supported;
  const kind = eventKindFrom(event, transfer);
  const usdValue =
    numberFrom(transfer?.value_usd) ?? numberFrom(transfer?.total_usd);
  const amountLabel = formatUsdAmount(usdValue, kind);
  const amountTone: MetricTone =
    kind === 'deposit'
      ? 'positive'
      : kind === 'withdraw'
        ? 'negative'
        : 'neutral';
  const title =
    event.summary?.trim() || fallbackTitle(kind, symbol ?? undefined);
  const meta = symbol
    ? `${symbol} · ${chainConfig.label}`
    : `Wallet · ${chainConfig.label}`;

  return {
    id: `${chain}-${event.hash}`,
    kind,
    title,
    ...(amountLabel ? { amountLabel, amountTone } : {}),
    status: successfulStatus(event.receipt_status) ? 'Completed' : 'Failed',
    meta,
    time: '',
  };
}

export function buildActivityGroupsFromMoralisHistory(
  chainHistories: MoralisChainHistory[],
  options: ActivityHistoryOptions,
): ActivityGroup[] {
  const nowMs = options.nowMs ?? Date.now();
  const bucketed = chainHistories.flatMap(({ chain, response }) =>
    (response.result ?? [])
      .map((event) => {
        const activity = activityEventFromMoralis(chain, event);
        if (!activity) {
          return null;
        }
        const timestamp = Date.parse(event.block_timestamp ?? '');
        return {
          timestamp: Number.isNaN(timestamp) ? 0 : timestamp,
          bucket: bucketForDate(event.block_timestamp, nowMs),
          event: {
            ...activity,
            time: timeLabel(event.block_timestamp, nowMs, options.timeZone),
          },
        };
      })
      .filter(
        (
          value,
        ): value is {
          timestamp: number;
          bucket: ActivityGroup['label'];
          event: ActivityEvent;
        } => value !== null,
      ),
  );

  const limited = bucketed
    .toSorted((a, b) => b.timestamp - a.timestamp)
    .slice(0, options.limit);

  return ['Today', 'This week', 'Earlier']
    .map((label) => ({
      label,
      events: limited
        .filter((entry) => entry.bucket === label)
        .map((entry) => entry.event),
    }))
    .filter((group) => group.events.length > 0);
}

export function useMoralisWalletAssets(
  addressInput: WalletAddressInput,
): UseMoralisWalletAssetsResult {
  const walletAddresses = normalizeWalletAddressList(addressInput);
  const enabled = walletAddresses.length > 0;
  // jscpd:ignore-start
  const query = useQuery({
    queryKey: ['desktop', 'moralis', 'wallet-assets', walletAddresses],
    enabled,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const responses = (
        await Promise.all(
          walletAddresses.map((address) =>
            getMoralisWalletTokenBalances(address),
          ),
        )
      ).flat();
      const assets = buildDesktopWalletAssets(responses);
      return {
        assets,
        rows: buildInvestableBalanceRows(assets),
      };
    },
  });
  // jscpd:ignore-end

  return buildWalletAssetsResult(query, enabled);
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
              limit: WALLET_HISTORY_LIMIT,
            }),
          ),
        )
      ).flat();
      return buildActivityGroupsFromMoralisHistory(responses, {
        limit: WALLET_HISTORY_LIMIT,
      });
    },
  });
  // jscpd:ignore-end

  return {
    groups: query.data ?? [],
    ...buildHookStatus(query, enabled),
  };
}
