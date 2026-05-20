import { CHANNEL_TYPE_TELEGRAM } from '../../common/constants';
import { BaseService } from '../../database/base.service';
import { DatabaseService } from '../../database/database.service';
import { DailySuggestionData, DriftAlertData } from './interfaces';
import { TelegramBotCoreService } from './telegram-bot-core.service';
import {
  buildDailySuggestionMessagePayload,
  formatDriftMessage,
  TelegramMessagePayload,
} from './telegram-message.util';

interface TelegramNotificationSettings {
  user_id: string;
  config: {
    chat_id?: string;
  };
}

export class TelegramNotificationService extends BaseService {
  /* istanbul ignore next -- DI constructor */
  constructor(
    databaseService: DatabaseService,
    private readonly botCore: TelegramBotCoreService,
  ) {
    super(databaseService);
  }

  async sendDriftAlert(
    userId: string,
    driftData: DriftAlertData,
  ): Promise<void> {
    await this.sendNotification(
      userId,
      () => formatDriftMessage(driftData),
      `drift alert (${driftData.drift_percentage.toFixed(1)}% drift)`,
    );
  }

  async sendDailySuggestion(
    userId: string,
    data: DailySuggestionData,
  ): Promise<void> {
    const payload = buildDailySuggestionMessagePayload(data);
    await this.sendNotification(
      userId,
      () => payload.message,
      'daily suggestion',
      payload.replyMarkup,
    );
  }

  async sendNotification(
    userId: string,
    formatMessage: () => string,
    logLabel: string,
    replyMarkup?: TelegramMessagePayload['replyMarkup'],
  ): Promise<void> {
    // Fast-fail before the chat-id DB read when the bot isn't configured.
    if (!this.botCore.getBot()) {
      this.logger.warn(`Telegram bot not configured, cannot send ${logLabel}`);
      return;
    }
    const chatId = await this.getTelegramChatId(userId);
    if (!chatId) return;
    await this.sendMessageToUser(userId, chatId, formatMessage(), replyMarkup);
    this.logger.log(`Sent ${logLabel} to user ${userId}`);
  }

  async getTelegramConnectedUserIds(): Promise<string[]> {
    // The findMany surface doesn't accept useServiceRole — go raw here.
    // notification_settings is service-role only.
    const { data } = await this.serviceRoleSupabase
      .from('notification_settings')
      .select('user_id')
      .eq('channel_type', CHANNEL_TYPE_TELEGRAM)
      .eq('is_enabled', true);

    if (!data) {
      this.logger.warn('Failed to fetch Telegram-connected users');
      return [];
    }

    return data.map(
      (row: Pick<TelegramNotificationSettings, 'user_id'>) => row.user_id,
    );
  }

  async getTelegramChatId(userId: string): Promise<string | null> {
    const settings = await this.findOne<
      Pick<TelegramNotificationSettings, 'config'>
    >(
      'notification_settings',
      {
        user_id: userId,
        channel_type: CHANNEL_TYPE_TELEGRAM,
        is_enabled: true,
      },
      {
        select: 'config',
        entityName: 'Telegram settings',
        throwOnNotFound: false,
        useServiceRole: true,
      },
    );

    if (!settings) {
      this.logger.warn(`No Telegram chat_id for user ${userId}`);
      return null;
    }

    return settings.config.chat_id ?? null;
  }

  async sendMessageToUser(
    userId: string,
    chatId: string,
    message: string,
    replyMarkup?: TelegramMessagePayload['replyMarkup'],
  ): Promise<void> {
    const bot = this.botCore.getBot();
    if (!bot) {
      this.logger.warn('Telegram bot not configured, cannot send message');
      return;
    }

    try {
      await bot.telegram.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        link_preview_options: { is_disabled: true },
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      });
    } catch (error: unknown) {
      if (!this.isBotBlockedError(error)) {
        this.logger.error(`Failed to send message to user ${userId}:`, error);
        throw error;
      }

      this.logger.warn(`User ${userId} blocked bot - disabling notifications`);
      await this.disableTelegramNotifications(userId);
    }
  }

  isBotBlockedError(error: unknown): boolean {
    if (typeof error === 'object' && error !== null) {
      const err = error as { response?: { error_code?: number } };
      return err.response?.error_code === 403;
    }
    return false;
  }

  async disableTelegramNotifications(userId: string): Promise<void> {
    await this.updateWhere(
      'notification_settings',
      { is_enabled: false },
      { user_id: userId, channel_type: CHANNEL_TYPE_TELEGRAM },
      { entityName: 'Telegram settings', useServiceRole: true },
    );
  }
}
