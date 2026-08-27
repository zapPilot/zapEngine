import { Context } from 'telegraf';

import { Logger } from '../../common/logger';
import { DatabaseService } from '../../database/database.service';
import {
  DAILY_SUGGESTION_DONE_PREFIX,
  parseDailySuggestionDoneCallbackData,
  type TelegramMessagePayload,
} from './daily-suggestion-message.util';
import { TelegramConnectionService } from './telegram-connection.service';

interface StrategyTradeHistoryRow {
  id: number;
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
    if (!callbackData?.startsWith(`${DAILY_SUGGESTION_DONE_PREFIX}|`)) return;
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
    const params = { userId, tradeDate, ...parsed };
    const alreadyRecorded = await this.hasDailySuggestionTradeHistory(params);
    if (alreadyRecorded === null) {
      await this.answerCallbackQuery(ctx, 'Unable to record this action.');
      return;
    }
    if (!alreadyRecorded) {
      const result = await this.databaseService
        .getClient()
        .from('strategy_trade_history' as never)
        .insert({
          user_id: userId,
          trade_date: tradeDate,
          strategy_id: parsed.strategyId,
          config_id: parsed.configId,
        } as never);
      if (result.error) {
        this.logger.error(
          `Failed to record strategy trade history for user ${userId}:`,
          result.error,
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
      .getClient()
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
    const query = (ctx as unknown as { callbackQuery?: { data?: unknown } })
      .callbackQuery;
    return typeof query?.data === 'string' ? query.data : null;
  }

  resolveCallbackChatId(ctx: Context): string | null {
    return ctx.chat?.id === undefined ? null : ctx.chat.id.toString();
  }

  async answerCallbackQuery(
    ctx: Context,
    text: string,
    showAlert = false,
  ): Promise<void> {
    const answer = (ctx as unknown as { answerCbQuery?: AnswerCallbackQueryFn })
      .answerCbQuery;
    if (typeof answer === 'function') await answer(text, showAlert);
  }

  async clearCallbackButtons(ctx: Context): Promise<void> {
    const edit = (
      ctx as unknown as { editMessageReplyMarkup?: EditMessageReplyMarkupFn }
    ).editMessageReplyMarkup;
    if (typeof edit !== 'function') return;
    try {
      await edit({ inline_keyboard: [] });
    } catch (error) {
      this.logger.warn('Failed to clear Telegram callback buttons', error);
    }
  }
}
