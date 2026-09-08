import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * `/home?userId=<uuid>` is the only Home path that needs no wallet and no
 * login (`src/integration/bundleViewParam.web.ts`), which makes it the only
 * place a browser can prove how Home's sections load. Everything else on Home
 * is gated behind a Privy connection the e2e build deliberately cannot make.
 */
const BUNDLE_USER_ID = '4f8a1c62-7b3d-4e59-9a20-1d6c8e35f7ab';
const BUNDLE_VIEW_PATH = `/home?userId=${BUNDLE_USER_ID}`;

/** Exactly the a11y label `HomeScreen` builds once the landing query lands. */
const NET_WORTH_LABEL = 'Net worth, $128,450.75, View portfolio';
const APP_BOOT_TIMEOUT = 45_000;
const SLOW_DASHBOARD_DELAY = 6_000;
/** Comfortably shorter than SLOW_DASHBOARD_DELAY — see the second test. */
const SECTION_INDEPENDENCE_BUDGET = 3_000;

/** Copy from `CrashFallbackScreen`; every boundary in the app renders it. */
const CRASH_FALLBACK_COPY = 'Something went wrong';

/** Affordances `HomeScreen` renders only when `account.isOwnBundle`. */
const OWNER_ONLY_BUTTONS = ['Invest', 'Rebalance', 'Send'] as const;

function allocationSlice(totalValue: number, percentage: number) {
  return {
    total_value: totalValue,
    percentage_of_portfolio: percentage,
    wallet_tokens_value: 0,
    other_sources_value: totalValue,
  };
}

const LANDING_FIXTURE = {
  total_assets_usd: 128_450.75,
  total_debt_usd: 0,
  total_net_usd: 128_450.75,
  net_portfolio_value: 128_450.75,
  positions: 4,
  protocols: 2,
  chains: 2,
  wallet_count: 1,
  // Without `last_updated` the screen treats the account as having no
  // portfolio yet and blanks the headline instead of showing the balance.
  last_updated: '2026-09-06T00:00:00.000Z',
  portfolio_allocation: {
    btc: allocationSlice(64_225.38, 50),
    eth: allocationSlice(32_112.69, 25),
    stablecoins: allocationSlice(25_690.15, 20),
    others: allocationSlice(6_422.53, 5),
  },
};

// Home asks the dashboard for `trends` only, so the fixture carries only that.
const DASHBOARD_FIXTURE = {
  user_id: BUNDLE_USER_ID,
  trends: {
    daily_values: [
      { date: '2026-09-01', total_value_usd: 121_004.11 },
      { date: '2026-09-02', total_value_usd: 122_860.04 },
      { date: '2026-09-03', total_value_usd: 119_733.9 },
      { date: '2026-09-04', total_value_usd: 125_118.62 },
      { date: '2026-09-05', total_value_usd: 126_940.27 },
      { date: '2026-09-06', total_value_usd: 128_450.75 },
    ],
  },
};

const DAILY_YIELD_FIXTURE = {
  user_id: BUNDLE_USER_ID,
  period: { start_date: '2026-08-08', end_date: '2026-09-06', days: 30 },
  daily_returns: [],
  wallet_returns: [],
};

const YIELD_SUMMARY_FIXTURE = {
  user_id: BUNDLE_USER_ID,
  windows: {},
  recommended_period: '30d',
};

const DAILY_SUGGESTION_FIXTURE = {
  as_of: '2026-09-06',
  config_id: 'e2e_default',
  config_display_name: 'E2E default',
  strategy_id: 'dma_fgi',
  action: {
    status: 'no_action',
    required: false,
    kind: null,
    reason_code: 'already_aligned',
    transfers: [],
  },
  context: {
    market: {
      date: '2026-09-06',
      token_price: { BTC: 64_000 },
      sentiment: 55,
      sentiment_label: 'neutral',
    },
    signal: { id: 'dma_fgi', regime: 'neutral_hold', confidence: 0.6 },
    portfolio: {
      spot_usd: 90_000,
      stable_usd: 38_450.75,
      total_value: 128_450.75,
      allocation: { spot: 0.7, stable: 0.3 },
      asset_allocation: { btc: 0.5, eth: 0.2, spy: 0, stable: 0.3, alt: 0 },
    },
    target: {
      allocation: { btc: 0.5, eth: 0.2, spy: 0, stable: 0.3, alt: 0 },
    },
    strategy: {
      stance: 'hold',
      reason_code: 'already_aligned',
      rule_group: 'dma_fgi',
    },
  },
};

function jsonRoute(payload: unknown, delayMs = 0) {
  return async (route: Route): Promise<void> => {
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(payload),
    });
  };
}

/**
 * Registered before the real stubs so Playwright's last-registered-wins
 * ordering leaves this as the fallback. `scripts/serve-web.mjs` answers any
 * unmatched path with `index.html`, so an endpoint this spec forgot would be
 * parsed as JSON, fail, retry, and leave a section in a skeleton until the
 * test times out. Answering with JSON and naming the path turns that into an
 * immediate, readable failure. The patterns are `api/v2`/`api/v3` rather than
 * a blanket `api` because Privy's SDK talks to its own `/api/v1/` endpoints.
 */
async function trapUnstubbedAnalyticsCalls(
  page: Page,
  seen: Set<string>,
): Promise<void> {
  for (const pattern of ['**/api/v2/**', '**/api/v3/**']) {
    await page.route(pattern, async (route) => {
      seen.add(new URL(route.request().url()).pathname);
      await route.fulfill({
        status: 501,
        contentType: 'application/json',
        body: '{}',
      });
    });
  }
}

