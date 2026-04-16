import { DatabaseService } from '@database/database.service';
import { TelegramService } from '@modules/notifications/telegram.service';
import { TelegramTokenService } from '@modules/notifications/telegram-token.service';
import {
  createMockConfigService,
  createMockDatabaseService,
  createMockQueryBuilder,
} from '@test-utils';

// Mock telegraf at module level
jest.mock('telegraf', () => ({
  Telegraf: jest.fn().mockImplementation(() => ({
    start: jest.fn(),
    command: jest.fn(),
    help: jest.fn(),
    on: jest.fn(),
    launch: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn(),
    handleUpdate: jest.fn().mockResolvedValue(undefined),
    telegram: {
      sendMessage: jest.fn().mockResolvedValue({}),
    },
  })),
}));

interface MockBot {
  start: jest.Mock;
  command: jest.Mock;
  help: jest.Mock;
  on: jest.Mock;
  launch: jest.Mock;
  stop: jest.Mock;
  handleUpdate: jest.Mock;
  telegram: {
    sendMessage: jest.Mock;
  };
}

function getMockTelegraf(): jest.Mock {
  const telegrafModule: { Telegraf: jest.Mock } = jest.requireMock('telegraf');
  return telegrafModule.Telegraf;
}

function getLatestBotMock(): MockBot {
  const mockTelegraf = getMockTelegraf();
  if (mockTelegraf.mock.results.length === 0) {
    throw new Error('Expected Telegraf mock instance');
  }

  const latestResult =
    mockTelegraf.mock.results[mockTelegraf.mock.results.length - 1];
  return latestResult.value;
}

function getStartCallback(): (ctx: unknown) => Promise<void> {
  return getLatestBotMock().start.mock.calls[0][0];
}

function getStopCallback(): (ctx: unknown) => Promise<void> {
  return getLatestBotMock().command.mock.calls[0][1];
}

function getHelpCallback(): (ctx: unknown) => Promise<void> {
  return getLatestBotMock().help.mock.calls[0][0];
}

function getCallbackHandler(): (ctx: unknown) => Promise<void> {
  return getLatestBotMock().on.mock.calls[0][1];
}

function createMocks(env: Record<string, string> = {}) {
  const dbMock = createMockDatabaseService();
  const tokenService = {
    validateToken: jest.fn(),
    invalidateToken: jest.fn().mockResolvedValue(undefined),
  };

  const configService = createMockConfigService(env);

  const service = new TelegramService(
    configService,
    dbMock.mock as unknown as DatabaseService,
    tokenService as unknown as TelegramTokenService,
  );

  return { service, dbMock, tokenService, configService };
}

