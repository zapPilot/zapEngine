import { expect, type Page, type Route, test } from '@playwright/test';

const BUNDLE_USER_ID = '0x1234567890123456789012345678901234567890';

const ROUTE_PATTERNS = {
  landing: '**/api/v2/portfolio/*/landing',
  strategies: '**/api/v3/backtesting/strategies',
  compare: '**/api/v3/backtesting/compare',
  strategyConfigs: '**/api/v3/strategy/configs',
} as const;

const SELECTORS = {
  investTabTestId: 'v22-tab-invest',
  backtestingSubTabName: /^backtesting$/i,
  roiLabel: 'ROI',
  calmarLabel: 'CALMAR',
  maxDrawdownLabel: 'MAX DRAWDOWN',
} as const;

const LANDING_RESPONSE = {
  total_net_usd: 0,
  net_portfolio_value: 0,
  positions: 0,
  protocols: 0,
  chains: 0,
  portfolio_allocation: {
    btc: {
      total_value: 0,
      percentage_of_portfolio: 0,
      wallet_tokens_value: 0,
      other_sources_value: 0,
    },
    eth: {
      total_value: 0,
      percentage_of_portfolio: 0,
      wallet_tokens_value: 0,
      other_sources_value: 0,
    },
    stablecoins: {
      total_value: 0,
      percentage_of_portfolio: 0,
      wallet_tokens_value: 0,
      other_sources_value: 0,
    },
    others: {
      total_value: 0,
      percentage_of_portfolio: 0,
      wallet_tokens_value: 0,
      other_sources_value: 0,
    },
  },
} as const;

const STRATEGIES_RESPONSE = {
  catalog_version: '2.0.0',
  strategies: [
    {
      strategy_id: 'dma_fgi_portfolio_rules',
      display_name: 'DMA/FGI Portfolio Rules',
      description: 'Rule-based portfolio strategy',
      param_schema: { type: 'object' },
      default_params: {
        signal: {
          cross_cooldown_days: 30,
        },
        pacing: {
          k: 5,
          r_max: 1,
        },
      },
      supports_daily_suggestion: true,
    },
  ],
} as const;

const STRATEGY_CONFIGS_RESPONSE = {
  presets: [
    {
      config_id: 'dma_fgi_portfolio_rules_default',
      display_name: 'DMA/FGI Portfolio Rules',
      description: 'Curated portfolio-rules preset',
      strategy_id: 'dma_fgi_portfolio_rules',
      params: {
        signal: {
          cross_cooldown_days: 30,
        },
        pacing: {
          k: 5,
          r_max: 1,
        },
      },
      is_default: true,
      is_benchmark: false,
    },
  ],
  backtest_defaults: {
    days: 500,
    total_capital: 10000,
  },
} as const;

