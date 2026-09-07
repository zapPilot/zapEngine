/**
 * Characterization harness for `HomeScreen`.
 *
 * `@testing-library/react` is not a dependency of this workspace, so mounting
 * is hand-rolled on `createRoot` + `act`, mirroring
 * `tests/PortfolioTrendChart.test.tsx`.
 *
 * This file is deliberately `.tsx` rather than `.ts`: `knip.ts` scopes
 * `project` to `tests/**\/*.ts` and only treats `tests/**\/*.test.ts` as an
 * entry, so a shared `.ts` helper imported solely from `.test.tsx` specs would
 * be reported as unused. A `.tsx` helper falls outside that glob entirely.
 *
 * Mock factories cannot close over module-scope variables (vitest hoists them),
 * so the spec registers each `vi.mock` with an async factory that imports this
 * module and hands back one of the `homeScreenMocks` entries. Every mock reads
 * `homeScreenState` lazily, which is what lets a preset be swapped between
 * renders. Nothing here may import `@/screens/HomeScreen` at module scope: the
 * screen's own imports resolve back into this module through those factories,
 * so the component is pulled in dynamically inside `renderHomeScreen`.
 */

import type { EtlJobPollingState } from '@zapengine/app-core/hooks/wallet';
import type { DailyYieldReturnsResponse } from '@zapengine/app-core/services';
import type { DailySuggestionResponse } from '@zapengine/app-core/types/strategy';
import { act, useEffect, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { vi } from 'vitest';

import { en } from '@/i18n/translations';
import type { HomeIncomeView } from '@/integration/homeIncomeModel';
import type { DailyValuePoint } from '@/integration/portfolioMetrics';
import type { DesktopAccount } from '@/integration/useAccount';
import type { UseWalletAssetsResult } from '@/integration/walletTokens';

export const OWN_USER_ID = '5fc63d4e-4e07-47d8-840b-ccd3420d553f';
export const OTHER_USER_ID = '9a1d1f5e-6c02-4a5b-9e4c-7d1b2f3a4c5d';
export const ETL_JOB_ID = 'etl-job-1';
export const OWN_ADDRESS = '0xf8a6000000000000000000000000000000000f94';
export const SECOND_ADDRESS = '0xb17c000000000000000000000000000000000c71';

/* -------------------------------------------------------------------------- */
/* Fixture shapes                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Portfolio balance in the *landing* shape (`{ data, isLoading, error }`).
 *
 * The screen currently reads it through `usePortfolioDataProgressive`, whose
 * nested `{ unifiedData, sections }` shape is derived from this by
 * `toProgressiveResult` below. When `useHomeData` moves to `useLandingPageData`
 * only that derivation changes — specs keep describing fixtures in this shape.
 */
export interface LandingFixture {
  data: { balance: number | null; lastUpdated: string | null } | null;
  isLoading: boolean;
  error: Error | null;
}

export interface DashboardFixture {
  dashboard: { trends: { daily_values: DailyValuePoint[] } } | null;
  isLoading: boolean;
  isError: boolean;
}

export interface SuggestionFixture {
  data: DailySuggestionResponse | null;
  isLoading: boolean;
  isError: boolean;
}

export interface YieldReturnsFixture {
  data: DailyYieldReturnsResponse | undefined;
}

export interface EtlFixture {
  state: EtlJobPollingState;
  startPolling: ReturnType<typeof vi.fn>;
  triggerEtl: ReturnType<typeof vi.fn>;
  reset: ReturnType<typeof vi.fn>;
  completeTransition: ReturnType<typeof vi.fn>;
}

export interface IncomeFixture {
  income: HomeIncomeView;
  isLoading: boolean;
  isError: boolean;
}

export interface HomeScreenState {
  account: DesktopAccount;
  etl: EtlFixture;
  landing: LandingFixture;
  dashboard: DashboardFixture;
  suggestion: SuggestionFixture;
  yieldReturns: YieldReturnsFixture;
  income: IncomeFixture;
  wallet: UseWalletAssetsResult;
}

export interface HomeScreenOverrides {
  account?: DesktopAccount;
  etl?: EtlFixture;
  landing?: LandingFixture;
  dashboard?: DashboardFixture;
  suggestion?: SuggestionFixture;
  yieldReturns?: YieldReturnsFixture;
  income?: IncomeFixture;
  wallet?: UseWalletAssetsResult;
}

/* -------------------------------------------------------------------------- */
/* Account presets                                                            */
/* -------------------------------------------------------------------------- */

function baseAccount(): DesktopAccount {
  return {
    isConnected: false,
    isConnecting: false,
    address: null,
    walletAddresses: [],
    walletEntries: [],
    userId: null,
    etlJobId: null,
    isNewUser: false,
    viewingUserId: null,
    isOwnBundle: true,
    isResolvingViewingUser: false,
    isUserResolutionFailed: false,
    isDemo: true,
    email: null,
    loadingUser: false,
    connectionError: null,
    userResolutionError: null,
    connect: vi.fn(async () => undefined),
    retryUserResolution: vi.fn(async () => undefined),
    disconnect: vi.fn(async () => undefined),
  };
}

export const accountFixtures = {
  /** Disconnected visitor with no `?userId=` override — the DEMO preview. */
  demo(overrides: Partial<DesktopAccount> = {}): DesktopAccount {
    return { ...baseAccount(), ...overrides };
  },
  /** Connected wallet whose own account-engine record resolved. */
  ownBundle(overrides: Partial<DesktopAccount> = {}): DesktopAccount {
    return {
      ...baseAccount(),
      isConnected: true,
      address: OWN_ADDRESS,
      walletAddresses: [OWN_ADDRESS, SECOND_ADDRESS],
      walletEntries: [
        { address: OWN_ADDRESS, label: 'Main' },
        { address: SECOND_ADDRESS, label: null },
      ],
      userId: OWN_USER_ID,
      etlJobId: ETL_JOB_ID,
      viewingUserId: OWN_USER_ID,
      isOwnBundle: true,
      isDemo: false,
      email: 'owner@example.com',
      ...overrides,
    };
  },
  /** Read-only `?userId=` view of somebody else's bundle. */
  bundleView(overrides: Partial<DesktopAccount> = {}): DesktopAccount {
    return {
      ...baseAccount(),
      viewingUserId: OTHER_USER_ID,
      isOwnBundle: false,
      isDemo: false,
      ...overrides,
    };
  },
  /** Connected and still waiting on account-engine. */
  resolving(overrides: Partial<DesktopAccount> = {}): DesktopAccount {
    return {
      ...baseAccount(),
      isConnected: true,
      address: OWN_ADDRESS,
      isResolvingViewingUser: true,
      isDemo: false,
      loadingUser: true,
      ...overrides,
    };
  },
  /** Connected wallet whose account record failed to load. */
  resolutionFailed(overrides: Partial<DesktopAccount> = {}): DesktopAccount {
    return {
      ...baseAccount(),
      isConnected: true,
      address: OWN_ADDRESS,
      isResolvingViewingUser: true,
      isUserResolutionFailed: true,
      isDemo: false,
      loadingUser: false,
      userResolutionError: 'Account lookup failed',
      ...overrides,
    };
  },
};

/* -------------------------------------------------------------------------- */
/* Portfolio presets                                                          */
/* -------------------------------------------------------------------------- */

export const LOADED_BALANCE_USD = 12_345.67;
export const LOADED_LAST_UPDATED = '2026-08-22T00:00:00.000Z';

export const landingFixtures = {
  loaded(): LandingFixture {
    return {
      data: { balance: LOADED_BALANCE_USD, lastUpdated: LOADED_LAST_UPDATED },
      isLoading: false,
      error: null,
    };
  },
  /** Settled, but the account has no snapshot yet (`snapshotAvailability`). */
  noHistory(): LandingFixture {
    return {
      data: { balance: null, lastUpdated: null },
      isLoading: false,
      error: null,
    };
  },
  loading(): LandingFixture {
    return { data: null, isLoading: true, error: null };
  },
  failed(): LandingFixture {
    return { data: null, isLoading: false, error: new Error('balance failed') };
  },
};

/**
 * Four snapshots, spaced so a 1W slice keeps exactly the last three and a 1Y
 * slice keeps all four.
 */
export const LOADED_DAILY_VALUES: DailyValuePoint[] = [
  { date: '2026-07-01', total_value_usd: 100 },
  { date: '2026-08-16', total_value_usd: 120 },
  { date: '2026-08-20', total_value_usd: 118 },
  { date: '2026-08-22', total_value_usd: 130 },
];

export const dashboardFixtures = {
  /**
   * Settled with nothing to show — what a demo visitor gets, since
   * `usePortfolioDashboard` is called with an undefined subject.
   */
  none(): DashboardFixture {
    return { dashboard: null, isLoading: false, isError: false };
  },
  loaded(): DashboardFixture {
    return {
      dashboard: { trends: { daily_values: [...LOADED_DAILY_VALUES] } },
      isLoading: false,
      isError: false,
    };
  },
  loading(): DashboardFixture {
    return { dashboard: null, isLoading: true, isError: false };
  },
  failed(): DashboardFixture {
    return { dashboard: null, isLoading: false, isError: true };
  },
};

function yieldEntry(
  date: string,
  protocolUsd: number,
  marketUsd: number,
): DailyYieldReturnsResponse['daily_returns'][number] {
  return {
    date,
    protocol_name: 'Aave',
    chain: 'ethereum',
    yield_return_usd: protocolUsd,
    outlier: false,
    tokens: [
      {
        symbol: 'ETH',
        amount_change: 0,
        current_price: 2_400,
        yield_return_usd: 0,
        market_return_usd: marketUsd,
      },
    ],
  };
}

export const yieldReturnsFixtures = {
  none(): YieldReturnsFixture {
    return { data: undefined };
  },
  /** Explains every snapshot day of `LOADED_DAILY_VALUES`. */
  loaded(): YieldReturnsFixture {
    return {
      data: {
        user_id: OWN_USER_ID,
        period: {
          start_date: '2026-07-01',
          end_date: '2026-08-22',
          days: 365,
        },
        daily_returns: [
          yieldEntry('2026-08-16', 4, 12),
          yieldEntry('2026-08-20', 1, -4),
          yieldEntry('2026-08-22', 2, 8),
        ],
        wallet_returns: [],
      },
    };
  },
};

/* -------------------------------------------------------------------------- */
/* Strategy suggestion presets                                                */
/* -------------------------------------------------------------------------- */

function suggestion(
  status: 'action_required' | 'no_action',
  extra: {
    reasonCode: string;
    regime: string;
    sentiment: number;
    transfers: { from_bucket: string; to_bucket: string; amount_usd: number }[];
  },
): DailySuggestionResponse {
  return {
    as_of: '2026-08-22',
    config_id: 'config',
    config_display_name: 'Strategy',
    strategy_id: 'strategy',
    action: {
      status,
      required: status === 'action_required',
      kind: 'rebalance',
      reason_code: extra.reasonCode,
      transfers: extra.transfers,
    },
    context: {
      portfolio: { total_value: 12_345.67, asset_allocation: { stable: 1 } },
      target: { allocation: { btc: 0, eth: 1, spy: 0, stable: 0, alt: 0 } },
      market: { sentiment: extra.sentiment },
      signal: { regime: extra.regime },
      strategy: { stance: 'buy', reason_code: 'ratio', rule_group: 'rotation' },
    },
  } as unknown as DailySuggestionResponse;
}

export const suggestionFixtures = {
  actionRequired(): SuggestionFixture {
    return {
      data: suggestion('action_required', {
        reasonCode: 'eth_btc_ratio_rebalance',
        regime: 'risk_on',
        sentiment: 62,
        transfers: [
          { from_bucket: 'stable', to_bucket: 'eth', amount_usd: 1_000 },
        ],
      }),
      isLoading: false,
      isError: false,
    };
  },
  noAction(): SuggestionFixture {
    return {
      data: suggestion('no_action', {
        reasonCode: 'already_aligned',
        regime: 'cautious',
        sentiment: 34,
        transfers: [],
      }),
      isLoading: false,
      isError: false,
    };
  },
  none(): SuggestionFixture {
    return { data: null, isLoading: false, isError: false };
  },
};

/* -------------------------------------------------------------------------- */
/* ETL presets                                                                */
/* -------------------------------------------------------------------------- */

function etlFixture(state: EtlJobPollingState): EtlFixture {
  return {
    state,
    startPolling: vi.fn(),
    triggerEtl: vi.fn(async () => undefined),
    reset: vi.fn(),
    completeTransition: vi.fn(),
  };
}

export const etlFixtures = {
  idle(): EtlFixture {
    return etlFixture({
      jobId: null,
      status: 'idle',
      errorMessage: undefined,
      isLoading: false,
      isInProgress: false,
    });
  },
  /** Job scheduled by account-engine but not yet picked up by the poller. */
  pending(): EtlFixture {
    return etlFixture({
      jobId: null,
      status: 'pending',
      errorMessage: undefined,
      isLoading: true,
      isInProgress: true,
    });
  },
  failed(errorMessage?: string): EtlFixture {
    return etlFixture({
      jobId: ETL_JOB_ID,
      status: 'failed',
      errorMessage,
      isLoading: false,
      isInProgress: false,
    });
  },
  completed(): EtlFixture {
    return etlFixture({
      jobId: ETL_JOB_ID,
      status: 'completed',
      errorMessage: undefined,
      isLoading: false,
      isInProgress: false,
    });
  },
};

/* -------------------------------------------------------------------------- */
/* Wallet-assets presets                                                      */
/* -------------------------------------------------------------------------- */

function walletAsset(
  symbol: 'USDC' | 'ETH',
  name: string,
  usdValue: number,
  amountLabel: string,
): UseWalletAssetsResult['assets'][number] {
  return {
    symbol,
    name,
    usdValue,
    amountLabel,
    chains: ['base'],
    rawAmount: usdValue,
    usdPrice: 1,
    holdings: [],
  };
}

export const WALLET_TOTAL_USD = 6_000.75;

function baseWallet(): UseWalletAssetsResult {
  return {
    assets: [],
    rows: [],
    chainRows: [],
    failedChains: [],
    totalUsdValue: null,
    isConnected: true,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(async () => undefined),
  };
}

export const walletFixtures = {
  loaded(): UseWalletAssetsResult {
    return {
      ...baseWallet(),
      assets: [
        walletAsset('USDC', 'USD Coin', 4_200.5, '4,200.50 USDC'),
        walletAsset('ETH', 'Ethereum', 1_800.25, '0.75 ETH'),
      ],
      totalUsdValue: WALLET_TOTAL_USD,
    };
  },
  loading(): UseWalletAssetsResult {
    return { ...baseWallet(), isLoading: true };
  },
  error(): UseWalletAssetsResult {
    return {
      ...baseWallet(),
      isError: true,
      error: new Error('wallet balances failed'),
    };
  },
  /** Some chains answered, at least one did not. */
  partial(): UseWalletAssetsResult {
    return {
      ...baseWallet(),
      assets: [walletAsset('USDC', 'USD Coin', 4_200.5, '4,200.50 USDC')],
      failedChains: ['eth'],
      totalUsdValue: 4_200.5,
    };
  },
};

/* -------------------------------------------------------------------------- */
/* Passive-income presets                                                     */
/* -------------------------------------------------------------------------- */

function incomeView(overrides: Partial<HomeIncomeView> = {}): HomeIncomeView {
  return {
    status: 'ready',
    passiveMonthlyUsd: 128.4,
    incomeMonthlyUsd: 128.4,
    costMonthlyUsd: 0,
    medianDailyUsd: 4.28,
    windowDays: 30,
    observedDays: 30,
    protocolRows: [],
    ...overrides,
  };
}

export const incomeFixtures = {
  ready(): IncomeFixture {
    return { income: incomeView(), isLoading: false, isError: false };
  },
  empty(): IncomeFixture {
    return {
      income: incomeView({
        status: 'empty',
        passiveMonthlyUsd: 0,
        incomeMonthlyUsd: 0,
        medianDailyUsd: 0,
        observedDays: 0,
      }),
      isLoading: false,
      isError: false,
    };
  },
  loading(): IncomeFixture {
    return { income: incomeView(), isLoading: true, isError: false };
  },
  failed(): IncomeFixture {
    return { income: incomeView(), isLoading: false, isError: true };
  },
};

/* -------------------------------------------------------------------------- */
/* Mutable state read by every mock                                           */
/* -------------------------------------------------------------------------- */

function defaultState(): HomeScreenState {
  return {
    account: accountFixtures.demo(),
    etl: etlFixtures.idle(),
    landing: landingFixtures.noHistory(),
    dashboard: dashboardFixtures.none(),
    suggestion: suggestionFixtures.none(),
    yieldReturns: yieldReturnsFixtures.none(),
    income: incomeFixtures.ready(),
    wallet: walletFixtures.loaded(),
  };
}

/** Mutated in place so mock factories can read it lazily. */
export const homeScreenState: HomeScreenState = defaultState();

/* -------------------------------------------------------------------------- */
/* Probes                                                                     */
/* -------------------------------------------------------------------------- */

export interface SparklineProbeProps {
  data: number[];
  height?: number;
  gradientId?: string;
}

export const sparklineProbe: {
  renderCount: number;
  lastProps: SparklineProbeProps | null;
} = { renderCount: 0, lastProps: null };

/** How many times each stubbed lucide glyph rendered in the current mount. */
export const iconRenderCounts: Record<string, number> = {};

export const routerProbe = {
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  navigate: vi.fn(),
  dismissAll: vi.fn(),
  setParams: vi.fn(),
};

/* -------------------------------------------------------------------------- */
/* Module stubs                                                               */
/* -------------------------------------------------------------------------- */

interface StubProps {
  accessibilityLabel?: string;
  accessibilityState?: { selected?: boolean; expanded?: boolean };
  children?: ReactNode;
  className?: string;
  testID?: string;
}

function ViewStub(props: StubProps) {
  return (
    <div
      aria-label={props.accessibilityLabel}
      className={props.className}
      data-testid={props.testID}
    >
      {props.children}
    </div>
  );
}

function TextStub(props: StubProps) {
  return <span className={props.className}>{props.children}</span>;
}

function ImageStub(props: { accessibilityLabel?: string }) {
  return <img alt={props.accessibilityLabel ?? ''} />;
}

/**
 * `Tap` hands `Pressable` a *function* style, which a naive spread would put
 * into a DOM `style` attribute, so the real component is replaced outright.
 */
function TapStub(props: StubProps & { onPress?: () => void }) {
  return (
    <button
      aria-label={props.accessibilityLabel}
      aria-selected={props.accessibilityState?.selected}
      aria-expanded={props.accessibilityState?.expanded}
      className={props.className}
      onClick={() => props.onPress?.()}
      type="button"
    >
      {props.children}
    </button>
  );
}

// Probes record from an effect rather than during render, so a stub never
// mutates module state mid-render. `act` flushes effects, so a counter is
// settled by the time the caller asserts on it.
function icon(name: string) {
  return function IconStub() {
    useEffect(() => {
      iconRenderCounts[name] = (iconRenderCounts[name] ?? 0) + 1;
    });
    return <span data-icon={name} />;
  };
}

const LUCIDE_ICON_NAMES = [
  'ArrowDown',
  'ArrowDownRight',
  'ArrowLeftRight',
  'ArrowRight',
  'ArrowUp',
  'ArrowUpRight',
  'Check',
  'ChevronDown',
  'ChevronRight',
  'Coins',
  'Layers',
  'RefreshCw',
  'Scale',
  'TrendingUp',
  'TriangleAlert',
  'Wallet',
  'Zap',
] as const;

function lucideStubs(): Record<string, () => ReactNode> {
  const stubs: Record<string, () => ReactNode> = {};
  for (const name of LUCIDE_ICON_NAMES) {
    stubs[name] = icon(name);
  }
  return stubs;
}

function SparklineStub(props: SparklineProbeProps) {
  useEffect(() => {
    sparklineProbe.renderCount += 1;
    sparklineProbe.lastProps = props;
  });
  return <div data-testid="sparkline" data-points={props.data.length} />;
}

/** Mirrors `moralisWallet.normalizeWalletAddressList` (trim + lower + dedupe). */
function normalizeWalletAddressList(input: unknown): string[] {
  const candidates = Array.isArray(input) ? input : [input];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const normalized = candidate.trim().toLowerCase();
    if (normalized) seen.add(normalized);
  }
  return [...seen];
}

