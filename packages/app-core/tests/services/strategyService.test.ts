import { beforeEach, describe, expect, it, vi } from 'vitest';

import { setErrorReporter } from '../../src/lib/observability/errorReporter';

const analyticsEngine = vi.hoisted(() => ({
  get: vi.fn(),
}));

vi.mock('../../src/lib/http', () => ({
  httpUtils: {
    analyticsEngine,
  },
}));

const { getDailySuggestion } =
  await import('../../src/services/strategyService');

/**
 * Mirrors what analytics-engine returns for a bundle that needs no rebalance,
 * built field-by-field from packages/types/src/strategy.
 */
function buildValidSuggestion() {
  return {
    as_of: '2026-09-05',
    config_id: 'dma_fgi_portfolio_rules_default',
    config_display_name: 'DMA + Fear & Greed',
    strategy_id: 'dma_fgi_portfolio_rules',
    action: {
      status: 'no_action',
      required: false,
      kind: null,
      reason_code: 'within_tolerance',
      transfers: [],
    },
    context: {
      market: {
        date: '2026-09-05',
        token_price: { BTC: 64000.5 },
        sentiment: 52,
        sentiment_label: 'Neutral',
      },
      signal: {
        id: 'dma_fgi',
        regime: 'n',
        raw_value: 52,
        confidence: 0.5,
      },
      portfolio: {
        spot_usd: 600,
        stable_usd: 400,
        total_value: 1000,
        allocation: { spot: 0.6, stable: 0.4 },
        asset_allocation: { btc: 0.6, eth: 0, spy: 0, stable: 0.4, alt: 0 },
      },
      target: {
        allocation: { btc: 0.6, eth: 0, spy: 0, stable: 0.4, alt: 0 },
      },
      strategy: {
        stance: 'hold',
        reason_code: 'within_tolerance',
        rule_group: 'dma_fgi',
      },
    },
  };
}

let reporter: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  reporter = vi.fn();
  setErrorReporter(reporter);
});

describe('getDailySuggestion', () => {
  it('returns a schema-clean payload without reporting anything', async () => {
    const response = buildValidSuggestion();
    analyticsEngine.get.mockResolvedValue(response);

    await expect(getDailySuggestion('user-1')).resolves.toBe(response);

    expect(analyticsEngine.get).toHaveBeenCalledWith(
      '/api/v3/strategy/daily-suggestion/user-1',
      { timeout: 60_000 },
    );
    expect(reporter).not.toHaveBeenCalled();
  });

  it('passes a preset config id through as a query parameter', async () => {
    analyticsEngine.get.mockResolvedValue(buildValidSuggestion());

    await getDailySuggestion('user-1', 'dma_fgi_portfolio_rules_default');

    expect(analyticsEngine.get).toHaveBeenCalledWith(
      '/api/v3/strategy/daily-suggestion/user-1?config_id=dma_fgi_portfolio_rules_default',
      { timeout: 60_000 },
    );
  });

  it('still returns the payload when the backend adds an allocation key', async () => {
    // TargetAllocationSchema is `.strict()`, so a new backend asset key is a
    // hard schema failure. The card must survive it.
    const response = buildValidSuggestion();
    Object.assign(response.context.target.allocation, { sol: 0 });
    analyticsEngine.get.mockResolvedValue(response);

    await expect(getDailySuggestion('user-1')).resolves.toBe(response);

    expect(reporter).toHaveBeenCalledTimes(1);
    const [error, context] = reporter.mock.calls[0] as [
      Error,
      { scope: string; extra: { issues: { path: string; code: string }[] } },
    ];
    expect(error).toBeInstanceOf(Error);
    expect(context.scope).toBe('strategyService.getDailySuggestion');
    expect(context.extra.issues).toEqual([
      { path: 'context.target.allocation', code: 'unrecognized_keys' },
    ]);
  });

  it('still returns the payload when alt sits inside the backend tolerance', async () => {
    // The backend only rejects `alt > 0.001`; the schema demands exactly 0.
    const response = buildValidSuggestion();
    response.context.target.allocation.alt = 0.001;
    analyticsEngine.get.mockResolvedValue(response);

    await expect(getDailySuggestion('user-1')).resolves.toBe(response);

    expect(reporter).toHaveBeenCalledTimes(1);
    const [, context] = reporter.mock.calls[0] as [
      Error,
      { extra: { issues: { path: string; code: string }[] } },
    ];
    expect(context.extra.issues).toEqual([
      { path: 'context.target.allocation.alt', code: 'custom' },
    ]);
  });

  it('reports nothing but the mismatch shape, never the payload', async () => {
    const response = buildValidSuggestion();
    response.context.portfolio.total_value = -1;
    analyticsEngine.get.mockResolvedValue(response);

    await getDailySuggestion('user-1');

    const [, context] = reporter.mock.calls[0] as [
      Error,
      { extra: Record<string, unknown> },
    ];
    expect(JSON.stringify(context.extra)).not.toContain('64000.5');
    expect(Object.keys(context.extra)).toEqual(['issues']);
  });
});
