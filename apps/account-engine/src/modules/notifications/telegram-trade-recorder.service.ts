import { Context } from 'telegraf';

import { Logger } from '../../common/logger';
import { DatabaseService } from '../../database/database.service';
import { TelegramConnectionService } from './telegram-connection.service';
import {
  DAILY_SUGGESTION_DONE_PREFIX,
  parseDailySuggestionDoneCallbackData,
  TelegramMessagePayload,
} from './telegram-message.util';

interface StrategyTradeHistoryRow {
  id: number;
}

interface TelegramCallbackQueryData {
  data?: unknown;
}

type AnswerCallbackQueryFn = (
  value: string,
  showAlert?: boolean,
) => Promise<unknown>;

type EditMessageReplyMarkupFn = (
  markup: TelegramMessagePayload['replyMarkup'],
) => Promise<unknown>;

export class TelegramTradeRecorderService {
  private readonly logger = new Logger(TelegramTradeRecorderService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly connectionService: TelegramConnectionService,
  ) {}

  async handleDailySuggestionDoneCallback(
    ctx: Context,
    callbackData = this.getCallbackData(ctx),
  ): Promise<void> {
    if (!callbackData?.startsWith(`${DAILY_SUGGESTION_DONE_PREFIX}|`)) {
      return;
    }

    const parsed = parseDailySuggestionDoneCallbackData(callbackData);
    if (!parsed) {
      await this.answerCallbackQuery(ctx, 'Unable to record this action.');
      return;
    }

    const chatId = this.resolveCallbackChatId(ctx);
    if (!chatId) {
      await this.answerCallbackQuery(ctx, 'Unable to resolve Telegram chat.');
      return;
    }

    const userId = await this.connectionService.findUserIdByChatId(chatId);
    if (!userId) {
      await this.answerCallbackQuery(ctx, 'Telegram is not linked to a user.');
      return;
    }

    const tradeDate = new Date().toISOString().slice(0, 10);
    const alreadyRecorded = await this.hasDailySuggestionTradeHistory({
      userId,
      tradeDate,
      strategyId: parsed.strategyId,
      configId: parsed.configId,
    });
    if (alreadyRecorded === null) {
      await this.answerCallbackQuery(ctx, 'Unable to record this action.');
      return;
    }

    if (!alreadyRecorded) {
      const insertResult = await this.databaseService
        .getServiceRoleClient()
        .from('strategy_trade_history' as never)
        .insert({
          user_id: userId,
          trade_date: tradeDate,
          strategy_id: parsed.strategyId,
          config_id: parsed.configId,
        } as never);

      if (insertResult.error) {
        this.logger.error(
          `Failed to record strategy trade history for user ${userId}:`,
          insertResult.error,
        );
        await this.answerCallbackQuery(ctx, 'Unable to record this action.');
        return;
      }
    }

    await this.answerCallbackQuery(
      ctx,
      alreadyRecorded
        ? '⚠️ Already recorded for today.'
        : '✅ Rebalance recorded!\n\nThe bot will pause daily suggestions until the next rebalance interval.',
      true,
    );
    await this.clearCallbackButtons(ctx);
  }

  async hasDailySuggestionTradeHistory(params: {
    userId: string;
    tradeDate: string;
    strategyId: string;
    configId: string;
  }): Promise<boolean | null> {
    const { data, error } = await this.databaseService
      .getServiceRoleClient()
      .from('strategy_trade_history' as never)
      .select('id')
      .eq('user_id', params.userId)
      .eq('trade_date', params.tradeDate)
      .eq('strategy_id', params.strategyId)
      .eq('config_id', params.configId)
      .maybeSingle<StrategyTradeHistoryRow>();

    if (error) {
      this.logger.error(
        `Failed to query strategy trade history for user ${params.userId}:`,
        error,
      );
      return null;
    }

    return data !== null;
  }

  getCallbackData(ctx: Context): string | null {
    const callbackQuery = (ctx as unknown as { callbackQuery: unknown })
      .callbackQuery;
    if (!callbackQuery || typeof callbackQuery !== 'object') {
      return null;
    }

    const data = (callbackQuery as TelegramCallbackQueryData).data;
    return typeof data === 'string' ? data : null;
  }

  resolveCallbackChatId(ctx: Context): string | null {
    const chatId = ctx.chat?.id;
    return chatId === undefined ? null : chatId.toString();
  }

  getAnswerCallbackQuery(ctx: Context): AnswerCallbackQueryFn | null {
    const answerCbQuery = (
      ctx as unknown as { answerCbQuery: AnswerCallbackQueryFn }
    ).answerCbQuery;
    return typeof answerCbQuery === 'function' ? answerCbQuery : null;
  }

  async answerCallbackQuery(
    ctx: Context,
    text: string,
    showAlert = false,
  ): Promise<void> {
    const answerCbQuery = this.getAnswerCallbackQuery(ctx);
    if (answerCbQuery === null) {
      return;
    }

    await answerCbQuery(text, showAlert);
  }

  getEditMessageReplyMarkup(ctx: Context): EditMessageReplyMarkupFn | null {
    const editMessageReplyMarkup = (
      ctx as unknown as { editMessageReplyMarkup: EditMessageReplyMarkupFn }
    ).editMessageReplyMarkup;
    return typeof editMessageReplyMarkup === 'function'
      ? editMessageReplyMarkup
      : null;
  }

  async clearCallbackButtons(ctx: Context): Promise<void> {
    const editMessageReplyMarkup = this.getEditMessageReplyMarkup(ctx);
    if (editMessageReplyMarkup === null) {
      return;
    }

    try {
      await editMessageReplyMarkup({ inline_keyboard: [] });
    } catch (error) {
      this.logger.warn('Failed to clear Telegram callback buttons', error);
    }
  }
}
