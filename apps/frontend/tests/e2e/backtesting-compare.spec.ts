import {
  type APIRequestContext,
  expect,
  type Page,
  type Route,
  test,
} from '@playwright/test';

const BUNDLE_USER_ID = '0x1234567890123456789012345678901234567890';
const LIVE_ANALYTICS_ENGINE_URL =
  process.env['VITE_ANALYTICS_ENGINE_URL'] ?? 'http://127.0.0.1:8001';
const PLAYWRIGHT_TEST_BASE_URL =
  process.env['PLAYWRIGHT_BASE_URL'] ??
  `http://127.0.0.1:${process.env['PLAYWRIGHT_PORT'] ?? '3000'}`;
const PLAYWRIGHT_TEST_ORIGIN = new URL(PLAYWRIGHT_TEST_BASE_URL).origin;
const ROTATION_STRATEGY_ID = 'eth_btc_rotation_default';
const UI_PRIMARY_CONFIG_ID = 'dma_gated_fgi_default';
const ROTATION_STRATEGY_LABEL = 'ETH/BTC Relative Strength Rotation';
const ROTATION_SPOT_SEGMENT_TEST_ID = `backtest-${UI_PRIMARY_CONFIG_ID}-btc`;
const ETH_CHART_COLOR_RGB = '99, 102, 241';
const BTC_CHART_COLOR_RGB = '245, 158, 11';

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
      strategy_id: 'dca_classic',
      display_name: 'DCA Classic',
      description: 'Baseline',
      param_schema: { type: 'object', additionalProperties: false },
      default_params: {},
      supports_daily_suggestion: false,
    },
    {
      strategy_id: 'dma_gated_fgi',
      display_name: 'DMA Gated FGI',
      description: 'DMA-first strategy',
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
      config_id: 'dma_gated_fgi_default',
      display_name: 'DMA Gated FGI Default',
      description: 'Curated DMA-first preset',
      strategy_id: 'dma_gated_fgi',
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
    dca_classic: {
      strategy_id: 'dca_classic',
      display_name: 'DCA Classic',
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
    dma_gated_fgi_default: {
      strategy_id: 'dma_gated_fgi',
      display_name: 'DMA Gated FGI Default',
      signal_id: 'dma_gated_fgi',
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
        dca_classic: {
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
        dma_gated_fgi_default: {
          portfolio: {
            spot_usd: 5000,
            stable_usd: 5000,
            total_value: 10000,
            allocation: { spot: 0.5, stable: 0.5 },
          },
          signal: {
            id: 'dma_gated_fgi',
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
        dca_classic: {
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
        dma_gated_fgi_default: {
          portfolio: {
            spot_usd: 4800,
            stable_usd: 5200,
            total_value: 10000,
            allocation: { spot: 0.48, stable: 0.52 },
          },
          signal: {
            id: 'dma_gated_fgi',
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
        dca_classic: {
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
        dma_gated_fgi_default: {
          portfolio: {
            spot_usd: 7000,
            stable_usd: 3000,
            total_value: 10000,
            allocation: { spot: 0.7, stable: 0.3 },
          },
          signal: {
            id: 'dma_gated_fgi',
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

async function registerLandingRoute(page: Page): Promise<void> {
  await page.route(ROUTE_PATTERNS.landing, async (route: Route) => {
    await fulfillJson(route, LANDING_RESPONSE);
  });
}

async function isLiveAnalyticsBackendAvailable(
  request: APIRequestContext,
): Promise<boolean> {
  try {
    const response = await request.get(
      `${LIVE_ANALYTICS_ENGINE_URL}/api/v3/backtesting/strategies`,
      {
        timeout: 5000,
      },
    );

    if (!response.ok()) {
      return false;
    }

    const payload = (await response.json()) as { strategies?: unknown };
    return Array.isArray(payload.strategies);
  } catch {
    return false;
  }
}

async function isLiveAnalyticsCorsCompatible(
  request: APIRequestContext,
): Promise<boolean> {
  try {
    const response = await request.get(
      `${LIVE_ANALYTICS_ENGINE_URL}/api/v3/backtesting/strategies`,
      {
        timeout: 5000,
        headers: {
          Origin: PLAYWRIGHT_TEST_ORIGIN,
        },
      },
    );

    if (!response.ok()) {
      return false;
    }

    const allowOrigin = response.headers()['access-control-allow-origin'];
    return allowOrigin === '*' || allowOrigin === PLAYWRIGHT_TEST_ORIGIN;
  } catch {
    return false;
  }
}

async function fetchLiveCompareResponse(request: APIRequestContext): Promise<{
  timeline?: {
    strategies?: Record<
      string,
      { portfolio?: { spot_asset?: string | null } | undefined } | undefined
    >;
  }[];
}> {
  const configsResponse = await request.get(
    `${LIVE_ANALYTICS_ENGINE_URL}/api/v3/strategy/configs`,
    {
      timeout: 10000,
    },
  );
  expect(configsResponse.ok()).toBeTruthy();

  const configsPayload = (await configsResponse.json()) as {
    presets: {
      config_id: string;
      strategy_id: string;
      params: Record<string, unknown>;
    }[];
    backtest_defaults?: {
      days?: number;
      total_capital?: number;
    };
  };

  const compareResponse = await request.post(
    `${LIVE_ANALYTICS_ENGINE_URL}/api/v3/backtesting/compare`,
    {
      timeout: 120000,
      data: {
        days: configsPayload.backtest_defaults?.days ?? 500,
        total_capital: configsPayload.backtest_defaults?.total_capital ?? 10000,
        configs: configsPayload.presets.map((preset) => ({
          config_id: preset.config_id,
          strategy_id: preset.strategy_id,
          params: preset.params,
        })),
      },
    },
  );
  expect(compareResponse.ok()).toBeTruthy();

  return (await compareResponse.json()) as {
    timeline?: {
      strategies?: Record<
        string,
        { portfolio?: { spot_asset?: string | null } | undefined } | undefined
      >;
    }[];
  };
}

async function findRotationSpotSegmentSnapshot(page: Page): Promise<{
  title: string;
  style: string;
} | null> {
  const chartSurface = page.locator('.recharts-surface').first();
  await expect(chartSurface).toBeVisible();

  const box = await chartSurface.boundingBox();
  if (box == null) {
    return null;
  }

  const segment = page.getByTestId(ROTATION_SPOT_SEGMENT_TEST_ID);
  const xRatios = [0.2, 0.32, 0.44, 0.56, 0.68, 0.8];
  const yRatios = [0.22, 0.36, 0.5, 0.64];

  for (const xRatio of xRatios) {
    for (const yRatio of yRatios) {
      await page.mouse.move(
        box.x + box.width * xRatio,
        box.y + box.height * yRatio,
      );

      try {
        await expect(segment).toBeVisible({ timeout: 400 });
      } catch {
        continue;
      }

      const title = (await segment.getAttribute('title')) ?? '';
      const style = ((await segment.getAttribute('style')) ?? '').toLowerCase();

      if (
        title.startsWith('ETH:') ||
        title.startsWith('BTC:') ||
        title.startsWith('SPOT:')
      ) {
        return { title, style };
      }
    }
  }

  return null;
}

async function switchUiStrategyToRotation(page: Page): Promise<void> {
  await page.getByRole('button', { name: /DMA Gated FGI/i }).click();
  await page.getByRole('option', { name: ROTATION_STRATEGY_LABEL }).click();
  await expect(
    page.getByRole('button', {
      name: new RegExp(ROTATION_STRATEGY_LABEL, 'i'),
    }),
  ).toBeVisible();
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

    await expect(page.getByText('DCA Classic').first()).toBeVisible();
    await expect(page.getByText('DMA Gated FGI Default').first()).toBeVisible();

    await expect(page.getByText('Sell Spot').first()).toBeVisible();
    await expect(page.getByText('Buy Spot').first()).toBeVisible();
  });

  test('renders asset-specific tooltip labels from a live analytics-engine response', async ({
    page,
    request,
  }) => {
    test.setTimeout(120000);

    const backendAvailable = await isLiveAnalyticsBackendAvailable(request);
    const corsCompatible = await isLiveAnalyticsCorsCompatible(request);
    test.skip(
      !backendAvailable,
      `Requires analytics-engine at ${LIVE_ANALYTICS_ENGINE_URL}`,
    );
    test.skip(
      !corsCompatible,
      `Requires analytics-engine CORS to allow ${PLAYWRIGHT_TEST_ORIGIN}`,
    );

    await registerLandingRoute(page);

    const compareJson = await fetchLiveCompareResponse(request);

    const rotationPointWithSpotAsset = compareJson.timeline?.find((point) => {
      const spotAsset =
        point.strategies?.[ROTATION_STRATEGY_ID]?.portfolio?.spot_asset;
      return spotAsset === 'BTC' || spotAsset === 'ETH';
    });

    expect(rotationPointWithSpotAsset).toBeTruthy();

    await openBacktestingView(page);

    await expect(page.getByText(SELECTORS.roiLabel)).toBeVisible({
      timeout: 60000,
    });

    await switchUiStrategyToRotation(page);
    await page.getByRole('button', { name: /\[RUN\]/ }).click();
    await page.waitForTimeout(12000);

    const segmentSnapshot = await findRotationSpotSegmentSnapshot(page);
    expect(segmentSnapshot).not.toBeNull();

    const { title, style } = segmentSnapshot ?? { title: '', style: '' };

    expect(title.startsWith('SPOT:')).toBeFalsy();

    if (title.startsWith('ETH:')) {
      expect(style).toContain(ETH_CHART_COLOR_RGB);
      return;
    }

    expect(title.startsWith('BTC:')).toBeTruthy();
    expect(style).toContain(BTC_CHART_COLOR_RGB);
  });
});
