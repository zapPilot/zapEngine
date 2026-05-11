import { DailySuggestionData } from '../../../../src/modules/notifications/interfaces';
import {
  buildDailySuggestionMessagePayload,
  encodeDailySuggestionDoneCallbackData,
  formatDailySuggestionMessage,
  formatDailySuggestionPortfolioSummary,
  formatDriftMessage,
  formatIdentifierTitleCase,
  formatIdentifierUppercase,
  formatUsdAmount,
  humanizeReasonCode,
  parseDailySuggestionDoneCallbackData,
} from '../../../../src/modules/notifications/telegram-message.util';

function createDailySuggestionData(
  overrides: Partial<DailySuggestionData> = {},
): DailySuggestionData {
  return {
    as_of: '2025-01-01',
    config_id: 'test-config',
    config_display_name: 'Test Config',
    strategy_id: 'test-strategy',
    action: {
      status: 'no_action',
      required: false,
      kind: null,
      reason_code: 'already_aligned',
      transfers: [],
    },
    context: {
      market: {
        date: '2025-01-01',
        token_price: { btc: 100000, eth: 4000 },
        sentiment: 50,
        sentiment_label: 'neutral',
      },
      signal: {
        id: 'signal',
        regime: 'neutral',
        raw_value: 50,
        confidence: 1,
        details: {},
      },
      portfolio: {
        spot_usd: 5000,
        stable_usd: 5000,
        total_value: 10000,
        allocation: { spot: 0.5, stable: 0.5 },
        asset_allocation: { btc: 0.5, eth: 0, spy: 0, stable: 0.5, alt: 0 },
      },
      target: {
        allocation: { btc: 0.6, eth: 0, spy: 0, stable: 0.4, alt: 0 },
      },
      strategy: {
        stance: 'hold',
        reason_code: 'already_aligned',
        rule_group: 'none',
        details: {},
      },
    },
    ...overrides,
  };
}

describe('telegram-message.util', () => {
  it('formats drift alert messages', () => {
    const message = formatDriftMessage({
      drift_percentage: 15.5,
      wallet_address: '0x1234567890abcdef1234567890abcdef12345678',
      recommendations: [
        {
          action: 'buy',
          token: 'ETH',
          amount_usd: 500,
          current_percent: 30,
          target_percent: 50,
        },
      ],
    });

    expect(message).toContain('Portfolio Drift Alert');
    expect(message).toContain('15.5%');
    expect(message).toContain('🟢 Buy $500 ETH');
    expect(message).toContain(
      'https://zap-pilot.com/rebalance?wallet=0x1234567890abcdef1234567890abcdef12345678',
    );
  });

  it('formats no-action daily suggestions without a Done button payload', () => {
    const data = createDailySuggestionData();

    expect(formatDailySuggestionMessage(data)).toContain('No Action Needed');
    expect(formatDailySuggestionMessage(data)).toContain('Portfolio: $10,000');
    expect(buildDailySuggestionMessagePayload(data)).toEqual({
      message: expect.stringContaining('No Action Needed'),
    });
  });

  it('adds debt-aware totals and Done callback data for action-required suggestions', () => {
    const data = createDailySuggestionData({
      config_id: 'dma_fgi_portfolio_rules_default',
      strategy_id: 'dma_fgi_portfolio_rules',
      action: {
        status: 'action_required',
        required: true,
        kind: 'rebalance',
        reason_code: 'eth_btc_ratio_rebalance',
        transfers: [{ from_bucket: 'btc', to_bucket: 'eth', amount_usd: 750 }],
      },
      context: {
        ...createDailySuggestionData().context,
        market: {
          ...createDailySuggestionData().context.market,
          sentiment: 72,
          sentiment_label: 'greed',
        },
        signal: {
          ...createDailySuggestionData().context.signal,
          regime: 'greed',
          raw_value: 72,
        },
        portfolio: {
          ...createDailySuggestionData().context.portfolio,
          spot_usd: 7000,
          stable_usd: 3000,
          total_assets_usd: 10000,
          total_debt_usd: 2000,
          total_net_usd: 8000,
        },
      },
    });

    const payload = buildDailySuggestionMessagePayload(data);

    expect(payload.message).toContain('Rebalance Needed');
    expect(payload.message).toContain('Net: $8,000');
    expect(payload.message).toContain('Assets: $10,000');
    expect(payload.message).toContain('Debt: $2,000');
    expect(payload.replyMarkup).toEqual({
      inline_keyboard: [
        [
          {
            text: '☑️ Done',
            callback_data:
              'dsdone|dma_fgi_portfolio_rules_default|dma_fgi_portfolio_rules',
          },
        ],
      ],
    });
  });

  it('omits Done callback data when it would exceed Telegram limits', () => {
    const data = createDailySuggestionData({
      config_id: 'c'.repeat(40),
      strategy_id: 's'.repeat(40),
      action: {
        status: 'action_required',
        required: true,
        kind: 'rebalance',
        reason_code: 'eth_btc_ratio_rebalance',
        transfers: [{ from_bucket: 'btc', to_bucket: 'eth', amount_usd: 750 }],
      },
    });

    expect(
      buildDailySuggestionMessagePayload(data).replyMarkup,
    ).toBeUndefined();
  });

  it('formats blocked daily suggestions', () => {
    const message = formatDailySuggestionMessage(
      createDailySuggestionData({
        action: {
          status: 'blocked',
          required: false,
          kind: null,
          reason_code: 'above_greed_sell',
          transfers: [],
        },
      }),
    );

    expect(message).toContain('Action Blocked');
    expect(message).toContain('Greed remains elevated');
  });

  it('formats portfolio debt fallback values', () => {
    const data = createDailySuggestionData({
      context: {
        ...createDailySuggestionData().context,
        portfolio: {
          ...createDailySuggestionData().context.portfolio,
          total_value: 10000,
          total_debt_usd: 2000,
        },
      },
    });

    expect(formatDailySuggestionPortfolioSummary(data)).toBe(
      'Net: $8,000\nAssets: $10,000\nDebt: $2,000',
    );
  });

  it('humanizes known, unknown, and empty reason codes', () => {
    expect(humanizeReasonCode('already_aligned')).toBe(
      'Portfolio is already aligned with the current target.',
    );
    expect(humanizeReasonCode('some_unknown_code_xyz')).toBe(
      'Some unknown code xyz.',
    );
    expect(humanizeReasonCode('')).toBe('No additional context.');
  });

  it('formats identifiers and USD amounts', () => {
    expect(formatUsdAmount(1234.56)).toBe('$1,235');
    expect(formatIdentifierUppercase('btc-stable_bucket')).toBe(
      'BTC STABLE BUCKET',
    );
    expect(formatIdentifierTitleCase('bull_market')).toBe('Bull Market');
  });

  it('encodes and parses Done callback data', () => {
    const encoded = encodeDailySuggestionDoneCallbackData('cfg', 'strat');

    expect(encoded).toBe('dsdone|cfg|strat');
    expect(parseDailySuggestionDoneCallbackData(encoded)).toEqual({
      configId: 'cfg',
      strategyId: 'strat',
    });
    expect(parseDailySuggestionDoneCallbackData('dsdone|broken')).toBeNull();
    expect(parseDailySuggestionDoneCallbackData('other|cfg|strat')).toBeNull();
  });
});
