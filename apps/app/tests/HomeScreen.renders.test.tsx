// @vitest-environment jsdom

/**
 * Render-churn measurement for `HomeScreen`.
 *
 * `tests/HomeScreen.test.tsx` pins *what* the screen renders; this file pins
 * *how often*. Both counters are effect-driven, so a memo that stops working
 * shows up here as a number that moved rather than as a visual regression
 * nobody notices.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  accountFixtures,
  buttonByLabel,
  cleanupHomeScreen,
  dashboardFixtures,
  etlFixtures,
  forceAccountRerender,
  homeScreenState,
  iconRenderCounts,
  incomeFixtures,
  landingFixtures,
  press,
  renderHomeScreen,
  resetHomeScreenMocks,
  sparklineProbe,
  suggestionFixtures,
  tickEtl,
  tokenIconRenderCounts,
  walletFixtures,
  yieldReturnsFixtures,
} from './support/homeScreenHarness';

// Every factory reaches the harness through a deferred import: vi.mock is
// hoisted above this file's own imports, so it cannot close over the binding
// above. See the harness header for why nothing there imports HomeScreen.
const harness = () => import('./support/homeScreenHarness');

vi.mock(
  'react-native',
  async () => (await harness()).homeScreenMocks.reactNative,
);
vi.mock(
  'lucide-react-native',
  async () => (await harness()).homeScreenMocks.lucide,
);
vi.mock(
  '@zapengine/design-tokens/tokens',
  async () => (await harness()).homeScreenMocks.designTokens,
);
vi.mock(
  'expo-router',
  async () => (await harness()).homeScreenMocks.expoRouter,
);
vi.mock(
  '@/providers/ContentLanguageProvider',
  async () => (await harness()).homeScreenMocks.contentLanguage,
);
vi.mock(
  '@/data/assetIcons',
  async () => (await harness()).homeScreenMocks.assetIcons,
);
vi.mock(
  '@/components/ui/Tap',
  async () => (await harness()).homeScreenMocks.tap,
);
vi.mock(
  '@/components/ui/Skeleton',
  async () => (await harness()).homeScreenMocks.skeleton,
);
vi.mock(
  '@/components/ui/ScreenScrollView',
  async () => (await harness()).homeScreenMocks.screenScrollView,
);
vi.mock(
  '@/components/ui/AppHeader',
  async () => (await harness()).homeScreenMocks.appHeader,
);
vi.mock(
  '@/components/share/SharePortfolioButton',
  async () => (await harness()).homeScreenMocks.sharePortfolioButton,
);
vi.mock(
  '@/components/token/TokenIcon',
  async () => (await harness()).homeScreenMocks.tokenIcon,
);
vi.mock(
  '@/components/token/ChainIconStack',
  async () => (await harness()).homeScreenMocks.chainIconStack,
);
vi.mock(
  '@/components/charts/Sparkline',
  async () => (await harness()).homeScreenMocks.sparkline,
);
vi.mock(
  '@/components/home/DemoConnectOverlay',
  async () => (await harness()).homeScreenMocks.demoConnectOverlay,
);
vi.mock(
  '@/integration/useAccount',
  async () => (await harness()).homeScreenMocks.useAccount,
);
vi.mock(
  '@zapengine/app-core/hooks/wallet',
  async () => (await harness()).homeScreenMocks.etlJobPolling,
);
vi.mock(
  '@zapengine/app-core/hooks/analytics/usePortfolioDashboard',
  async () => (await harness()).homeScreenMocks.portfolioDashboard,
);
vi.mock(
  '@zapengine/app-core/hooks/queries',
  async () => (await harness()).homeScreenMocks.appCoreQueries,
);
vi.mock(
  '@/integration/useStrategySuggestion',
  async () => (await harness()).homeScreenMocks.strategySuggestion,
);
vi.mock(
  '@/integration/useHomeIncome',
  async () => (await harness()).homeScreenMocks.homeIncome,
);
vi.mock(
  '@/integration/walletTokens',
  async () => (await harness()).homeScreenMocks.walletTokens,
);

// Same heavy harness as HomeScreen.test.tsx — keep the timeout in sync so a
// slow parallel CI worker cannot time out a mount mid-act.
vi.setConfig({ testTimeout: 30_000 });

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  resetHomeScreenMocks();
});

afterEach(async () => {
  await cleanupHomeScreen();
});

/** The live presets every connected-subject case starts from. */
function liveOverrides() {
  return {
    account: accountFixtures.ownBundle(),
    landing: landingFixtures.loaded(),
    dashboard: dashboardFixtures.loaded(),
    yieldReturns: yieldReturnsFixtures.loaded(),
    suggestion: suggestionFixtures.actionRequired(),
    wallet: walletFixtures.loaded(),
    income: incomeFixtures.ready(),
    etl: etlFixtures.idle(),
  };
}

