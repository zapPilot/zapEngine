// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEMO } from '@/data/demo';
import {
  accountFixtures,
  ariaLabels,
  buttonByLabel,
  buttonByText,
  buttonStartingWith,
  buttons,
  cleanupHomeScreen,
  dashboardFixtures,
  ETL_JOB_ID,
  etlFixtures,
  forceAccountRerender,
  homeScreenState,
  iconRenderCounts,
  incomeFixtures,
  landingFixtures,
  OWN_ADDRESS,
  OWN_USER_ID,
  press,
  renderHomeScreen,
  resetHomeScreenMocks,
  routerProbe,
  selectedRangeLabels,
  skeletonCount,
  sparklineProbe,
  suggestionFixtures,
  tickEtl,
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

describe('HomeScreen — demo visitor', () => {
  it('previews DEMO numbers behind the connect gate', async () => {
    const { container } = await renderHomeScreen({
      account: accountFixtures.demo(),
    });

    // 24_815.6 renders as $24,815.60, split across two nested Text nodes.
    expect(container.textContent).toContain('$24,815.60');
    const fraction = [...container.querySelectorAll('span')].find(
      (node) => node.textContent === '.60',
    );
    expect(fraction).toBeDefined();
    expect(container.textContent).toContain('+12.3%');
    expect(container.textContent).toContain('+$2,715.60 · 1Y');

    expect(
      container.querySelector('[data-testid="demo-connect-overlay"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="demo-blur-cover"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="account-unavailable-overlay"]'),
    ).toBeNull();
  });

  it('keeps all three actions, the demo badge and the demo strategy card', async () => {
    const { container } = await renderHomeScreen({
      account: accountFixtures.demo(),
    });

    expect(buttonByText(container, 'Invest')).toBeDefined();
    expect(buttonByText(container, 'Rebalance')).toBeDefined();
    expect(buttonByText(container, 'Send')).toBeDefined();

    expect(container.textContent).toContain('Wallet assets');
    expect(container.textContent).toContain('Demo');
    expect(container.textContent).not.toContain('Live');
    // Three DEMO assets, each announced as one row.
    expect(ariaLabels(container)).toContain(
      'USDC, USD Coin, 12,480.50, $12,480.50',
    );
    expect(container.textContent).toContain('Idle across 0 wallet(s)');

    expect(container.textContent).toContain('Portfolio on target');
    expect(container.textContent).toContain(DEMO.strategy.quote);
    expect(container.textContent).toContain('cautious');
    expect(container.textContent).toContain('FGI 34');
    expect(container.textContent).toContain('View strategy');
    expect(iconRenderCounts.Check).toBe(1);

    // The income card is owner-only and never shown to a demo visitor.
    expect(container.textContent).not.toContain('Protocol income');
  });

  it('feeds the sparkline all fifteen demo trend points', async () => {
    await renderHomeScreen({ account: accountFixtures.demo() });

    expect(DEMO.home.trendPoints).toHaveLength(15);
    expect(sparklineProbe.lastProps?.data).toHaveLength(15);
  });

  it('routes the overlay CTA to the account connect flow', async () => {
    const account = accountFixtures.demo();
    const { container } = await renderHomeScreen({ account });

    await press(buttonByLabel(container, 'Demo connect'));

    expect(account.connect).toHaveBeenCalledTimes(1);
  });
});

describe('HomeScreen — live loaded', () => {
  it('renders the live headline, chart, attribution and badges', async () => {
    const { container } = await renderHomeScreen(liveOverrides());

    expect(container.textContent).toContain('$12,345.67');
    expect(container.textContent).toContain('+30.0%');
    expect(container.textContent).toContain('+$30.00 · 1Y');
    expect(
      container.querySelector('[data-testid="portfolio-trend-chart"]'),
    ).not.toBeNull();
    expect(sparklineProbe.lastProps?.data).toEqual([100, 120, 118, 130]);

    expect(ariaLabels(container)).toEqual(
      expect.arrayContaining([
        '+$27 gains',
        '−$4 losses',
        'Price impact, +$16',
        'Protocol returns, +$7',
        'Flows & other, +$7',
      ]),
    );

    expect(container.textContent).toContain('Live');
    expect(container.textContent).toContain('Idle across 2 wallet(s)');
    expect(container.textContent).toContain('$6,000.75');
    expect(container.textContent).toContain('Protocol income');
    expect(
      container.querySelector('[data-testid="demo-connect-overlay"]'),
    ).toBeNull();
  });

  it('surfaces the action-required strategy card and its rebalance label', async () => {
    const { container } = await renderHomeScreen(liveOverrides());

    expect(container.textContent).toContain('Strategy');
    expect(container.textContent).toContain('Rebalance recommended');
    expect(container.textContent).toContain('risk on');
    expect(container.textContent).toContain('FGI 62');
    expect(container.textContent).toContain('STABLE -> ETH');
    expect(container.textContent).toContain('$1,000.00');
    expect(container.textContent).toContain('View recommendation');
    expect(iconRenderCounts.Zap).toBe(1);

    expect(
      buttonByLabel(container, 'Rebalance — action required'),
    ).toBeDefined();
  });
});

describe('HomeScreen — per-section loading', () => {
  it('shows the balance as soon as landing lands, chart and strategy still pending', async () => {
    const { container } = await renderHomeScreen({
      ...liveOverrides(),
      dashboard: dashboardFixtures.loading(),
      suggestion: suggestionFixtures.loading(),
    });

    // The slowest of the three no longer holds the headline in a skeleton.
    expect(container.textContent).toContain('$12,345.67');
    expect(
      container.querySelector('[data-testid="portfolio-trend-chart"]'),
    ).toBeNull();
    expect(container.textContent).toContain('Strategy');
    expect(container.textContent).not.toContain('Rebalance recommended');
    expect(skeletonCount(container)).toBeGreaterThan(0);
  });

  it('keeps the balance and the strategy card when only the dashboard fails', async () => {
    const { container } = await renderHomeScreen({
      ...liveOverrides(),
      dashboard: dashboardFixtures.failed(),
    });

    expect(container.textContent).toContain('$12,345.67');
    expect(container.textContent).toContain('Rebalance recommended');
    // Nothing to plot and nothing left to wait for: the chart area is empty.
    expect(
      container.querySelector('[data-testid="portfolio-trend-chart"]'),
    ).toBeNull();
    expect(skeletonCount(container)).toBe(0);
  });

  it('drops only the strategy section when the suggestion fails', async () => {
    const { container } = await renderHomeScreen({
      ...liveOverrides(),
      suggestion: suggestionFixtures.failed(),
    });

    expect(container.textContent).toContain('$12,345.67');
    expect(
      container.querySelector('[data-testid="portfolio-trend-chart"]'),
    ).not.toBeNull();
    expect(container.textContent).not.toContain('Strategy');
  });
});

describe('HomeScreen — wallet assets', () => {
  it('flags a partial load and retries from the warning', async () => {
    const wallet = walletFixtures.partial();
    const { container } = await renderHomeScreen({
      ...liveOverrides(),
      wallet,
    });

    expect(container.textContent).toContain('Partial');
    expect(container.textContent).not.toContain('Live');
    expect(container.textContent).toContain(
      'Some network balances could not be loaded. The assets below are partial.',
    );

    await press(buttonByLabel(container, 'Retry unavailable network balances'));

    expect(wallet.refetch).toHaveBeenCalledTimes(1);
  });

  it('shows the balance-unavailable empty state and retries from it', async () => {
    const wallet = walletFixtures.error();
    const { container } = await renderHomeScreen({
      ...liveOverrides(),
      wallet,
    });

    expect(container.textContent).toContain('Wallet balance unavailable');
    expect(container.textContent).toContain(
      'We could not load live balances for your wallets.',
    );
    expect(container.textContent).not.toContain(
      'Some network balances could not be loaded',
    );

    await press(buttonByLabel(container, 'Retry unavailable network balances'));

    expect(wallet.refetch).toHaveBeenCalledTimes(1);
  });

  it('renders exactly twelve skeleton blocks while balances load', async () => {
    const { container } = await renderHomeScreen({
      ...liveOverrides(),
      wallet: walletFixtures.loading(),
    });

    // Three placeholder rows of four blocks each (avatar, two text lines, a
    // value), and nothing else on the screen is in a loading state.
    expect(skeletonCount(container)).toBe(12);
  });
});

describe('HomeScreen — portfolio import', () => {
  it('starts ETL polling once and shows the preparing copy', async () => {
    const etl = etlFixtures.pending();
    const { container } = await renderHomeScreen({
      account: accountFixtures.ownBundle(),
      landing: landingFixtures.noHistory(),
      dashboard: dashboardFixtures.loaded(),
      etl,
    });

    expect(etl.startPolling).toHaveBeenCalledTimes(1);
    expect(etl.startPolling).toHaveBeenCalledWith(ETL_JOB_ID, OWN_USER_ID);

    await tickEtl();
    await forceAccountRerender();

    expect(etl.startPolling).toHaveBeenCalledTimes(1);

    expect(container.textContent).toContain('Preparing your portfolio');
    expect(container.textContent).toContain(
      'We’re importing this wallet’s activity. This usually takes a few minutes and updates automatically.',
    );
    // The import state replaces both the balance and the chart.
    expect(
      container.querySelector('[data-testid="portfolio-trend-chart"]'),
    ).toBeNull();
  });

  it('offers a retry on a failed import', async () => {
    const account = accountFixtures.ownBundle();
    const etl = etlFixtures.failed();
    const { container } = await renderHomeScreen({
      account,
      landing: landingFixtures.noHistory(),
      dashboard: dashboardFixtures.loaded(),
      etl,
    });

    expect(etl.startPolling).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Portfolio import failed');
    expect(container.textContent).toContain(
      'We couldn’t import this wallet’s activity. Try starting the import again.',
    );

    await press(buttonByLabel(container, 'Retry'));

    expect(etl.triggerEtl).toHaveBeenCalledWith(OWN_USER_ID, OWN_ADDRESS);
  });

  it('replaces the failure copy when ownership was never verified', async () => {
    const etl = etlFixtures.failed(
      'Wallet ownership has not been verified for this user',
    );
    const { container } = await renderHomeScreen({
      account: accountFixtures.ownBundle(),
      landing: landingFixtures.noHistory(),
      dashboard: dashboardFixtures.loaded(),
      etl,
    });

    expect(container.textContent).toContain('Verify this wallet first');
    expect(container.textContent).toContain(
      'Go to Wallets, switch to this wallet, and verify ownership before importing its portfolio.',
    );
    expect(container.textContent).not.toContain('Portfolio import failed');
    expect(
      buttons(container).some(
        (node) => node.getAttribute('aria-label') === 'Retry',
      ),
    ).toBe(false);
  });

  it('explains a completed import that produced no history', async () => {
    const { container } = await renderHomeScreen({
      account: accountFixtures.ownBundle(),
      landing: landingFixtures.noHistory(),
      dashboard: dashboardFixtures.loaded(),
      etl: etlFixtures.completed(),
    });

    expect(container.textContent).toContain('No portfolio history found');
    expect(container.textContent).toContain(
      'The import finished, but no portfolio history was available for this wallet.',
    );
    expect(
      buttons(container).some(
        (node) => node.getAttribute('aria-label') === 'Retry',
      ),
    ).toBe(false);
  });

  it('shows only skeletons — never import copy — while the landing query loads', async () => {
    const { container } = await renderHomeScreen({
      account: accountFixtures.ownBundle(),
      landing: landingFixtures.loading(),
      dashboard: dashboardFixtures.loading(),
      suggestion: suggestionFixtures.none(),
      wallet: walletFixtures.loaded(),
    });

    expect(skeletonCount(container)).toBeGreaterThan(0);
    expect(container.textContent).not.toContain('Preparing your portfolio');
    expect(container.textContent).not.toContain('Portfolio import failed');
    expect(container.textContent).not.toContain('No portfolio history found');
    expect(container.textContent).not.toContain('Verify this wallet first');
    expect(
      container.querySelector('[data-testid="portfolio-trend-chart"]'),
    ).toBeNull();
  });

  it('never explains an upstream failure in its own words', async () => {
    const { container } = await renderHomeScreen({
      account: accountFixtures.ownBundle({ etlJobId: null }),
      landing: landingFixtures.failed(),
      dashboard: dashboardFixtures.failed(),
      suggestion: suggestionFixtures.none(),
      etl: etlFixtures.completed(),
      income: incomeFixtures.failed(),
    });

    expect(container.textContent).not.toContain('balance failed');
    // A failed income query hides the card outright rather than explaining.
    expect(container.textContent).not.toContain('Protocol income');
  });

  it('reads a failed landing query as an unknown balance, not a missing portfolio', async () => {
    const etl = etlFixtures.idle();
    const { container } = await renderHomeScreen({
      account: accountFixtures.ownBundle(),
      landing: landingFixtures.failed(),
      dashboard: dashboardFixtures.loaded(),
      suggestion: suggestionFixtures.none(),
      etl,
    });

    expect(container.textContent).not.toContain('Preparing your portfolio');
    expect(container.textContent).not.toContain('No portfolio history found');
    // The headline falls back to a dash, and the chart keeps rendering the
    // trend the dashboard did return.
    expect(ariaLabels(container)).toContain('Net worth, -, View portfolio');
    expect(
      container.querySelector('[data-testid="portfolio-trend-chart"]'),
    ).not.toBeNull();
    // A network failure is not evidence that the portfolio needs importing.
    expect(etl.startPolling).not.toHaveBeenCalled();
  });

  it('still treats an unknown analytics subject as a portfolio to import', async () => {
    const etl = etlFixtures.idle();
    const { container } = await renderHomeScreen({
      account: accountFixtures.ownBundle(),
      landing: landingFixtures.notFound(),
      dashboard: dashboardFixtures.loaded(),
      suggestion: suggestionFixtures.none(),
      etl,
    });

    expect(container.textContent).toContain('Preparing your portfolio');
    expect(etl.startPolling).toHaveBeenCalledWith(ETL_JOB_ID, OWN_USER_ID);
  });
});

describe('HomeScreen — account resolution', () => {
  it('holds the live skeleton while the subject is still resolving', async () => {
    const { container } = await renderHomeScreen({
      account: accountFixtures.resolving(),
      landing: landingFixtures.noHistory(),
    });

    expect(skeletonCount(container)).toBeGreaterThan(0);
    // Neither gate applies: the wallet is connected, the record is not yet lost.
    expect(
      container.querySelector('[data-testid="demo-connect-overlay"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="account-unavailable-overlay"]'),
    ).toBeNull();
    // Demo numbers must never flash while the real subject resolves.
    expect(container.textContent).not.toContain('$24,815.60');
    expect(container.textContent).not.toContain('Preparing your portfolio');
  });
});

describe('HomeScreen — account resolution failure', () => {
  it('covers the screen with the account-unavailable overlay', async () => {
    const account = accountFixtures.resolutionFailed();
    const { container } = await renderHomeScreen({
      account,
      landing: landingFixtures.noHistory(),
    });

    const overlay = container.querySelector(
      '[data-testid="account-unavailable-overlay"]',
    );
    expect(overlay).not.toBeNull();
    expect(overlay?.getAttribute('data-retrying')).toBe('false');
    expect(
      container.querySelector('[data-testid="demo-connect-overlay"]'),
    ).toBeNull();

    await press(buttonByLabel(container, 'Account unavailable retry'));

    expect(account.retryUserResolution).toHaveBeenCalledTimes(1);
  });
});

describe('HomeScreen — range tabs', () => {
  it('re-slices the series and moves the selected tab', async () => {
    const { container } = await renderHomeScreen(liveOverrides());

    expect(selectedRangeLabels(container)).toEqual(['1Y']);
    expect(sparklineProbe.lastProps?.data).toHaveLength(4);
    const rendersBefore = sparklineProbe.renderCount;

    await press(buttonByLabel(container, '1W'));

    expect(selectedRangeLabels(container)).toEqual(['1W']);
    expect(sparklineProbe.lastProps?.data).toEqual([120, 118, 130]);
    expect(sparklineProbe.renderCount).toBeGreaterThan(rendersBefore);
    expect(container.textContent).toContain('+8.3%');
    expect(container.textContent).toContain('+$10.00 · 1W');

    await press(buttonByLabel(container, '1Y'));

    expect(selectedRangeLabels(container)).toEqual(['1Y']);
    expect(sparklineProbe.lastProps?.data).toHaveLength(4);
  });
});

describe('HomeScreen — read-only bundle view', () => {
  it('hides every owner-only affordance', async () => {
    const { container } = await renderHomeScreen({
      ...liveOverrides(),
      account: accountFixtures.bundleView(),
    });

    const labels = buttons(container).map((node) => node.textContent);
    expect(labels).not.toContain('Invest');
    expect(labels).not.toContain('Rebalance');
    expect(labels).not.toContain('Send');
    expect(container.textContent).not.toContain('Wallet assets');
    expect(container.textContent).not.toContain('Idle across');

    // The read-only surfaces stay.
    expect(container.textContent).toContain('Rebalance recommended');
    expect(
      container.querySelector('[data-testid="portfolio-trend-chart"]'),
    ).not.toBeNull();
  });
});

describe('HomeScreen — navigation', () => {
  it('sends the net-worth block and the header link to /portfolio', async () => {
    const { container } = await renderHomeScreen(liveOverrides());

    await press(
      buttonByLabel(container, 'Net worth, $12,345.67, View portfolio'),
    );
    expect(routerProbe.push).toHaveBeenLastCalledWith('/portfolio');

    await press(buttonByText(container, 'View portfolio'));
    expect(routerProbe.push).toHaveBeenLastCalledWith('/portfolio');
    expect(routerProbe.push).toHaveBeenCalledTimes(2);
  });

  it('sends the strategy card and the rebalance action to the decision focus', async () => {
    const { container } = await renderHomeScreen(liveOverrides());

    await press(buttonStartingWith(container, 'Rebalance recommended'));
    expect(routerProbe.push).toHaveBeenLastCalledWith(
      '/strategy?focus=decision',
    );

    await press(buttonByLabel(container, 'Rebalance — action required'));
    expect(routerProbe.push).toHaveBeenLastCalledWith(
      '/strategy?focus=decision',
    );

    await press(buttonByText(container, 'Invest'));
    expect(routerProbe.push).toHaveBeenLastCalledWith('/invest/amount');

    await press(buttonByText(container, 'Send'));
    expect(routerProbe.push).toHaveBeenLastCalledWith('/send');
  });
});

describe('HomeScreen — strategy section', () => {
  it('reads an aligned portfolio back from the suggestion transformers', async () => {
    const { container } = await renderHomeScreen({
      ...liveOverrides(),
      suggestion: suggestionFixtures.noAction(),
    });

    expect(container.textContent).toContain('Portfolio on target');
    expect(container.textContent).toContain('cautious');
    expect(container.textContent).toContain('FGI 34');
    expect(container.textContent).toContain(
      'Portfolio is already aligned with the current target.',
    );
    expect(container.textContent).toContain('View strategy');
    expect(iconRenderCounts.Check).toBe(1);
    expect(iconRenderCounts.Zap).toBeUndefined();

    // Without an action there is no urgency label on the rebalance button.
    expect(
      buttonByText(container, 'Rebalance').getAttribute('aria-label'),
    ).toBeNull();
  });

  it('drops the whole section when no suggestion resolved', async () => {
    const { container } = await renderHomeScreen({
      ...liveOverrides(),
      suggestion: suggestionFixtures.none(),
    });

    expect(container.textContent).not.toContain('Strategy');
    expect(container.textContent).not.toContain('Rebalance recommended');
    expect(container.textContent).not.toContain('Portfolio on target');
    // The action row is unaffected — it does not depend on the suggestion.
    expect(buttonByText(container, 'Rebalance')).toBeDefined();
    expect(homeScreenState.suggestion.data).toBeNull();
  });
});
