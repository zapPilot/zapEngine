import { CHAIN_BRAND } from '@zapengine/brand-assets/chains';
import { TOKEN_BRAND } from '@zapengine/brand-assets/tokens';
import { parseBaseUnits } from '@zapengine/app-core/lib/wallet/usd6';
import {
  getSupportedWalletTokenDefinition,
  getSupportedWalletTokenSymbol,
  type SupportedWalletTokenSymbol,
  type WalletTokenChain,
} from '@zapengine/app-core/services/walletTokenCatalog';
import { formatTokenBaseUnits } from '@zapengine/app-core/utils/formatting/tokenAmount';

import type { ChainKey, DemoAsset } from '@/integration/portfolioTypes';
import type { DesktopDepositToken } from '@/integration/depositTokens';
import { formatTokenAmount, numberFrom } from '@/lib/format';

type SupportedWalletSymbol = SupportedWalletTokenSymbol;

type AssetChainKey = ChainKey;

interface ChainConfig {
  chain: WalletTokenChain;
  assetChain: AssetChainKey;
  label: string;
  chainId: number;
}

const WALLET_ASSET_CHAINS = [
  {
    chain: 'eth',
    assetChain: 'ethereum',
    label: CHAIN_BRAND.ethereum.label,
    chainId: CHAIN_BRAND.ethereum.chainId,
  },
  {
    chain: 'base',
    assetChain: 'base',
    label: CHAIN_BRAND.base.label,
    chainId: CHAIN_BRAND.base.chainId,
  },
  {
    chain: 'arbitrum',
    assetChain: 'arbitrum',
    label: CHAIN_BRAND.arbitrum.label,
    chainId: CHAIN_BRAND.arbitrum.chainId,
  },
] as const satisfies readonly ChainConfig[];

/** Fallback name for a balance the indexer returned without one. */
function tokenBrandName(symbol: SupportedWalletSymbol): string {
  return TOKEN_BRAND[symbol].label;
}

const CHAIN_BY_TOKEN_CHAIN = new Map(
  WALLET_ASSET_CHAINS.map((chain) => [chain.chain, chain]),
);
const CHAIN_ORDER = new Map(
  WALLET_ASSET_CHAINS.map((chain, index) => [chain.assetChain, index]),
);

export interface DesktopWalletAsset extends DemoAsset {
  symbol: SupportedWalletSymbol;
  rawAmount: number;
  usdPrice: number | null;
  holdings: DesktopWalletAssetHolding[];
}

export interface DesktopWalletAssetHolding {
  chain: AssetChainKey;
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
  chain: AssetChainKey;
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
  chains: AssetChainKey[];
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
  failedChains?: WalletTokenChain[];
}

function buildHookStatus(
  query: {
    isLoading: boolean;
    isError: boolean;
    error: Error | null | undefined;
  },
  enabled: boolean,
): Pick<
  UseWalletAssetsResult,
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
): UseWalletAssetsResult {
  const assets = query.data?.assets ?? [];
  const rows = query.data?.rows ?? [];
  const liveValues = assets
    .map((asset) => asset.usdValue)
    .filter((value): value is number => typeof value === 'number');

  return {
    assets,
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

export interface WalletHookStatus {
  isConnected: boolean;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
}

export interface UseWalletAssetsResult extends WalletHookStatus {
  assets: DesktopWalletAsset[];
  rows: InvestableBalanceRow[];
  chainRows: ChainTokenBalanceRow[];
  failedChains: WalletTokenChain[];
  totalUsdValue: number | null;
}

export type WalletAddressInput =
  | string
  | null
  | undefined
  | readonly (string | null | undefined)[];

export interface WalletTokenBalanceLike {
  balance_formatted?: string | number | null | undefined;
  name?: string | null | undefined;
  native_token?: boolean | null | undefined;
  possible_spam?: boolean | null | undefined;
  symbol?: string | null | undefined;
  token_address?: string | null | undefined;
  usd_value?: string | number | null | undefined;
}

export interface WalletTokenBalancesResponse {
  result: WalletTokenBalanceLike[];
}

export interface WalletChainBalancesLike {
  chain: WalletTokenChain;
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

interface WalletAggregationEntry {
  amount: number;
  usdValue: number;
  chains: Set<AssetChainKey>;
  holdings: Map<AssetChainKey, DesktopWalletAssetHolding>;
  name: string;
}

type WalletAggregationMap = Map<SupportedWalletSymbol, WalletAggregationEntry>;

function sortChains(chains: AssetChainKey[]): AssetChainKey[] {
  return [...chains].sort(
    (a, b) => (CHAIN_ORDER.get(a) ?? 99) - (CHAIN_ORDER.get(b) ?? 99),
  );
}

function aggregateChainBalance(
  grouped: WalletAggregationMap,
  chainConfig: (typeof WALLET_ASSET_CHAINS)[number],
  balance: WalletTokenBalanceLike,
): void {
  const symbol = getSupportedWalletTokenSymbol(chainConfig.chain, balance);
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
  const existingHolding = existing?.holdings.get(chainConfig.assetChain);
  const baseUnits =
    parseBaseUnits(String(balance.balance_formatted ?? '0').trim(), {
      decimals: definition.decimals,
      truncateExcessFraction: true,
    }) ?? 0n;
  const balanceBaseUnits =
    BigInt(existingHolding?.balanceBaseUnits ?? '0') + baseUnits;
  const holdingUsdValue =
    usdValue > 0
      ? (existingHolding?.usdValue ?? 0) + usdValue
      : (existingHolding?.usdValue ?? null);
  const nextHolding: DesktopWalletAssetHolding = {
    chain: chainConfig.assetChain,
    chainId: chainConfig.chainId,
    tokenAddress,
    decimals: definition.decimals,
    balance: formatTokenBaseUnits(balanceBaseUnits, definition.decimals),
    balanceBaseUnits: balanceBaseUnits.toString(),
    rawAmount: (existingHolding?.rawAmount ?? 0) + amount,
    usdValue: holdingUsdValue,
  };
  if (existing) {
    existing.amount += amount;
    existing.usdValue += usdValue;
    existing.chains.add(chainConfig.assetChain);
    existing.holdings.set(chainConfig.assetChain, nextHolding);
  } else {
    grouped.set(symbol, {
      amount,
      usdValue,
      chains: new Set([chainConfig.assetChain]),
      holdings: new Map([[chainConfig.assetChain, nextHolding]]),
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
        const chain = WALLET_ASSET_CHAINS.find(
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
            (
              parseBaseUnits(String(holding.rawAmount).trim(), {
                decimals: holding.decimals,
                truncateExcessFraction: true,
              }) ?? 0n
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
    const chainConfig = CHAIN_BY_TOKEN_CHAIN.get(chain);
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
