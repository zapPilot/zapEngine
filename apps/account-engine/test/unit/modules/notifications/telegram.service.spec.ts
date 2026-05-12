import { Telegraf } from 'telegraf';
import type { Mock } from 'vitest';

import { DatabaseService } from '../../../../src/database/database.service';
import { TelegramService } from '../../../../src/modules/notifications/telegram.service';
import { TelegramTokenService } from '../../../../src/modules/notifications/telegram-token.service';
import {
  createMockConfigService,
  createMockDatabaseService,
} from '../../../test-utils';

vi.mock('telegraf', () => ({
  Telegraf: vi.fn().mockImplementation(function (this: unknown) {
    return {
      start: vi.fn(),
      command: vi.fn(),
      help: vi.fn(),
      on: vi.fn(),
      launch: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn(),
      handleUpdate: vi.fn().mockResolvedValue(undefined),
      telegram: {
        sendMessage: vi.fn().mockResolvedValue({}),
      },
    };
  }),
}));

interface MockBot {
  start: Mock;
  command: Mock;
  help: Mock;
  on: Mock;
  launch: Mock;
  stop: Mock;
  telegram: {
    sendMessage: Mock;
  };
}

function getMockTelegraf(): Mock {
  return vi.mocked(Telegraf) as unknown as Mock;
}

function getLatestBotMock(): MockBot {
  const mockTelegraf = getMockTelegraf();
  const latestResult =
    mockTelegraf.mock.results[mockTelegraf.mock.results.length - 1];
  return latestResult?.value;
}

function createMocks(env: Record<string, string> = {}) {
  const dbMock = createMockDatabaseService();
  const tokenService = {
    validateToken: vi.fn(),
    invalidateToken: vi.fn().mockResolvedValue(undefined),
  };

  const service = new TelegramService(
    createMockConfigService(env),
    dbMock.mock as unknown as DatabaseService,
    tokenService as unknown as TelegramTokenService,
  );

  return { service, dbMock, tokenService };
}

describe('TelegramService facade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a bot and exposes configuration through the facade', () => {
    const { service } = createMocks();

    expect(service.getBot()).not.toBeNull();
    expect(service.isServiceConfigured()).toBe(true);
    expect(service.getBotName()).toBe('test_bot');
  });

  it('does not create a bot when token is missing', () => {
    const { service } = createMocks({ TELEGRAM_BOT_TOKEN: '' });

    expect(service.getBot()).toBeNull();
    expect(service.isServiceConfigured()).toBe(false);
  });

  it('registers handlers in the legacy setupCommands order', () => {
    createMocks();
    const bot = getLatestBotMock();

    expect(bot.start).toHaveBeenCalledOnce();
    expect(bot.command).toHaveBeenCalledWith('stop', expect.any(Function));
    expect(bot.on).toHaveBeenCalledWith('callback_query', expect.any(Function));
    expect(bot.help).toHaveBeenCalledOnce();
    const startOrder = bot.start.mock.invocationCallOrder[0]!;
    const commandOrder = bot.command.mock.invocationCallOrder[0]!;
    const callbackOrder = bot.on.mock.invocationCallOrder[0]!;
    const helpOrder = bot.help.mock.invocationCallOrder[0]!;
    expect(startOrder).toBeLessThan(commandOrder);
    expect(commandOrder).toBeLessThan(callbackOrder);
    expect(callbackOrder).toBeLessThan(helpOrder);
  });

  it('wires start and stop lifecycle methods', async () => {
    const { service } = createMocks({ NODE_ENV: 'development' });
    const bot = getLatestBotMock();

    service.start();
    await service.stop();

    expect(bot.launch).toHaveBeenCalled();
  });

  it('delegates webhook helpers', () => {
    const { service } = createMocks();

    expect(service.validateWebhookSecret('test-webhook-secret')).toBe(true);
    expect(service.validateWebhookSecret('wrong')).toBe(false);
    expect(() => service.logWebhookError(new Error('boom'))).not.toThrow();
  });

  it('delegates getTelegramConnectedUserIds', async () => {
    const { service, dbMock } = createMocks();
    dbMock.serviceRole.queryBuilder.mockResolvedThen({
      data: [{ user_id: 'u-1' }, { user_id: 'u-2' }],
      error: null,
    });

    await expect(service.getTelegramConnectedUserIds()).resolves.toEqual([
      'u-1',
      'u-2',
    ]);
  });

  it('delegates notification sending through the facade', async () => {
    const { service, dbMock } = createMocks();
    dbMock.serviceRole.queryBuilder.single.mockResolvedValue({
      data: { config: { chat_id: '12345' } },
      error: null,
    });

    await service.sendDriftAlert('user-1', {
      drift_percentage: 15.5,
      wallet_address: '0x1234567890abcdef1234567890abcdef12345678',
      recommendations: [],
    });

    expect(getLatestBotMock().telegram.sendMessage).toHaveBeenCalledWith(
      '12345',
      expect.stringContaining('Portfolio Drift Alert'),
      expect.any(Object),
    );
  });

  it('wires /help through bot core', async () => {
    createMocks();
    const helpCallback = getLatestBotMock().help.mock.calls[0]?.[0];
    const ctx = { reply: vi.fn().mockResolvedValue(undefined) };

    await helpCallback(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Zap Pilot Telegram Bot'),
      { parse_mode: 'Markdown' },
    );
  });

  it('wires daily-suggestion callback handling through bot core', async () => {
    const { dbMock } = createMocks();
    const callbackHandler = getLatestBotMock().on.mock.calls[0]?.[1];
    const srQb = dbMock.serviceRole.queryBuilder;
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
        data: 'dsdone|dma_fgi_portfolio_rules_default|dma_fgi_portfolio_rules',
      },
      answerCbQuery: vi.fn().mockResolvedValue(undefined),
      editMessageReplyMarkup: vi.fn().mockResolvedValue(undefined),
    };

    await callbackHandler(ctx);

    expect(ctx.answerCbQuery).toHaveBeenCalledWith(
      '✅ Rebalance recorded!\n\nThe bot will pause daily suggestions until the next rebalance interval.',
      true,
    );
  });
});