/** Reshapes the landing fixture into what `usePortfolioDataProgressive` returns. */
function toProgressiveResult(landing: LandingFixture) {
  return {
    unifiedData: landing.data
      ? { lastUpdated: landing.data.lastUpdated }
      : null,
    sections: {
      balance: {
        data: landing.data ? { balance: landing.data.balance } : null,
        isLoading: landing.isLoading,
        error: landing.error,
      },
    },
  };
}

/**
 * Every module replacement the spec registers, keyed by the specifier it
 * replaces. `react-native` and `@zapengine/app-core/hooks/queries` are total
 * replacements: anything a transitively loaded module destructures has to be
 * present here.
 */
export const homeScreenMocks = {
  reactNative: { Image: ImageStub, Text: TextStub, View: ViewStub },
  lucide: lucideStubs(),
  designTokens: {
    tokens: {
      color: {
        accent: '#d4c5a3',
        error: '#ef7474',
        success: '#7fbf7f',
        'ink-dim': '#a6a6a6',
        'ink-faint': '#8a8a8a',
      },
    },
  },
  expoRouter: { useRouter: () => routerProbe },
  contentLanguage: {
    useContentLanguage: () => ({
      languageCode: 'en' as const,
      t: (key: keyof typeof en, params?: Record<string, string | number>) =>
        en[key].replace(/\{([^}]+)\}/g, (match, name: string) =>
          params?.[name] === undefined ? match : String(params[name]),
        ),
    }),
  },
  // Metro turns these `require`d PNGs into asset references; vitest cannot.
  assetIcons: {
    CHAIN_ICON_SRC: {
      ethereum: 'mark:chains/ethereum',
      base: 'mark:chains/base',
      arbitrum: 'mark:chains/arbitrum',
      hyperliquid: 'mark:chains/hyperliquid',
    },
    TOKEN_ICON_SRC: {
      USDC: 'mark:tokens/usdc',
      USDT: 'mark:tokens/usdt',
      ETH: 'mark:tokens/eth',
      WETH: 'mark:tokens/weth',
      WBTC: 'mark:tokens/wbtc',
      CBBTC: 'mark:tokens/cbbtc',
      BTC: 'mark:tokens/btc',
      SPY: 'mark:tokens/spy',
      ALT: 'mark:tokens/alt',
    },
    PROTOCOL_ICON_SRC: {
      morpho: 'mark:protocols/morpho',
      'gmx-v2': 'mark:protocols/gmx-v2',
      hyperliquid: 'mark:protocols/hyperliquid',
      ondo: 'mark:protocols/ondo',
      aave: 'mark:protocols/aave',
      lido: 'mark:protocols/lido',
      'eth-staking': 'mark:protocols/eth-staking',
    },
  },
  tap: { Tap: TapStub },
  // `cssInterop(Animated.View, …)` runs at module scope in the real file.
  skeleton: {
    SkeletonBlock: (props: StubProps) => (
      <span className={props.className} data-skeleton="true" />
    ),
  },
  screenScrollView: {
    ScreenScrollView: (props: StubProps) => (
      <div data-testid="screen-scroll">{props.children}</div>
    ),
  },
  appHeader: {
    AppHeader: (props: { action?: ReactNode }) => (
      <div data-testid="app-header">{props.action}</div>
    ),
  },
  // Calls useAccount()/useToast() before its early return, so it is replaced
  // even on the paths where the real component renders null.
  sharePortfolioButton: {
    SharePortfolioButton: () => (
      <button aria-label="Share portfolio" type="button" />
    ),
  },
  tokenIcon: {
    TokenIcon: (props: { symbol: string }) => (
      <span data-token-icon={props.symbol} />
    ),
  },
  chainIconStack: {
    ChainIconStack: (props: { chains: readonly string[] }) => (
      <span data-chain-icons={props.chains.join(',')} />
    ),
  },
  sparkline: { Sparkline: SparklineStub },
  demoConnectOverlay: {
    DemoConnectOverlay: (props: {
      onConnect: () => void;
      isConnecting?: boolean;
      error?: string | null;
    }) => (
      <div
        data-connecting={String(Boolean(props.isConnecting))}
        data-testid="demo-connect-overlay"
      >
        <button
          aria-label="Demo connect"
          onClick={() => props.onConnect()}
          type="button"
        />
        {props.error ? <span>{props.error}</span> : null}
      </div>
    ),
    DemoBlurCover: () => <div data-testid="demo-blur-cover" />,
    AccountUnavailableOverlay: (props: {
      onRetry: () => void;
      isRetrying?: boolean;
    }) => (
      <div
        data-retrying={String(Boolean(props.isRetrying))}
        data-testid="account-unavailable-overlay"
      >
        <button
          aria-label="Account unavailable retry"
          onClick={() => props.onRetry()}
          type="button"
        />
      </div>
    ),
  },
  useAccount: { useAccount: () => homeScreenState.account },
  etlJobPolling: { useEtlJobPolling: () => homeScreenState.etl },
  portfolioDashboard: {
    usePortfolioDashboard: () => homeScreenState.dashboard,
  },
  portfolioDataProgressive: {
    usePortfolioDataProgressive: () =>
      toProgressiveResult(homeScreenState.landing),
  },
  // Total replacement: this package's real entry pulls the whole query stack in.
  appCoreQueries: {
    useDailyYieldReturns: () => homeScreenState.yieldReturns,
  },
  strategySuggestion: {
    useStrategySuggestion: () => homeScreenState.suggestion,
  },
  homeIncome: { useHomeIncome: () => homeScreenState.income },
  walletTokens: {
    useWalletAssets: () => homeScreenState.wallet,
    normalizeWalletAddressList,
  },
};

