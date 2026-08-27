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
    expect(bot.help).toHaveBeenCalledOnce();
    const startOrder = bot.start.mock.invocationCallOrder[0]!;
    const commandOrder = bot.command.mock.invocationCallOrder[0]!;
    const helpOrder = bot.help.mock.invocationCallOrder[0]!;
    expect(startOrder).toBeLessThan(commandOrder);
    expect(commandOrder).toBeLessThan(helpOrder);
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

  it('delegates the strategy-change broadcast through the facade', async () => {
    const { service, dbMock } = createMocks();
    dbMock.supabase.queryBuilder.mockResolvedThen({
      data: [{ user_id: 'u-1' }],
      error: null,
    });
    dbMock.supabase.queryBuilder.single.mockResolvedValue({
      data: { config: { chat_id: '12345' } },
      error: null,
    });

    const result = await service.broadcastToConnectedUsers(
      'strategy moved',
      'strategy change',
    );

    expect(result.sent).toBe(1);
    expect(getLatestBotMock().telegram.sendMessage).toHaveBeenCalledWith(
      '12345',
      'strategy moved',
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
});
