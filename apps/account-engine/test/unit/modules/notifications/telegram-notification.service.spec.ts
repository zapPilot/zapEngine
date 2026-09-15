import type { Mock } from 'vitest';

import { DatabaseService } from '../../../../src/database/database.service';
import { DailySuggestionSubsetSchema } from '../../../../src/modules/notifications/analytics-client/daily-suggestion.schema';
import { TelegramBotCoreService } from '../../../../src/modules/notifications/telegram-bot-core.service';
import { TelegramNotificationService } from '../../../../src/modules/notifications/telegram-notification.service';
import { createMockDatabaseService } from '../../../test-utils';

interface MockBot {
  telegram: {
    sendMessage: Mock;
  };
}

function createMockBot(): MockBot {
  return {
    telegram: {
      sendMessage: vi.fn().mockResolvedValue({}),
    },
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

/** The connected-user list is awaited directly; chat ids go through .single(). */
function connectedUsers(
  dbMock: ReturnType<typeof createMockDatabaseService>,
  userIds: string[],
) {
  dbMock.supabase.queryBuilder.mockResolvedThen({
    data: userIds.map((user_id) => ({ user_id })),
    error: null,
  });
}

function chatIdFor(chatId: string | null) {
  return chatId === null
    ? { data: null, error: { code: 'PGRST116' } }
    : { data: { config: { chat_id: chatId } }, error: null };
}

describe('TelegramNotificationService', () => {
  describe('broadcastToConnectedUsers', () => {
    it('sends the same message to every connected user', async () => {
      const { service, dbMock, bot } = createNotificationMocks();
      connectedUsers(dbMock, ['u-1', 'u-2']);
      dbMock.supabase.queryBuilder.single
        .mockResolvedValueOnce(chatIdFor('111'))
        .mockResolvedValueOnce(chatIdFor('222'));

      const result = await service.broadcastToConnectedUsers(
        'strategy moved',
        'strategy change',
      );

      expect(result).toEqual({
        recipients: 2,
        sent: 2,
        skippedNoChatId: 0,
        skippedBlocked: 0,
        failedUserIds: [],
      });
      expect(bot?.telegram.sendMessage).toHaveBeenCalledTimes(2);
      expect(bot?.telegram.sendMessage).toHaveBeenNthCalledWith(
        1,
        '111',
        'strategy moved',
        expect.objectContaining({ parse_mode: 'Markdown' }),
      );
      expect(bot?.telegram.sendMessage).toHaveBeenNthCalledWith(
        2,
        '222',
        'strategy moved',
        expect.any(Object),
      );
    });

    it('skips a connected user with no chat id', async () => {
      const { service, dbMock, bot } = createNotificationMocks();
      connectedUsers(dbMock, ['u-1', 'u-2']);
      dbMock.supabase.queryBuilder.single
        .mockResolvedValueOnce(chatIdFor(null))
        .mockResolvedValueOnce(chatIdFor('222'));

      const result = await service.broadcastToConnectedUsers('msg', 'label');

      expect(result.sent).toBe(1);
      expect(result.skippedNoChatId).toBe(1);
      expect(result.failedUserIds).toEqual([]);
      expect(bot?.telegram.sendMessage).toHaveBeenCalledTimes(1);
    });

    it('counts a blocked user as unreachable and disables their notifications', async () => {
      const { service, dbMock, bot } = createNotificationMocks();
      connectedUsers(dbMock, ['u-1']);
      dbMock.supabase.queryBuilder.single.mockResolvedValue(chatIdFor('111'));
      bot?.telegram.sendMessage.mockRejectedValueOnce({
        response: { error_code: 403 },
      });

      const result = await service.broadcastToConnectedUsers('msg', 'label');

      expect(result.sent).toBe(0);
      expect(result.skippedBlocked).toBe(1);
      expect(result.failedUserIds).toEqual([]);
      expect(dbMock.supabase.queryBuilder.update).toHaveBeenCalledWith({
        is_enabled: false,
      });
    });

    it('records a transport failure without aborting the rest of the broadcast', async () => {
      const { service, dbMock, bot } = createNotificationMocks();
      connectedUsers(dbMock, ['u-1', 'u-2']);
      dbMock.supabase.queryBuilder.single.mockResolvedValue(chatIdFor('111'));
      bot?.telegram.sendMessage.mockRejectedValueOnce(
        new Error('Network timeout'),
      );

      const result = await service.broadcastToConnectedUsers('msg', 'label');

      expect(result.sent).toBe(1);
      expect(result.failedUserIds).toEqual(['u-1']);
      expect(bot?.telegram.sendMessage).toHaveBeenCalledTimes(2);
    });

    it('reports zero recipients without reading the database when the bot is unconfigured', async () => {
      const { service, dbMock } = createNotificationMocks(null);

      const result = await service.broadcastToConnectedUsers('msg', 'label');

      expect(result).toEqual({
        recipients: 0,
        sent: 0,
        skippedNoChatId: 0,
        skippedBlocked: 0,
        failedUserIds: [],
      });
      expect(dbMock.mock.getClient).not.toHaveBeenCalled();
    });
  });

  it('returns connected Telegram user ids', async () => {
    const { service, dbMock } = createNotificationMocks();
    connectedUsers(dbMock, ['u-1', 'u-2']);

    await expect(service.getTelegramConnectedUserIds()).resolves.toEqual([
      'u-1',
      'u-2',
    ]);
  });

  it('returns an empty array when connected-user lookup fails', async () => {
    const { service, dbMock } = createNotificationMocks();
    dbMock.supabase.queryBuilder.mockResolvedThen({
      data: null,
      error: null,
    });

    await expect(service.getTelegramConnectedUserIds()).resolves.toEqual([]);
  });

  it('reports undelivered rather than throwing when the bot is unconfigured', async () => {
    const { service } = createNotificationMocks(null);

    await expect(
      service.sendMessageToUser('user-1', '12345', 'msg'),
    ).resolves.toBe(false);
  });

  it('rethrows a non-blocked send failure', async () => {
    const { service, bot } = createNotificationMocks();
    bot?.telegram.sendMessage.mockRejectedValueOnce(
      new Error('Network timeout'),
    );

    await expect(
      service.sendMessageToUser('user-1', '12345', 'msg'),
    ).rejects.toThrow('Network timeout');
  });

  it('detects bot-blocked errors defensively', () => {
    const { service } = createNotificationMocks();

    expect(service.isBotBlockedError({ response: { error_code: 403 } })).toBe(
      true,
    );
    expect(service.isBotBlockedError('string error')).toBe(false);
    expect(service.isBotBlockedError(null)).toBe(false);
  });

  describe('sendDailySuggestion', () => {
    // Each test names the previously-uncovered branch it locks.
    // mutation: not run (offline sandbox — vitest could not be executed here).

    const suggestionData = DailySuggestionSubsetSchema.parse({
      as_of: '2026-08-22',
      config_id: 'operator_config',
      config_display_name: 'Operator Strategy',
      strategy_id: 'dma_strategy',
      action: {
        status: 'action_required',
        required: true,
        reason_code: 'eth_btc_ratio_rebalance',
        transfers: [
          { from_bucket: 'stable', to_bucket: 'eth', amount_usd: 100 },
        ],
      },
      context: {
        portfolio: { total_value: 1000, asset_allocation: { stable: 1 } },
        target: { allocation: { eth: 1 } },
        signal: { regime: 'fear', details: null },
        market: null,
        strategy: { details: null },
      },
    });

    it('warns and returns without touching the database when the bot is unconfigured', async () => {
      // Locks: `if (!this.botCore.getBot())` true in sendDailySuggestion.
      const { service, dbMock, bot } = createNotificationMocks(null);

      await service.sendDailySuggestion('u-1', suggestionData);

      expect(dbMock.mock.getClient).not.toHaveBeenCalled();
      expect(bot).toBeNull();
    });

    it('returns without sending when the user has no Telegram chat id', async () => {
      // Locks: `if (!chatId) return` true.
      const { service, dbMock, bot } = createNotificationMocks();
      dbMock.supabase.queryBuilder.single.mockResolvedValue(chatIdFor(null));

      await service.sendDailySuggestion('u-1', suggestionData);

      expect(bot?.telegram.sendMessage).not.toHaveBeenCalled();
    });

    it('returns without sending when the stored config has no chat_id', async () => {
      // Locks: `settings.config.chat_id ?? null` fallback in getTelegramChatId.
      const { service, dbMock, bot } = createNotificationMocks();
      dbMock.supabase.queryBuilder.single.mockResolvedValue({
        data: { config: {} },
        error: null,
      });

      await service.sendDailySuggestion('u-1', suggestionData);

      expect(bot?.telegram.sendMessage).not.toHaveBeenCalled();
    });

    it('delivers the decision packet with the Done reply markup', async () => {
      // Locks: bot-configured false path, chatId-present false path, and the
      // `replyMarkup ? { reply_markup } : {}` spread true in sendMessageToUser.
      const { service, dbMock, bot } = createNotificationMocks();
      dbMock.supabase.queryBuilder.single.mockResolvedValue(chatIdFor('12345'));

      await service.sendDailySuggestion('u-1', suggestionData);

      expect(bot?.telegram.sendMessage).toHaveBeenCalledTimes(1);
      expect(bot?.telegram.sendMessage).toHaveBeenCalledWith(
        '12345',
        expect.stringContaining('Rebalance Needed'),
        expect.objectContaining({
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: '☑️ Done',
                  callback_data: 'dsdone|operator_config|dma_strategy',
                },
              ],
            ],
          },
        }),
      );
    });
  });
});