/* -------------------------------------------------------------------------- */
/* Mounting                                                                   */
/* -------------------------------------------------------------------------- */

let container: HTMLDivElement | null = null;
let root: Root | null = null;

export interface RenderedHomeScreen {
  container: HTMLElement;
  rerender: () => Promise<void>;
  unmount: () => Promise<void>;
}

async function renderRoot(): Promise<void> {
  const { HomeScreen } = await import('@/screens/HomeScreen');
  const activeRoot = root;
  if (!activeRoot) throw new Error('HomeScreen root is not mounted');
  await act(async () => {
    activeRoot.render(<HomeScreen />);
  });
}

export async function renderHomeScreen(
  overrides: HomeScreenOverrides = {},
): Promise<RenderedHomeScreen> {
  Object.assign(homeScreenState, overrides);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await renderRoot();

  const mounted = container;
  return {
    container: mounted,
    rerender: renderRoot,
    unmount: cleanupHomeScreen,
  };
}

export async function cleanupHomeScreen(): Promise<void> {
  const activeRoot = root;
  const activeContainer = container;
  root = null;
  container = null;
  if (activeRoot) {
    await act(async () => {
      activeRoot.unmount();
    });
  }
  activeContainer?.remove();
}

export function resetHomeScreenMocks(): void {
  Object.assign(homeScreenState, defaultState());
  sparklineProbe.renderCount = 0;
  sparklineProbe.lastProps = null;
  for (const key of Object.keys(iconRenderCounts)) {
    delete iconRenderCounts[key];
  }
  routerProbe.push.mockClear();
  routerProbe.replace.mockClear();
  routerProbe.back.mockClear();
  routerProbe.navigate.mockClear();
  routerProbe.dismissAll.mockClear();
  routerProbe.setParams.mockClear();
}