const COMPARE_RESPONSE = {
  strategies: {
    dma_fgi_portfolio_rules: {
      strategy_id: 'dma_fgi_portfolio_rules',
      display_name: 'Portfolio Rules',
      total_invested: 10000,
      final_value: 11000,
      roi_percent: 10,
      trade_count: 2,
      max_drawdown_percent: -5,
      calmar_ratio: 2.0,
      parameters: {},
      final_allocation: {
        spot: 0.5,
        stable: 0.5,
      },
    },
    dma_fgi_portfolio_rules_default: {
      strategy_id: 'dma_fgi_portfolio_rules',
      display_name: 'DMA/FGI Portfolio Rules',
      signal_id: 'dma_fgi_portfolio_rules_signal',
      total_invested: 10000,
      final_value: 11200,
      roi_percent: 12,
      trade_count: 3,
      max_drawdown_percent: -4,
      calmar_ratio: 3.0,
      parameters: {},
      final_allocation: {
        spot: 0.7,
        stable: 0.3,
      },
    },
  },
  timeline: [
    {
      market: {
        date: '2024-01-01',
        token_price: { btc: 50000 },
        sentiment: 50,
        sentiment_label: 'neutral',
      },
      strategies: {
        dma_fgi_portfolio_rules: {
          portfolio: {
            spot_usd: 5000,
            stable_usd: 5000,
            total_value: 10000,
            allocation: { spot: 0.5, stable: 0.5 },
          },
          signal: null,
          decision: {
            action: 'hold',
            reason: 'baseline_dca',
            rule_group: 'none',
            target_allocation: { spot: 0.5, stable: 0.5 },
            immediate: false,
          },
          execution: {
            event: null,
            transfers: [],
            blocked_reason: null,
            step_count: 0,
            steps_remaining: 0,
            interval_days: 0,
          },
        },
        dma_fgi_portfolio_rules_default: {
          portfolio: {
            spot_usd: 5000,
            stable_usd: 5000,
            total_value: 10000,
            allocation: { spot: 0.5, stable: 0.5 },
          },
          signal: {
            id: 'dma_fgi_portfolio_rules',
            regime: 'fear',
            raw_value: 25,
            confidence: 1,
            details: {
              dma: {
                dma_200: 49500,
                distance: 0.01,
                zone: 'above',
                cross_event: null,
                cooldown_active: false,
                cooldown_remaining_days: 0,
                cooldown_blocked_zone: null,
                fgi_slope: 1,
              },
            },
          },
          decision: {
            action: 'hold',
            reason: 'wait',
            rule_group: 'none',
            target_allocation: { spot: 0.5, stable: 0.5 },
            immediate: false,
          },
          execution: {
            event: null,
            transfers: [],
            blocked_reason: null,
            step_count: 0,
            steps_remaining: 0,
            interval_days: 3,
          },
        },
      },
    },
    {
      market: {
        date: '2024-01-02',
        token_price: { btc: 50500 },
        sentiment: 45,
        sentiment_label: 'fear',
      },
      strategies: {
        dma_fgi_portfolio_rules: {
          portfolio: {
            spot_usd: 5100,
            stable_usd: 5000,
            total_value: 10100,
            allocation: { spot: 0.50495, stable: 0.49505 },
          },
          signal: null,
          decision: {
            action: 'buy',
            reason: 'baseline_dca',
            rule_group: 'none',
            target_allocation: { spot: 0.51, stable: 0.49 },
            immediate: false,
          },
          execution: {
            event: 'buy',
            transfers: [],
            blocked_reason: null,
            step_count: 1,
            steps_remaining: 0,
            interval_days: 7,
          },
        },
        dma_fgi_portfolio_rules_default: {
          portfolio: {
            spot_usd: 4800,
            stable_usd: 5200,
            total_value: 10000,
            allocation: { spot: 0.48, stable: 0.52 },
          },
          signal: {
            id: 'dma_fgi_portfolio_rules',
            regime: 'fear',
            raw_value: 20,
            confidence: 1,
            details: {
              dma: {
                dma_200: 49750,
                distance: -0.02,
                zone: 'below',
                cross_event: 'cross_down',
                cooldown_active: false,
                cooldown_remaining_days: 0,
                cooldown_blocked_zone: null,
                fgi_slope: -1,
              },
            },
          },
          decision: {
            action: 'sell',
            reason: 'cross_down_exit',
            rule_group: 'cross',
            target_allocation: { spot: 0.3, stable: 0.7 },
            immediate: true,
          },
          execution: {
            event: 'rebalance',
            transfers: [
              {
                from_bucket: 'spot',
                to_bucket: 'stable',
                amount_usd: 200,
              },
            ],
            blocked_reason: null,
            step_count: 1,
            steps_remaining: 0,
            interval_days: 3,
          },
        },
      },
    },
    {
      market: {
        date: '2024-01-03',
        token_price: { btc: 51000 },
        sentiment: 60,
        sentiment_label: 'greed',
      },
      strategies: {
        dma_fgi_portfolio_rules: {
          portfolio: {
            spot_usd: 5200,
            stable_usd: 5000,
            total_value: 10200,
            allocation: { spot: 0.5098, stable: 0.4902 },
          },
          signal: null,
          decision: {
            action: 'buy',
            reason: 'baseline_dca',
            rule_group: 'none',
            target_allocation: { spot: 0.52, stable: 0.48 },
            immediate: false,
          },
          execution: {
            event: 'buy',
            transfers: [],
            blocked_reason: null,
            step_count: 1,
            steps_remaining: 0,
            interval_days: 7,
          },
        },
        dma_fgi_portfolio_rules_default: {
          portfolio: {
            spot_usd: 7000,
            stable_usd: 3000,
            total_value: 10000,
            allocation: { spot: 0.7, stable: 0.3 },
          },
          signal: {
            id: 'dma_fgi_portfolio_rules',
            regime: 'greed',
            raw_value: 70,
            confidence: 1,
            details: {
              dma: {
                dma_200: 50000,
                distance: 0.02,
                zone: 'above',
                cross_event: 'cross_up',
                cooldown_active: false,
                cooldown_remaining_days: 0,
                cooldown_blocked_zone: null,
                fgi_slope: 1,
              },
            },
          },
          decision: {
            action: 'buy',
            reason: 'cross_up_entry',
            rule_group: 'cross',
            target_allocation: { spot: 0.7, stable: 0.3 },
            immediate: true,
          },
          execution: {
            event: 'rebalance',
            transfers: [
              {
                from_bucket: 'stable',
                to_bucket: 'spot',
                amount_usd: 400,
              },
            ],
            blocked_reason: null,
            step_count: 1,
            steps_remaining: 0,
            interval_days: 3,
          },
        },
      },
    },
  ],
} as const;

