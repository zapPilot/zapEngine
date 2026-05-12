import type { Mock } from 'vitest';

import { DatabaseService } from '../../../../src/database/database.service';
import { DailySuggestionData } from '../../../../src/modules/notifications/interfaces';
import { TelegramBotCoreService } from '../../../../src/modules/notifications/telegram-bot-core.service';
import { TelegramNotificationService } from '../../../../src/modules/notifications/telegram-notification.service';
import { createMockDatabaseService } from '../../../test-utils';

interface MockBot {
  telegram: {
    sendMessage: Mock;
  };
}

function createDailySuggestionData(
  overrides: Partial<DailySuggestionData> = {},
): DailySuggestionData {
  return {
    as_of: '2025-01-01',
    config_id: 'test',
    config_display_name: 'Test Config',
    strategy_id: 'strat-1',
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

function createNotificationMocks(bot: MockBot | null = createMockBot()) {
  const dbMock = createMockDatabaseService();
  const botCore = {
    getBot: vi.fn(() => bot),
  };
  const service = new TelegramNotificationService(
    dbMock.mock as unknown as DatabaseService,
    botCore as unknown as TelegramBotCoreService,
  );

  return { service, dbMock, botCore, bot };
}

function createMockBot(): MockBot {
  return {
    telegram: {
      sendMessage: vi.fn().mockResolvedValue({}),
    },
  };
}

describe('TelegramNotificationService', () => {
  it('sends drift alert when chat_id is found', async () => {
    const { service, dbMock, bot } = createNotificationMocks();
    dbMock.serviceRole.queryBuilder.single.mockResolvedValue({
      data: { config: { chat_id: '12345' } },
      error: null,
    });

    await service.sendDriftAlert('user-1', {
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

    expect(bot?.telegram.sendMessage).toHaveBeenCalledWith(
      '12345',
      expect.stringContaining('Portfolio Drift Alert'),
      expect.any(Object),
    );
  });

  it('does nothing when bot is not configured', async () => {
    const { service, botCore } = createNotificationMocks(null);

    await service.sendDriftAlert('user-1', {
      drift_percentage: 10,
      wallet_address: '0x1234567890abcdef1234567890abcdef12345678',
      recommendations: [],
    });

    expect(botCore.getBot).toHaveBeenCalled();
  });

  it('does nothing when no chat_id is found', async () => {
    const { service, dbMock, bot } = createNotificationMocks();
    dbMock.serviceRole.queryBuilder.single.mockResolvedValue({
      data: null,
      error: { code: 'PGRST116' },
    });

    await service.sendDriftAlert('user-1', {
      drift_percentage: 10,
      wallet_address: '0x1234567890abcdef1234567890abcdef12345678',
      recommendations: [],
    });

    expect(bot?.telegram.sendMessage).not.toHaveBeenCalled();
  });

  it('sends daily suggestion messages without inline button for no-action payloads', async () => {
    const { service, dbMock, bot } = createNotificationMocks();
    dbMock.serviceRole.queryBuilder.single.mockResolvedValue({
      data: { config: { chat_id: '12345' } },
      error: null,
    });

    await service.sendDailySuggestion('user-1', createDailySuggestionData());

    expect(bot?.telegram.sendMessage).toHaveBeenCalledWith(
      '12345',
      expect.stringContaining('Portfolio: $10,000'),
      expect.not.objectContaining({
        reply_markup: expect.anything(),
      }),
    );
  });

  it('adds a Done button and debt-aware totals for action-required payloads', async () => {
    const { service, dbMock, bot } = createNotificationMocks();
    dbMock.serviceRole.queryBuilder.single.mockResolvedValue({
      data: { config: { chat_id: '12345' } },
      error: null,
    });

    await service.sendDailySuggestion(
      'user-1',
      createDailySuggestionData({
        config_id: 'dma_fgi_portfolio_rules_default',
        strategy_id: 'dma_fgi_portfolio_rules',
        action: {
          status: 'action_required',
          required: true,
          kind: 'rebalance',
          reason_code: 'eth_btc_ratio_rebalance',
          transfers: [
            { from_bucket: 'btc', to_bucket: 'eth', amount_usd: 750 },
          ],
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
      }),
    );

    expect(bot?.telegram.sendMessage).toHaveBeenCalledWith(
      '12345',
      expect.stringContaining('Net: $8,000'),
      expect.objectContaining({
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '☑️ Done',
                callback_data:
                  'dsdone|dma_fgi_portfolio_rules_default|dma_fgi_portfolio_rules',
              },
            ],
          ],
        },
      }),
    );
  });

  it('returns connected Telegram user ids', async () => {
    const { service, dbMock } = createNotificationMocks();
    dbMock.serviceRole.queryBuilder.mockResolvedThen({
      data: [{ user_id: 'u-1' }, { user_id: 'u-2' }],
      error: null,
    });

    await expect(service.getTelegramConnectedUserIds()).resolves.toEqual([
      'u-1',
      'u-2',
    ]);
  });

  it('returns an empty array when connected-user lookup fails', async () => {
    const { service, dbMock } = createNotificationMocks();
    dbMock.serviceRole.queryBuilder.mockResolvedThen({
      data: null,
      error: null,
    });

    await expect(service.getTelegramConnectedUserIds()).resolves.toEqual([]);
  });

  it('throws when sendMessage fails with a non-blocked error', async () => {
    const { service, dbMock, bot } = createNotificationMocks();
    dbMock.serviceRole.queryBuilder.single.mockResolvedValue({
      data: { config: { chat_id: '12345' } },
      error: null,
    });
    const nonBlockedError = new Error('Network timeout');
    bot?.telegram.sendMessage.mockRejectedValueOnce(nonBlockedError);

    await expect(
      service.sendDriftAlert('user-1', {
        drift_percentage: 5,
        wallet_address: '0x1234567890abcdef1234567890abcdef12345678',
        recommendations: [],
      }),
    ).rejects.toThrow('Network timeout');
  });

  it('disables notifications when bot is blocked by user', async () => {
    const { service, dbMock, bot } = createNotificationMocks();
    dbMock.serviceRole.queryBuilder.single.mockResolvedValue({
      data: { config: { chat_id: '12345' } },
      error: null,
    });
    bot?.telegram.sendMessage.mockRejectedValueOnce({
      response: { error_code: 403 },
    });
    dbMock.serviceRole.queryBuilder.mockResolvedThen({
      data: {},
      error: null,
    });

    await expect(
      service.sendDriftAlert('user-1', {
        drift_percentage: 5,
        wallet_address: '0x1234567890abcdef1234567890abcdef12345678',
        recommendations: [],
      }),
    ).resolves.toBeUndefined();

    expect(dbMock.serviceRole.queryBuilder.update).toHaveBeenCalledWith({
      is_enabled: false,
    });
  });

  it('detects bot-blocked errors defensively', () => {
    const { service } = createNotificationMocks();

    expect(service.isBotBlockedError({ response: { error_code: 403 } })).toBe(
      true,
    );
    expect(service.isBotBlockedError('string error')).toBe(false);
    expect(service.isBotBlockedError(null)).toBe(false);
  });
});