/* -------------------------------------------------------------------------- */
/* Probes that re-render with an equal-but-new object                          */
/* -------------------------------------------------------------------------- */

/**
 * Hand the screen a fresh ETL state object with identical values, keeping the
 * same `startPolling` identity — the way a poll tick actually arrives.
 */
export async function tickEtl(): Promise<void> {
  homeScreenState.etl = {
    ...homeScreenState.etl,
    state: { ...homeScreenState.etl.state },
  };
  await renderRoot();
}

/** Same idea for the account object, which `useAccount` rebuilds every render. */
export async function forceAccountRerender(): Promise<void> {
  homeScreenState.account = { ...homeScreenState.account };
  await renderRoot();
}

/* -------------------------------------------------------------------------- */
/* Query helpers                                                              */
/* -------------------------------------------------------------------------- */

export function buttons(scope: HTMLElement): HTMLButtonElement[] {
  return [...scope.querySelectorAll('button')];
}

export function buttonByLabel(
  scope: HTMLElement,
  label: string,
): HTMLButtonElement {
  const match = buttons(scope).find(
    (node) => node.getAttribute('aria-label') === label,
  );
  if (!match) throw new Error(`No button labelled "${label}"`);
  return match;
}

export function buttonByText(
  scope: HTMLElement,
  text: string,
): HTMLButtonElement {
  const match = buttons(scope).find((node) => node.textContent === text);
  if (!match) throw new Error(`No button whose text is "${text}"`);
  return match;
}

export function buttonStartingWith(
  scope: HTMLElement,
  text: string,
): HTMLButtonElement {
  const match = buttons(scope).find((node) =>
    (node.textContent ?? '').startsWith(text),
  );
  if (!match) throw new Error(`No button whose text starts with "${text}"`);
  return match;
}

export function ariaLabels(scope: HTMLElement): string[] {
  return [...scope.querySelectorAll('[aria-label]')].map(
    (node) => node.getAttribute('aria-label') ?? '',
  );
}

export function selectedRangeLabels(scope: HTMLElement): string[] {
  return [...scope.querySelectorAll('[aria-selected="true"]')].map(
    (node) => node.getAttribute('aria-label') ?? '',
  );
}

export function skeletonCount(scope: HTMLElement): number {
  return scope.querySelectorAll('[data-skeleton]').length;
}

export async function press(node: HTMLElement): Promise<void> {
  await act(async () => {
    node.click();
  });
}