function getJsonResponseOptions(body: unknown): {
  status: number;
  contentType: string;
  body: string;
} {
  return {
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  };
}

async function fulfillJson(route: Route, body: unknown): Promise<void> {
  await route.fulfill(getJsonResponseOptions(body));
}

async function registerBacktestingRoutes(page: Page): Promise<void> {
  await page.route(ROUTE_PATTERNS.landing, async (route: Route) => {
    await fulfillJson(route, LANDING_RESPONSE);
  });

  await page.route(ROUTE_PATTERNS.strategies, async (route: Route) => {
    await fulfillJson(route, STRATEGIES_RESPONSE);
  });

  await page.route(ROUTE_PATTERNS.strategyConfigs, async (route: Route) => {
    await fulfillJson(route, STRATEGY_CONFIGS_RESPONSE);
  });

  await page.route(ROUTE_PATTERNS.compare, async (route: Route) => {
    await fulfillJson(route, COMPARE_RESPONSE);
  });
}

async function openBacktestingView(page: Page): Promise<void> {
  await page.goto(`/bundle?userId=${BUNDLE_USER_ID}`);
  await page.waitForLoadState('domcontentloaded');
  await page.getByTestId(SELECTORS.investTabTestId).click();
  await page
    .getByRole('button', { name: SELECTORS.backtestingSubTabName })
    .first()
    .click();
}

test.describe('Backtesting (v3) - Terminal display + two-bucket chart', () => {
  test('renders terminal display with current v3 contract data', async ({
    page,
  }) => {
    await registerBacktestingRoutes(page);
    await openBacktestingView(page);

    await expect(page.getByText(SELECTORS.roiLabel)).toBeVisible();
    await expect(page.getByText(SELECTORS.calmarLabel)).toBeVisible();
    await expect(page.getByText(SELECTORS.maxDrawdownLabel)).toBeVisible();

    await expect(
      page.getByText('DMA/FGI Portfolio Rules').first(),
    ).toBeVisible();

    await expect(page.getByText('Sell Spot').first()).toBeVisible();
    await expect(page.getByText('Buy Spot').first()).toBeVisible();
  });

  test('renders asset-specific switch labels from mocked compare data', async ({
    page,
  }) => {
    await registerBacktestingRoutes(page);

    await openBacktestingView(page);

    await expect(page.getByText(SELECTORS.roiLabel)).toBeVisible({
      timeout: 60000,
    });

    await expect(page.getByText('Switch to ETH')).toBeVisible();
    await expect(page.getByText('Switch to BTC')).toBeVisible();
    await expect(page.getByText('Switch to SPY')).toBeVisible();
  });
});
