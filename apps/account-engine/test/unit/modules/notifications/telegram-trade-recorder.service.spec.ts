import { Context } from 'telegraf';

import { DatabaseService } from '../../../../src/database/database.service';
import { TelegramConnectionService } from '../../../../src/modules/notifications/telegram-connection.service';
import { TelegramTradeRecorderService } from '../../../../src/modules/notifications/telegram-trade-recorder.service';
import { createMockDatabaseService } from '../../../test-utils';

function createRecorderMocks() {
  const dbMock = createMockDatabaseService();
  const connectionService = {
    findUserIdByChatId: vi.fn(),
  };
  const service = new TelegramTradeRecorderService(
    dbMock.mock as unknown as DatabaseService,
    connectionService as unknown as TelegramConnectionService,
  );

  return { service, dbMock, connectionService };
}

function makeCallbackCtx(
  overrides: {
    data?: unknown;
    chatId?: number | null;
    answerCbQuery?: ReturnType<typeof vi.fn>;
    editMessageReplyMarkup?: ReturnType<typeof vi.fn>;
  } = {},
) {
  const ctx: Record<string, unknown> = {
    callbackQuery: {
      data:
        overrides.data ??
        'dsdone|dma_fgi_portfolio_rules_default|dma_fgi_portfolio_rules',
    },
  };

  ctx['chat'] =
    overrides.chatId !== null ? { id: overrides.chatId ?? 12345 } : null;

  ctx['answerCbQuery'] =
    overrides.answerCbQuery !== undefined
      ? overrides.answerCbQuery
      : vi.fn().mockResolvedValue(undefined);

  ctx['editMessageReplyMarkup'] =
    overrides.editMessageReplyMarkup !== undefined
      ? overrides.editMessageReplyMarkup
      : vi.fn().mockResolvedValue(undefined);

  return ctx as unknown as Context;
}