/**
 * The five requests Home issues for a bundle subject, enumerated from
 * `useHomeData` (landing, dashboard, daily yield, daily suggestion) and
 * `useHomeIncome` (yield summary) down to their `analyticsService` /
 * `strategyService` endpoints.
 *
 * Every pattern is anchored with a leading `**` so it matches whether the
 * client emits a baseURL-relative path (no `ANALYTICS_ENGINE_URL` in the env)
 * or an absolute URL against a real analytics host (`app.config.ts` projects a
 * repo-root `.env` into `process.env` before Metro transforms the bundle).
 */
async function routeHomeBundleApi(
  page: Page,
  options: { dashboardDelayMs?: number } = {},
): Promise<void> {
  await page.route(
    `**/api/v2/portfolio/${BUNDLE_USER_ID}/landing`,
    jsonRoute(LANDING_FIXTURE),
  );
  await page.route(
    `**/api/v2/analytics/${BUNDLE_USER_ID}/dashboard*`,
    jsonRoute(DASHBOARD_FIXTURE, options.dashboardDelayMs ?? 0),
  );
  await page.route(
    `**/api/v2/analytics/${BUNDLE_USER_ID}/yield/daily*`,
    jsonRoute(DAILY_YIELD_FIXTURE),
  );
  await page.route(
    `**/api/v2/analytics/${BUNDLE_USER_ID}/yield/summary*`,
    jsonRoute(YIELD_SUMMARY_FIXTURE),
  );
  await page.route(
    `**/api/v3/strategy/daily-suggestion/${BUNDLE_USER_ID}*`,
    jsonRoute(DAILY_SUGGESTION_FIXTURE),
  );
}

test('public bundle view renders Home read-only for a logged-out visitor', async ({
  page,
}) => {
  // Safe to assert here because the trap below guarantees every analytics
  // request is answered with JSON; nothing can parse `index.html` and retry.
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => {
    pageErrors.push(`${page.url()}: ${error.stack ?? error.message}`);
  });
  const unstubbedPaths = new Set<string>();
  await trapUnstubbedAnalyticsCalls(page, unstubbedPaths);
  await routeHomeBundleApi(page);

  await page.goto(BUNDLE_VIEW_PATH);
  await expect(page).toHaveURL(/\/home/, { timeout: APP_BOOT_TIMEOUT });

  await expect(page.getByRole('button', { name: NET_WORTH_LABEL })).toBeVisible(
    { timeout: APP_BOOT_TIMEOUT },
  );
  await expect(page.getByTestId('portfolio-trend-chart')).toBeVisible();
  // Proves the v3 suggestion stub was consumed: the strategy card resolves to
  // its no-action title instead of sitting in a skeleton.
  await expect(page.getByText('Portfolio on target')).toBeVisible();

  await expect(page.getByText(CRASH_FALLBACK_COPY)).toHaveCount(0);
  await expect(page.getByText('Sign in to continue')).toHaveCount(0);

  // The read-only invariant: with `?userId=` set, `account.isOwnBundle` is
  // false and the write affordances must not render at all. These locators are
  // not vacuous — smoke.spec.ts asserts the same three buttons and the wallet
  // assets label are VISIBLE on the own-bundle Home.
  for (const label of OWNER_ONLY_BUTTONS) {
    await expect(
      page.getByRole('button', { name: label, exact: true }),
    ).toHaveCount(0);
  }
  await expect(page.getByText('Wallet assets')).toHaveCount(0);

  expect([...unstubbedPaths]).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test('a slow dashboard no longer holds back the balance headline', async ({
  page,
}) => {
  // The reason this spec exists. `useHomeData` used to expose a single
  // aggregated `isLoading`, so the net-worth headline stayed a skeleton until
  // the slowest of landing/dashboard/suggestion returned. Holding only the
  // dashboard makes that coupling observable: the balance must appear on the
  // landing query's schedule, and this test would have failed before the
  // per-section split.
  //
  // No `pageerror` assertion here on purpose — this test ends with a
  // deliberately in-flight request, and the timing invariant is the point.
  const unstubbedPaths = new Set<string>();
  await trapUnstubbedAnalyticsCalls(page, unstubbedPaths);
  await routeHomeBundleApi(page, { dashboardDelayMs: SLOW_DASHBOARD_DELAY });

  await page.goto(BUNDLE_VIEW_PATH);
  // Home's queries all fire on the same mount as this label, so waiting for it
  // starts the budget below at the moment the dashboard request is issued
  // rather than paying for the app shell's boot twice.
  await expect(page.getByText('Balance trend')).toBeVisible({
    timeout: APP_BOOT_TIMEOUT,
  });

  await expect(page.getByRole('button', { name: NET_WORTH_LABEL })).toBeVisible(
    { timeout: SECTION_INDEPENDENCE_BUDGET },
  );
  // Still nothing from the dashboard: the balance won the race outright.
  await expect(page.getByTestId('portfolio-trend-chart')).toHaveCount(0);

  // And the delayed stub really was the one in play — the chart still arrives.
  await expect(page.getByTestId('portfolio-trend-chart')).toBeVisible({
    timeout: SLOW_DASHBOARD_DELAY * 2,
  });

  expect([...unstubbedPaths]).toEqual([]);
});