/**
 * Only `HomeAttributionBreakdown` renders these three glyphs, so they count
 * that component's renders and nothing else on the screen.
 */
function attributionIconRenders(): number[] {
  return [
    iconRenderCounts.TrendingUp ?? 0,
    iconRenderCounts.Coins ?? 0,
    iconRenderCounts.ArrowLeftRight ?? 0,
  ];
}

/**
 * `Zap` belongs to the strategy card, which is deliberately not memoized: it
 * witnesses that the churn re-rendered the screen at all, so a "counter did
 * not move" assertion can never pass because nothing happened.
 */
function screenRenders(): number {
  return iconRenderCounts.Zap ?? 0;
}

/**
 * Two re-renders, each handing the screen a new-but-equal state object — the
 * identity churn `useEtlJobPolling` and `useAccount` really produce on a poll
 * tick and a provider update, and exactly what a memo is meant to absorb.
 */
async function churn(): Promise<void> {
  await tickEtl();
  await forceAccountRerender();
}

describe('HomeScreen — trend chart and attribution render churn', () => {
  it('re-renders neither on equal-but-new state, and both on a range change', async () => {
    const { container } = await renderHomeScreen(liveOverrides());

    const sparklineBefore = sparklineProbe.renderCount;
    const attributionBefore = attributionIconRenders();
    const screenBefore = screenRenders();
    expect(sparklineBefore).toBeGreaterThan(0);
    expect(attributionBefore.every((count) => count > 0)).toBe(true);
    expect(sparklineProbe.lastProps?.data).toHaveLength(3);

    await churn();

    expect(screenRenders()).toBe(screenBefore + 2);
    expect(sparklineProbe.renderCount).toBe(sparklineBefore);
    expect(attributionIconRenders()).toEqual(attributionBefore);

    // Control group: a real input change has to move both counters. Without
    // it, a probe that quietly stopped recording would make the assertions
    // above pass while proving nothing.
    await press(buttonByLabel(container, '1Y'));

    expect(sparklineProbe.lastProps?.data).toHaveLength(4);
    expect(sparklineProbe.renderCount).toBeGreaterThan(sparklineBefore);
    expect(
      attributionIconRenders().every(
        (count, index) => count > (attributionBefore[index] ?? 0),
      ),
    ).toBe(true);
  });
});

describe('HomeScreen — asset row render churn', () => {
  it('re-renders no row on equal-but-new state, and does on a wallet change', async () => {
    const { container } = await renderHomeScreen(liveOverrides());

    const usdcBefore = tokenIconRenderCounts.USDC ?? 0;
    const ethBefore = tokenIconRenderCounts.ETH ?? 0;
    const screenBefore = screenRenders();
    expect(usdcBefore).toBeGreaterThan(0);
    expect(ethBefore).toBeGreaterThan(0);
    expect(container.querySelectorAll('[data-token-icon]')).toHaveLength(2);

    await churn();

    expect(screenRenders()).toBe(screenBefore + 2);
    expect(tokenIconRenderCounts.USDC).toBe(usdcBefore);
    expect(tokenIconRenderCounts.ETH).toBe(ethBefore);

    // Control group: the surviving row must re-render once the wallet query
    // actually returns different assets.
    homeScreenState.wallet = walletFixtures.partial();
    await forceAccountRerender();

    expect(container.querySelectorAll('[data-token-icon]')).toHaveLength(1);
    expect(tokenIconRenderCounts.USDC ?? 0).toBeGreaterThan(usdcBefore);
  });
});