describe('TelegramTradeRecorderService', () => {
  it('ignores non-daily-suggestion callback data', async () => {
    const { service, dbMock, connectionService } = createRecorderMocks();
    const ctx = makeCallbackCtx({ data: 'some_other_callback' });

    await service.handleDailySuggestionDoneCallback(ctx);

    expect(connectionService.findUserIdByChatId).not.toHaveBeenCalled();
    expect(dbMock.serviceRole.queryBuilder.single).not.toHaveBeenCalled();
  });

  it('records trade history once and clears the inline keyboard', async () => {
    const { service, dbMock, connectionService } = createRecorderMocks();
    connectionService.findUserIdByChatId.mockResolvedValueOnce('user-1');
    dbMock.serviceRole.queryBuilder.maybeSingle.mockResolvedValueOnce({
      data: null,
      error: null,
    });
    dbMock.serviceRole.queryBuilder.mockResolvedThen({
      data: null,
      error: null,
    });
    const ctx = makeCallbackCtx();

    await service.handleDailySuggestionDoneCallback(ctx);

    expect(dbMock.serviceRole.queryBuilder.insert).toHaveBeenCalledWith({
      user_id: 'user-1',
      trade_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      strategy_id: 'dma_fgi_portfolio_rules',
      config_id: 'dma_fgi_portfolio_rules_default',
    });
    expect(ctx.answerCbQuery).toHaveBeenCalledWith(
      '✅ Rebalance recorded!\n\nThe bot will pause daily suggestions until the next rebalance interval.',
      true,
    );
    expect(ctx.editMessageReplyMarkup).toHaveBeenCalledWith({
      inline_keyboard: [],
    });
  });

  it('does not insert a duplicate same-day history row', async () => {
    const { service, dbMock, connectionService } = createRecorderMocks();
    connectionService.findUserIdByChatId.mockResolvedValueOnce('user-1');
    dbMock.serviceRole.queryBuilder.maybeSingle.mockResolvedValueOnce({
      data: { id: 1 },
      error: null,
    });
    const ctx = makeCallbackCtx();

    await service.handleDailySuggestionDoneCallback(ctx);

    expect(dbMock.serviceRole.queryBuilder.insert).not.toHaveBeenCalled();
    expect(ctx.answerCbQuery).toHaveBeenCalledWith(
      '⚠️ Already recorded for today.',
      true,
    );
  });

  it('fails safely for malformed callback data', async () => {
    const { service, dbMock } = createRecorderMocks();
    const ctx = makeCallbackCtx({ data: 'dsdone|broken' });

    await service.handleDailySuggestionDoneCallback(ctx);

    expect(dbMock.serviceRole.queryBuilder.insert).not.toHaveBeenCalled();
    expect(ctx.answerCbQuery).toHaveBeenCalledWith(
      'Unable to record this action.',
      false,
    );
  });

  it('fails safely when chat is not linked to a Telegram user', async () => {
    const { service, dbMock, connectionService } = createRecorderMocks();
    connectionService.findUserIdByChatId.mockResolvedValueOnce(null);
    const ctx = makeCallbackCtx();

    await service.handleDailySuggestionDoneCallback(ctx);

    expect(dbMock.serviceRole.queryBuilder.insert).not.toHaveBeenCalled();
    expect(ctx.answerCbQuery).toHaveBeenCalledWith(
      'Telegram is not linked to a user.',
      false,
    );
  });

  it('answers callback when chatId is null', async () => {
    const { service } = createRecorderMocks();
    const ctx = makeCallbackCtx({ chatId: null, data: 'dsdone|cfg|strat' });

    await service.handleDailySuggestionDoneCallback(ctx);

    expect(ctx.answerCbQuery).toHaveBeenCalledWith(
      'Unable to resolve Telegram chat.',
      false,
    );
  });

  it('answers callback when DB returns error for trade history check', async () => {
    const { service, dbMock, connectionService } = createRecorderMocks();
    connectionService.findUserIdByChatId.mockResolvedValueOnce('user-1');
    dbMock.serviceRole.queryBuilder.maybeSingle.mockResolvedValueOnce({
      data: null,
      error: { message: 'query failed' },
    });
    const ctx = makeCallbackCtx({ data: 'dsdone|cfg|strat' });

    await service.handleDailySuggestionDoneCallback(ctx);

    expect(ctx.answerCbQuery).toHaveBeenCalledWith(
      'Unable to record this action.',
      false,
    );
  });

  it('answers callback when INSERT fails', async () => {
    const { service, dbMock, connectionService } = createRecorderMocks();
    connectionService.findUserIdByChatId.mockResolvedValueOnce('user-1');
    dbMock.serviceRole.queryBuilder.maybeSingle.mockResolvedValueOnce({
      data: null,
      error: null,
    });
    dbMock.serviceRole.queryBuilder.mockResolvedThen({
      data: null,
      error: { message: 'insert failed' },
    });
    const ctx = makeCallbackCtx({ data: 'dsdone|cfg|strat' });

    await service.handleDailySuggestionDoneCallback(ctx);

    expect(ctx.answerCbQuery).toHaveBeenCalledWith(
      'Unable to record this action.',
      false,
    );
  });

  it('handles answerCbQuery missing gracefully', async () => {
    const { service, dbMock, connectionService } = createRecorderMocks();
    connectionService.findUserIdByChatId.mockResolvedValueOnce('user-1');
    dbMock.serviceRole.queryBuilder.maybeSingle.mockResolvedValueOnce({
      data: { id: 1 },
      error: null,
    });
    const ctx = makeCallbackCtx({
      data: 'dsdone|cfg|strat',
      answerCbQuery: undefined,
    });
    Reflect.deleteProperty(ctx, 'answerCbQuery');

    await expect(
      service.handleDailySuggestionDoneCallback(ctx),
    ).resolves.toBeUndefined();
  });

  it('handles editMessageReplyMarkup missing gracefully', async () => {
    const { service, dbMock, connectionService } = createRecorderMocks();
    connectionService.findUserIdByChatId.mockResolvedValueOnce('user-1');
    dbMock.serviceRole.queryBuilder.maybeSingle.mockResolvedValueOnce({
      data: null,
      error: null,
    });
    dbMock.serviceRole.queryBuilder.mockResolvedThen({
      data: null,
      error: null,
    });
    const ctx = makeCallbackCtx({
      data: 'dsdone|cfg|strat',
      editMessageReplyMarkup: undefined,
    });
    Reflect.deleteProperty(ctx, 'editMessageReplyMarkup');

    await expect(
      service.handleDailySuggestionDoneCallback(ctx),
    ).resolves.toBeUndefined();
  });

  it('handles editMessageReplyMarkup throwing an error', async () => {
    const { service, dbMock, connectionService } = createRecorderMocks();
    connectionService.findUserIdByChatId.mockResolvedValueOnce('user-1');
    dbMock.serviceRole.queryBuilder.maybeSingle.mockResolvedValueOnce({
      data: null,
      error: null,
    });
    dbMock.serviceRole.queryBuilder.mockResolvedThen({
      data: null,
      error: null,
    });
    const ctx = makeCallbackCtx({
      data: 'dsdone|cfg|strat',
      editMessageReplyMarkup: vi.fn().mockRejectedValue(new Error('gone')),
    });

    await expect(
      service.handleDailySuggestionDoneCallback(ctx),
    ).resolves.toBeUndefined();
  });

  it('returns null from getCallbackData when callbackQuery.data is not a string', () => {
    const { service } = createRecorderMocks();
    const ctx = makeCallbackCtx({ data: 12345 });

    expect(service.getCallbackData(ctx)).toBeNull();
  });

  it('can answer and clear callback UI directly', async () => {
    const { service } = createRecorderMocks();
    const ctx = makeCallbackCtx();

    await service.answerCallbackQuery(ctx, 'ok', true);
    await service.clearCallbackButtons(ctx);

    expect(ctx.answerCbQuery).toHaveBeenCalledWith('ok', true);
    expect(ctx.editMessageReplyMarkup).toHaveBeenCalledWith({
      inline_keyboard: [],
    });
  });
});
