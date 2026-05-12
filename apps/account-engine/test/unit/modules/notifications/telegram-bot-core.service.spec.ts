import { Telegraf } from 'telegraf';
import type { Mock } from 'vitest';

import { TelegramBotCoreService } from '../../../../src/modules/notifications/telegram-bot-core.service';
import { createMockConfigService } from '../../../test-utils';

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

function createService(env: Record<string, string> = {}) {
  return new TelegramBotCoreService(createMockConfigService(env));
}

describe('TelegramBotCoreService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a Telegraf bot when token is configured', () => {
    const service = createService();

    expect(service.getBot()).not.toBeNull();
    expect(service.isServiceConfigured()).toBe(true);
    expect(getMockTelegraf()).toHaveBeenCalledWith('test-bot-token');
  });

  it('does not create a bot when token is missing', () => {
    const service = createService({ TELEGRAM_BOT_TOKEN: '' });

    expect(service.getBot()).toBeNull();
    expect(service.isServiceConfigured()).toBe(false);
    expect(getMockTelegraf()).not.toHaveBeenCalled();
  });

  it('registers command handlers on the bot', () => {
    const service = createService();
    const startHandler = vi.fn();
    const stopHandler = vi.fn();
    const callbackHandler = vi.fn();
    const helpHandler = vi.fn();

    service.onStart(startHandler);
    service.onCommand('stop', stopHandler);
    service.onCallbackQuery(callbackHandler);
    service.onHelp(helpHandler);

    const bot = getLatestBotMock();
    expect(bot.start).toHaveBeenCalledWith(startHandler);
    expect(bot.command).toHaveBeenCalledWith('stop', stopHandler);
    expect(bot.on).toHaveBeenCalledWith('callback_query', callbackHandler);
    expect(bot.help).toHaveBeenCalledWith(helpHandler);
  });

  it('starts polling in development mode', () => {
    const service = createService({ NODE_ENV: 'development' });
    const bot = getLatestBotMock();

    service.start();

    expect(bot.launch).toHaveBeenCalled();
  });

  it('does not start polling in webhook mode', () => {
    const service = createService({ NODE_ENV: 'production' });
    const bot = getLatestBotMock();

    service.start();

    expect(bot.launch).not.toHaveBeenCalled();
  });

  it('stops polling after startPolling has launched the bot', async () => {
    const service = createService({ NODE_ENV: 'development' });
    const bot = getLatestBotMock();

    await service.startPolling();
    await service.stop();

    expect(bot.stop).toHaveBeenCalledWith('shutdown');
  });

  it('catches polling launch errors', async () => {
    const service = createService({ NODE_ENV: 'development' });
    const bot = getLatestBotMock();
    bot.launch.mockRejectedValueOnce(new Error('launch failed'));

    await expect(service.startPolling()).resolves.toBeUndefined();
  });

  it('validates webhook secrets', () => {
    const service = createService();

    expect(service.validateWebhookSecret('test-webhook-secret')).toBe(true);
    expect(service.validateWebhookSecret('wrong')).toBe(false);
  });

  it('returns false when webhook secret is not configured', () => {
    const service = createService({ TELEGRAM_WEBHOOK_SECRET: '' });

    expect(service.validateWebhookSecret('any')).toBe(false);
  });

  it('exposes bot name and logs webhook errors without throwing', () => {
    const service = createService();

    expect(service.getBotName()).toBe('test_bot');
    expect(() => service.logWebhookError(new Error('boom'))).not.toThrow();
  });
});