describe('TelegramService', () => {
  describe('constructor', () => {
    it('creates bot when token is configured', () => {
      const { service } = createMocks();
      expect(service.getBot()).not.toBeNull();
      expect(service.isServiceConfigured()).toBe(true);
    });

    it('does not create bot when token is missing', () => {
      const { service } = createMocks({ TELEGRAM_BOT_TOKEN: '' });
      expect(service.getBot()).toBeNull();
      expect(service.isServiceConfigured()).toBe(false);
    });
  });

  describe('start / stop', () => {
    it('starts in webhook mode for non-development', async () => {
      const { service } = createMocks({ NODE_ENV: 'production' });
      await service.start(); // should not throw
    });

    it('stops gracefully', async () => {
      const { service } = createMocks();
      await service.stop();
    });

    it('stops gracefully when bot is null', async () => {
      const { service } = createMocks({ TELEGRAM_BOT_TOKEN: '' });
      await service.stop();
    });
  });

  describe('sendDriftAlert', () => {
    it('sends drift alert when chat_id is found', async () => {
      const { service, dbMock } = createMocks();
      const srQb = dbMock.serviceRole.queryBuilder;

      // getTelegramChatId query
      srQb.single.mockResolvedValue({
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

      const bot = service.getBot()!;
      expect(bot.telegram.sendMessage).toHaveBeenCalledWith(
        '12345',
        expect.stringContaining('Portfolio Drift Alert'),
        expect.any(Object),
      );
    });

    it('does nothing when bot is not configured', async () => {
      const { service } = createMocks({ TELEGRAM_BOT_TOKEN: '' });

      await service.sendDriftAlert('user-1', {
        drift_percentage: 10,
        wallet_address: '0x1234567890abcdef1234567890abcdef12345678',
        recommendations: [],
      });

      // No error thrown
    });

    it('does nothing when no chat_id found', async () => {
      const { service, dbMock } = createMocks();
      dbMock.serviceRole.queryBuilder.single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116' },
      });

      await service.sendDriftAlert('user-1', {
        drift_percentage: 10,
        wallet_address: '0x1234567890abcdef1234567890abcdef12345678',
        recommendations: [],
      });
    });
  });

  describe('sendDailySuggestion', () => {
    it('sends daily suggestion message without inline button for no-action payloads', async () => {
      const { service, dbMock } = createMocks();
      dbMock.serviceRole.queryBuilder.single.mockResolvedValue({
        data: { config: { chat_id: '12345' } },
        error: null,
      });

      await service.sendDailySuggestion('user-1', {
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
          market: { sentiment: 50 },
          signal: { regime: 'neutral', details: null },
          portfolio: { total_value: 10000, asset_allocation: { btc: 0.5 } },
          target: { allocation: { btc: 0.5 }, asset_allocation: { btc: 0.5 } },
          strategy: {
            stance: 'hold',
            reason_code: 'already_aligned',
            details: null,
          },
        },
      });

      const bot = service.getBot()!;
      expect(bot.telegram.sendMessage).toHaveBeenCalledWith(
        '12345',
        expect.stringContaining('Portfolio: $10,000'),
        expect.not.objectContaining({
          reply_markup: expect.anything(),
        }),
      );
    });

    it('adds a Done button and debt-aware totals for action-required payloads', async () => {
      const { service, dbMock } = createMocks();
      dbMock.serviceRole.queryBuilder.single.mockResolvedValue({
        data: { config: { chat_id: '12345' } },
        error: null,
      });

      await service.sendDailySuggestion('user-1', {
        as_of: '2025-01-01',
        config_id: 'eth_btc_rotation_default',
        config_display_name: 'Test Config',
        strategy_id: 'eth_btc_rotation',
        action: {
          status: 'action_required',
          required: true,
          kind: 'rebalance',
          reason_code: 'eth_btc_ratio_rebalance',
          transfers: [
            {
              from_bucket: 'btc',
              to_bucket: 'eth',
              amount_usd: 750,
            },
          ],
        },
        context: {
          market: { sentiment: 72 },
          signal: { regime: 'greed', details: null },
          portfolio: {
            total_value: 10000,
            total_assets_usd: 10000,
            total_debt_usd: 2000,
            total_net_usd: 8000,
            asset_allocation: { btc: 0.6, eth: 0.1, stable: 0.3 },
          },
          target: {
            allocation: { btc: 0.0, eth: 1.0, stable: 0.0 },
            asset_allocation: { btc: 0.0, eth: 1.0, stable: 0.0 },
          },
          strategy: {
            stance: 'hold',
            reason_code: 'eth_btc_ratio_rebalance',
            details: null,
          },
        },
      });

      const bot = service.getBot()!;
      expect(bot.telegram.sendMessage).toHaveBeenCalledWith(
        '12345',
        expect.stringContaining('Net: $8,000'),
        expect.objectContaining({
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: '☑️ Done',
                  callback_data:
                    'dsdone|eth_btc_rotation_default|eth_btc_rotation',
                },
              ],
            ],
          },
        }),
      );
      expect(bot.telegram.sendMessage).toHaveBeenCalledWith(
        '12345',
        expect.stringContaining('Assets: $10,000'),
        expect.any(Object),
      );
      expect(bot.telegram.sendMessage).toHaveBeenCalledWith(
        '12345',
        expect.stringContaining('Debt: $2,000'),
        expect.any(Object),
      );
    });
  });

  describe('daily suggestion callbacks', () => {
    it('records trade history once and clears the inline keyboard', async () => {
      const { service, dbMock } = createMocks();

      // Mock findUserIdByChatId chain
      const notificationSettingsQb = createMockQueryBuilder();
      notificationSettingsQb.select.mockReturnThis();
      notificationSettingsQb.eq.mockReturnThis();
      notificationSettingsQb.maybeSingle.mockResolvedValue({
        data: { user_id: 'user-1' },
        error: null,
      });

      // Mock hasDailySuggestionTradeHistory chain
      const tradeHistoryQb = createMockQueryBuilder();
      tradeHistoryQb.select.mockReturnThis();
      tradeHistoryQb.eq.mockReturnThis();
      tradeHistoryQb.maybeSingle.mockResolvedValue({
        data: null,
        error: null,
      });

      // Mock INSERT
      const insertQb = createMockQueryBuilder();
      insertQb.insert.mockResolvedValue({ data: null, error: null });

      dbMock.serviceRole.client.from
        .mockReturnValueOnce(notificationSettingsQb)
        .mockReturnValueOnce(tradeHistoryQb)
        .mockReturnValueOnce(insertQb);

      // Mock hasDailySuggestionTradeHistory chain: from -> select -> eq -> maybeSingle
      // We need to re-mock or handle multiple calls
      dbMock.serviceRole.queryBuilder.select.mockReturnThis();
      dbMock.serviceRole.queryBuilder.eq.mockReturnThis();
      dbMock.serviceRole.queryBuilder.maybeSingle.mockResolvedValueOnce({
        data: null,
        error: null,
      });

      // Mock INSERT
      dbMock.serviceRole.queryBuilder.insert.mockResolvedValue({
        data: null,
        error: null,
      });

      const ctx = {
        chat: { id: 12345 },
        callbackQuery: {
          data: 'dsdone|eth_btc_rotation_default|eth_btc_rotation',
        },
        answerCbQuery: jest.fn().mockResolvedValue(undefined),
        editMessageReplyMarkup: jest.fn().mockResolvedValue(undefined),
      };

      await (service as any).handleDailySuggestionDoneCallback(
        ctx,
        'dsdone|eth_btc_rotation_default|eth_btc_rotation',
      );

      expect(ctx.answerCbQuery).toHaveBeenCalledWith(
        '✅ Rebalance recorded!\n\nThe bot will pause daily suggestions until the next rebalance interval.',
        true,
      );
      expect(ctx.editMessageReplyMarkup).toHaveBeenCalledWith({
        inline_keyboard: [],
      });
    });

    it('does not insert a duplicate same-day history row', async () => {
      const { service, dbMock } = createMocks();
      const queryBuilder = dbMock.serviceRole.queryBuilder;
      queryBuilder.maybeSingle.mockResolvedValueOnce({
        data: { user_id: 'user-1' },
        error: null,
      });
      queryBuilder.maybeSingle.mockResolvedValueOnce({
        data: { id: 1 },
        error: null,
      });

      const ctx = {
        chat: { id: 12345 },
        callbackQuery: {
          data: 'dsdone|eth_btc_rotation_default|eth_btc_rotation',
        },
        answerCbQuery: jest.fn().mockResolvedValue(undefined),
        editMessageReplyMarkup: jest.fn().mockResolvedValue(undefined),
      };

      await (service as any).handleDailySuggestionDoneCallback(
        ctx,
        'dsdone|eth_btc_rotation_default|eth_btc_rotation',
      );

      expect(queryBuilder.insert).not.toHaveBeenCalled();
      expect(ctx.answerCbQuery).toHaveBeenCalledWith(
        '⚠️ Already recorded for today.',
        true,
      );
    });

    it('fails safely for malformed callback data', async () => {
      const { service, dbMock } = createMocks();
      const ctx = {
        chat: { id: 12345 },
        callbackQuery: { data: 'dsdone|broken' },
        answerCbQuery: jest.fn().mockResolvedValue(undefined),
        editMessageReplyMarkup: jest.fn().mockResolvedValue(undefined),
      };

      await (service as any).handleDailySuggestionDoneCallback(
        ctx,
        'dsdone|broken',
      );

      expect(dbMock.serviceRole.queryBuilder.insert).not.toHaveBeenCalled();
      expect(ctx.answerCbQuery).toHaveBeenCalledWith(
        'Unable to record this action.',
        false,
      );
    });

    it('fails safely when chat is not linked to a Telegram user', async () => {
      const { service, dbMock } = createMocks();
      dbMock.serviceRole.queryBuilder.maybeSingle.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116' },
      });

      const ctx = {
        chat: { id: 12345 },
        callbackQuery: {
          data: 'dsdone|eth_btc_rotation_default|eth_btc_rotation',
        },
        answerCbQuery: jest.fn().mockResolvedValue(undefined),
        editMessageReplyMarkup: jest.fn().mockResolvedValue(undefined),
      };

      await (service as any).handleDailySuggestionDoneCallback(
        ctx,
        'dsdone|eth_btc_rotation_default|eth_btc_rotation',
      );

      expect(dbMock.serviceRole.queryBuilder.insert).not.toHaveBeenCalled();
      expect(ctx.answerCbQuery).toHaveBeenCalledWith(
        'Telegram is not linked to a user.',
        false,
      );
    });
  });

  describe('getTelegramConnectedUserIds', () => {
    it('returns user IDs of connected users', async () => {
      const { service, dbMock } = createMocks();
      dbMock.serviceRole.queryBuilder.mockResolvedThen({
        data: [{ user_id: 'u-1' }, { user_id: 'u-2' }],
        error: null,
      });

      const result = await service.getTelegramConnectedUserIds();
      expect(result).toEqual(['u-1', 'u-2']);
    });

    it('returns empty array on failure', async () => {
      const { service, dbMock } = createMocks();
      dbMock.serviceRole.queryBuilder.mockResolvedThen({
        data: null,
        error: null,
      });

      const result = await service.getTelegramConnectedUserIds();
      expect(result).toEqual([]);
    });
  });

  describe('validateWebhookSecret', () => {
    it('returns true when secret matches', () => {
      const { service } = createMocks();
      expect(service.validateWebhookSecret('test-webhook-secret')).toBe(true);
    });

    it('returns false when secret does not match', () => {
      const { service } = createMocks();
      expect(service.validateWebhookSecret('wrong')).toBe(false);
    });

    it('returns false when no secret configured', () => {
      const { service } = createMocks({ TELEGRAM_WEBHOOK_SECRET: '' });
      expect(service.validateWebhookSecret('any')).toBe(false);
    });
  });

  describe('getBotName', () => {
    it('returns configured bot name', () => {
      const { service } = createMocks();
      expect(service.getBotName()).toBe('test_bot');
    });
  });

  describe('logWebhookError', () => {
    it('logs the error without throwing', () => {
      const { service } = createMocks();
      expect(() =>
        service.logWebhookError(new Error('webhook boom')),
      ).not.toThrow();
    });
  });

  describe('start() in development mode (polling)', () => {
    it('calls bot.launch() when NODE_ENV is development', async () => {
      const { service } = createMocks({ NODE_ENV: 'development' });
      const bot = getLatestBotMock();
      await service.start();
      expect(bot.launch).toHaveBeenCalled();
    });

    it('logs error when bot.launch() fails', async () => {
      const { service } = createMocks({ NODE_ENV: 'development' });
      const bot = getLatestBotMock();
      bot.launch.mockRejectedValueOnce(new Error('launch failed'));
      // should not throw
      await expect(service.start()).resolves.toBeUndefined();
    });
  });

  describe('handleStartCommand (via bot.start callback)', () => {
    function makeCtx(
      overrides: {
        startPayload?: string;
        chatId?: number;
        username?: string;
      } = {},
    ) {
      return {
        startPayload: overrides.startPayload ?? 'valid-token',
        chat: { id: overrides.chatId ?? 12345 },
        from: { username: overrides.username ?? 'testuser' },
        reply: jest.fn().mockResolvedValue(undefined),
      };
    }

    it('replies with invalid link message when no token provided', async () => {
      createMocks();
      const startCallback = getStartCallback();
      const ctx = makeCtx({ startPayload: '' });

      await startCallback(ctx);

      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Invalid connection link'),
      );
    });

    it('replies with expired message when token validation returns null', async () => {
      const { tokenService } = createMocks();
      const startCallback = getStartCallback();
      tokenService.validateToken.mockResolvedValueOnce(null);
      const ctx = makeCtx();

      await startCallback(ctx);

      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('expired or invalid'),
      );
    });

    it('replies with error message when no chat ID is available', async () => {
      const { tokenService } = createMocks();
      const startCallback = getStartCallback();
      tokenService.validateToken.mockResolvedValueOnce('user-1');
      const ctx = {
        ...makeCtx(),
        chat: null,
        reply: jest.fn().mockResolvedValue(undefined),
      };

      await startCallback(ctx);

      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Connection failed'),
      );
    });

    it('replies with error when upsert fails', async () => {
      const { dbMock, tokenService } = createMocks();
      const startCallback = getStartCallback();
      tokenService.validateToken.mockResolvedValueOnce('user-1');
      dbMock.serviceRole.queryBuilder.mockResolvedThen({
        data: null,
        error: { message: 'DB error' },
      });
      const ctx = makeCtx();

      await startCallback(ctx);

      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Connection failed'),
      );
    });

    it('sends success reply and invalidates token on successful connection', async () => {
      const { dbMock, tokenService } = createMocks();
      const startCallback = getStartCallback();
      tokenService.validateToken.mockResolvedValueOnce('user-1');
      dbMock.serviceRole.queryBuilder.mockResolvedThen({
        data: {},
        error: null,
      });
      const ctx = makeCtx();

      await startCallback(ctx);

      expect(tokenService.invalidateToken).toHaveBeenCalledWith('valid-token');
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Successfully connected'),
        expect.any(Object),
      );
    });
  });

  describe('handleStopCommand (via bot.command("stop") callback)', () => {
    it('replies with no connection message when chat_id not found', async () => {
      const { dbMock } = createMocks();
      const stopCallback = getStopCallback();
      dbMock.serviceRole.queryBuilder.maybeSingle.mockResolvedValueOnce({
        data: null,
        error: null,
      });
      const ctx = {
        chat: { id: 9999 },
        reply: jest.fn().mockResolvedValue(undefined),
      };

      await stopCallback(ctx);

      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('No active connection'),
      );
    });

    it('replies with error message when deletion fails', async () => {
      const { dbMock } = createMocks();
      const stopCallback = getStopCallback();
      dbMock.serviceRole.queryBuilder.maybeSingle.mockResolvedValueOnce({
        data: { user_id: 'user-1' },
        error: null,
      });
      dbMock.serviceRole.queryBuilder.mockResolvedThen({
        data: null,
        error: { message: 'delete failed' },
      });
      const ctx = {
        chat: { id: 9999 },
        reply: jest.fn().mockResolvedValue(undefined),
      };

      await stopCallback(ctx);

      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Failed to disconnect'),
      );
    });

    it('replies with disconnected message on success', async () => {
      const { dbMock } = createMocks();
      const stopCallback = getStopCallback();
      dbMock.serviceRole.queryBuilder.maybeSingle.mockResolvedValueOnce({
        data: { user_id: 'user-1' },
        error: null,
      });
      dbMock.serviceRole.queryBuilder.mockResolvedThen({
        data: {},
        error: null,
      });
      const ctx = {
        chat: { id: 9999 },
        reply: jest.fn().mockResolvedValue(undefined),
      };

      await stopCallback(ctx);

      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Disconnected from Zap Pilot'),
        expect.any(Object),
      );
    });

    it('replies with error message when chat id is missing', async () => {
      createMocks();
      const stopCallback = getStopCallback();
      const ctx = { chat: null, reply: jest.fn().mockResolvedValue(undefined) };

      await stopCallback(ctx);

      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Unable to process'),
      );
    });
  });

  describe('sendDailySuggestion status variants', () => {
    function mockChatId(dbMock: ReturnType<typeof createMocks>['dbMock']) {
      dbMock.serviceRole.queryBuilder.single.mockResolvedValue({
        data: { config: { chat_id: '12345' } },
        error: null,
      });
    }

    const baseData = {
      as_of: '2025-01-01',
      config_id: 'test',
      config_display_name: 'Test Config',
      strategy_id: 'strat-1',
      context: {
        market: { sentiment: null },
        signal: { regime: 'bull_market', details: null },
        portfolio: { total_value: 50000, asset_allocation: { btc: 0.6 } },
        target: { allocation: { btc: 0.6 }, asset_allocation: { btc: 0.6 } },
        strategy: {
          stance: 'hold',
          reason_code: 'above_greed_sell',
          details: null,
        },
      },
    };

    it('sends a "blocked" status message', async () => {
      const { service, dbMock } = createMocks();
      mockChatId(dbMock);
      await service.sendDailySuggestion('user-1', {
        ...baseData,
        action: {
          status: 'blocked',
          required: false,
          kind: null,
          reason_code: 'above_greed_sell',
          transfers: [],
        },
      });
      const bot = service.getBot()!;
      expect(bot.telegram.sendMessage).toHaveBeenCalledWith(
        '12345',
        expect.stringContaining('Action Blocked'),
        expect.any(Object),
      );
    });

    it('sends a rebalance message with transfers', async () => {
      const { service, dbMock } = createMocks();
      mockChatId(dbMock);
      await service.sendDailySuggestion('user-1', {
        ...baseData,
        action: {
          status: 'action_required',
          required: true,
          kind: 'rebalance',
          reason_code: 'eth_btc_ratio_rebalance',
          transfers: [
            { from_bucket: 'btc', to_bucket: 'eth', amount_usd: 1000 },
            { from_bucket: 'eth', to_bucket: 'usdc', amount_usd: 500 },
            { from_bucket: 'btc', to_bucket: 'sol', amount_usd: 250 },
            { from_bucket: 'sol', to_bucket: 'eth', amount_usd: 100 }, // 4th — triggers "+N more"
          ],
        },
      });
      const bot = service.getBot()!;
      expect(bot.telegram.sendMessage).toHaveBeenCalledWith(
        '12345',
        expect.stringContaining('Rebalance Needed'),
        expect.any(Object),
      );
    });

    it('uses humanizeReasonCode fallback for unknown reason codes', async () => {
      const { service, dbMock } = createMocks();
      mockChatId(dbMock);
      await service.sendDailySuggestion('user-1', {
        ...baseData,
        action: {
          status: 'no_action',
          required: false,
          kind: null,
          reason_code: 'some_unknown_code_xyz',
          transfers: [],
        },
      });
      const bot = service.getBot()!;
      expect(bot.telegram.sendMessage).toHaveBeenCalled();
    });
  });

  describe('bot.help callback', () => {
    it('replies with help text when /help is called', async () => {
      createMocks();
      const helpCallback = getHelpCallback();
      const ctx = { reply: jest.fn().mockResolvedValue(undefined) };

      await helpCallback(ctx);

      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Zap Pilot Telegram Bot'),
        expect.any(Object),
      );
    });
  });

  describe('handleCallbackQuery routing', () => {
    it('ignores non-daily-suggestion callback data', async () => {
      const { dbMock } = createMocks();
      const callbackHandler = getCallbackHandler();
      const ctx = {
        chat: { id: 12345 },
        callbackQuery: { data: 'some_other_callback' },
        answerCbQuery: jest.fn().mockResolvedValue(undefined),
        editMessageReplyMarkup: jest.fn().mockResolvedValue(undefined),
      };

      await callbackHandler(ctx);

      // Should not have interacted with the DB
      expect(dbMock.serviceRole.queryBuilder.single).not.toHaveBeenCalled();
    });

    it('routes daily suggestion done callback correctly', async () => {
      const { dbMock } = createMocks();
      const callbackHandler = getCallbackHandler();
      const srQb = dbMock.serviceRole.queryBuilder;

      dbMock.serviceRole.client.from.mockReturnValue(srQb);
      srQb.select.mockReturnThis();
      srQb.eq.mockReturnThis();
      srQb.maybeSingle.mockResolvedValueOnce({
        data: { user_id: 'user-1' },
        error: null,
      });
      srQb.maybeSingle.mockResolvedValueOnce({
        data: null,
        error: null,
      });
      srQb.mockResolvedThen({
        data: null,
        error: null,
      });

      const ctx = {
        chat: { id: 12345 },
        callbackQuery: {
          data: 'dsdone|eth_btc_rotation_default|eth_btc_rotation',
        },
        answerCbQuery: jest.fn().mockResolvedValue(undefined),
        editMessageReplyMarkup: jest.fn().mockResolvedValue(undefined),
      };

      await callbackHandler(ctx);

      expect(ctx.answerCbQuery).toHaveBeenCalledWith(
        '✅ Rebalance recorded!\n\nThe bot will pause daily suggestions until the next rebalance interval.',
        true,
      );
    });
  });

  describe('handleDailySuggestionDoneCallback edge cases', () => {
    it('answers callback when chatId is null', async () => {
      const { service } = createMocks();
      const ctx = {
        chat: null, // no chat -> chatId is null
        callbackQuery: { data: 'dsdone|cfg|strat' },
        answerCbQuery: jest.fn().mockResolvedValue(undefined),
        editMessageReplyMarkup: jest.fn().mockResolvedValue(undefined),
      };

      await (service as any).handleDailySuggestionDoneCallback(
        ctx,
        'dsdone|cfg|strat',
      );

      expect(ctx.answerCbQuery).toHaveBeenCalledWith(
        'Unable to resolve Telegram chat.',
        false,
      );
    });

    it('answers callback when DB returns error for trade history check', async () => {
      const { service, dbMock } = createMocks();
      dbMock.serviceRole.queryBuilder.maybeSingle.mockResolvedValueOnce({
        data: { user_id: 'user-1' },
        error: null,
      });
      // hasDailySuggestionTradeHistory returns null (error during maybeSingle)
      dbMock.serviceRole.queryBuilder.maybeSingle.mockResolvedValueOnce({
        data: null,
        error: { message: 'query failed' },
      });

      const ctx = {
        chat: { id: 12345 },
        callbackQuery: { data: 'dsdone|cfg|strat' },
        answerCbQuery: jest.fn().mockResolvedValue(undefined),
        editMessageReplyMarkup: jest.fn().mockResolvedValue(undefined),
      };

      await (service as any).handleDailySuggestionDoneCallback(
        ctx,
        'dsdone|cfg|strat',
      );

      expect(ctx.answerCbQuery).toHaveBeenCalledWith(
        'Unable to record this action.',
        false,
      );
    });

    it('answers callback when INSERT fails', async () => {
      const { service, dbMock } = createMocks();
      dbMock.serviceRole.queryBuilder.maybeSingle.mockResolvedValueOnce({
        data: { user_id: 'user-1' },
        error: null,
      });
      dbMock.serviceRole.queryBuilder.maybeSingle.mockResolvedValueOnce({
        data: null,
        error: null,
      });
      // INSERT returns error
      dbMock.serviceRole.queryBuilder.mockResolvedThen({
        data: null,
        error: { message: 'insert failed' },
      });

      const ctx = {
        chat: { id: 12345 },
        callbackQuery: { data: 'dsdone|cfg|strat' },
        answerCbQuery: jest.fn().mockResolvedValue(undefined),
        editMessageReplyMarkup: jest.fn().mockResolvedValue(undefined),
      };

      await (service as any).handleDailySuggestionDoneCallback(
        ctx,
        'dsdone|cfg|strat',
      );

      expect(ctx.answerCbQuery).toHaveBeenCalledWith(
        'Unable to record this action.',
        false,
      );
    });

    it('answers callback without clearCallbackButtons when answerCbQuery missing', async () => {
      const { service, dbMock } = createMocks();
      dbMock.serviceRole.queryBuilder.maybeSingle.mockResolvedValueOnce({
        data: { user_id: 'user-1' },
        error: null,
      });
      dbMock.serviceRole.queryBuilder.maybeSingle.mockResolvedValueOnce({
        data: { id: 1 },
        error: null,
      });

      // ctx without answerCbQuery function
      const ctx = {
        chat: { id: 12345 },
        callbackQuery: { data: 'dsdone|cfg|strat' },
        // no answerCbQuery
        editMessageReplyMarkup: jest.fn().mockResolvedValue(undefined),
      };

      await expect(
        (service as any).handleDailySuggestionDoneCallback(
          ctx,
          'dsdone|cfg|strat',
        ),
      ).resolves.toBeUndefined();
    });

    it('handles editMessageReplyMarkup missing gracefully', async () => {
      const { service, dbMock } = createMocks();
      dbMock.serviceRole.queryBuilder.maybeSingle.mockResolvedValueOnce({
        data: { user_id: 'user-1' },
        error: null,
      });
      dbMock.serviceRole.queryBuilder.maybeSingle.mockResolvedValueOnce({
        data: null,
        error: null,
      });
      dbMock.serviceRole.queryBuilder.mockResolvedThen({
        data: null,
        error: null,
      });

      // ctx without editMessageReplyMarkup
      const ctx = {
        chat: { id: 12345 },
        callbackQuery: { data: 'dsdone|cfg|strat' },
        answerCbQuery: jest.fn().mockResolvedValue(undefined),
        // no editMessageReplyMarkup
      };

      await expect(
        (service as any).handleDailySuggestionDoneCallback(
          ctx,
          'dsdone|cfg|strat',
        ),
      ).resolves.toBeUndefined();
    });

    it('handles editMessageReplyMarkup throwing an error', async () => {
      const { service, dbMock } = createMocks();
      dbMock.serviceRole.queryBuilder.maybeSingle.mockResolvedValueOnce({
        data: { user_id: 'user-1' },
        error: null,
      });
      dbMock.serviceRole.queryBuilder.maybeSingle.mockResolvedValueOnce({
        data: null,
        error: null,
      });
      dbMock.serviceRole.queryBuilder.mockResolvedThen({
        data: null,
        error: null,
      });

      const ctx = {
        chat: { id: 12345 },
        callbackQuery: { data: 'dsdone|cfg|strat' },
        answerCbQuery: jest.fn().mockResolvedValue(undefined),
        editMessageReplyMarkup: jest
          .fn()
          .mockRejectedValue(new Error('message gone')),
      };

      await expect(
        (service as any).handleDailySuggestionDoneCallback(
          ctx,
          'dsdone|cfg|strat',
        ),
      ).resolves.toBeUndefined();
    });

    it('returns null from getCallbackData when callbackQuery.data is not a string', () => {
      const { service } = createMocks();
      const ctx = {
        callbackQuery: { data: 12345 }, // number, not string
      };
      const result = (service as any).getCallbackData(ctx);
      expect(result).toBeNull();
    });
  });

  describe('sendDailySuggestion when bot is not configured', () => {
    it('returns early when bot is null', async () => {
      // Create service without bot token → no bot
      const { service } = createMocks({ TELEGRAM_BOT_TOKEN: '' });
      const bot = service.getBot();
      expect(bot).toBeNull();

      // Should not throw
      await expect(
        service.sendDailySuggestion('user-1', {} as any),
      ).resolves.toBeUndefined();
    });
  });

  describe('isBotBlockedError', () => {
    it('returns false for non-object errors', () => {
      const { service: svc } = createMocks();
      const result = (svc as any).isBotBlockedError('string error');
      expect(result).toBe(false);
    });

    it('returns false for null', () => {
      const { service: svc } = createMocks();
      const result = (svc as any).isBotBlockedError(null);
      expect(result).toBe(false);
    });
  });

  describe('sendDriftAlert error handling', () => {
    it('throws when sendMessage fails with a non-blocked error', async () => {
      const { service, dbMock } = createMocks();
      dbMock.serviceRole.queryBuilder.single.mockResolvedValue({
        data: { config: { chat_id: '12345' } },
        error: null,
      });
      const nonBlockedError = new Error('Network timeout');
      getLatestBotMock().telegram.sendMessage.mockRejectedValueOnce(
        nonBlockedError,
      );

      await expect(
        service.sendDriftAlert('user-1', {
          drift_percentage: 5,
          wallet_address: '0x1234567890abcdef1234567890abcdef12345678',
          recommendations: [],
        }),
      ).rejects.toThrow('Network timeout');
    });

    it('disables notifications when bot is blocked by user (error_code 403)', async () => {
      const { service, dbMock } = createMocks();
      dbMock.serviceRole.queryBuilder.single.mockResolvedValue({
        data: { config: { chat_id: '12345' } },
        error: null,
      });
      const blockedError = { response: { error_code: 403 } };
      getLatestBotMock().telegram.sendMessage.mockRejectedValueOnce(
        blockedError,
      );
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

      // disableTelegramNotifications should have been called (update query)
      expect(dbMock.serviceRole.client.from).toHaveBeenCalledWith(
        'notification_settings',
      );
    });
  });
});
