import { CHANNEL_TYPE_TELEGRAM } from '../../common/constants';
import { Logger } from '../../common/logger';
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

export class TelegramNotificationService {
  private readonly logger = new Logger(TelegramNotificationService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly botCore: TelegramBotCoreService,
  ) {}

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
    if (!this.botCore.getBot()) {
      this.logger.warn(
        'Telegram bot not configured, cannot send daily suggestion',
      );
      return;
    }
    const chatId = await this.getTelegramChatId(userId);
    if (!chatId) return;

    const payload = buildDailySuggestionMessagePayload(data);
    await this.sendMessageToUser(
      userId,
      chatId,
      payload.message,
      payload.replyMarkup,
    );
    this.logger.log(`Sent daily suggestion to user ${userId}`);
  }

  async sendNotification(
    userId: string,
    formatMessage: () => string,
    logLabel: string,
  ): Promise<void> {
    if (!this.botCore.getBot()) {
      this.logger.warn(`Telegram bot not configured, cannot send ${logLabel}`);
      return;
    }
    const chatId = await this.getTelegramChatId(userId);
    if (!chatId) return;
    await this.sendMessageToUser(userId, chatId, formatMessage());
    this.logger.log(`Sent ${logLabel} to user ${userId}`);
  }

  async getTelegramConnectedUserIds(): Promise<string[]> {
    const { data } = await this.getNotificationSettingsQuery();

    if (!data) {
      this.logger.warn('Failed to fetch Telegram-connected users');
      return [];
    }

    return data.map(
      (row: Pick<TelegramNotificationSettings, 'user_id'>) => row.user_id,
    );
  }

  async getTelegramChatId(userId: string): Promise<string | null> {
    const { data: settings } = await this.databaseService
      .getServiceRoleClient()
      .from('notification_settings')
      .select('config')
      .eq('user_id', userId)
      .eq('channel_type', CHANNEL_TYPE_TELEGRAM)
      .eq('is_enabled', true)
      .single<Pick<TelegramNotificationSettings, 'config'>>();

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
    await this.databaseService
      .getServiceRoleClient()
      .from('notification_settings')
      .update({ is_enabled: false })
      .eq('user_id', userId)
      .eq('channel_type', CHANNEL_TYPE_TELEGRAM);
  }

  private getNotificationSettingsQuery() {
    return this.databaseService
      .getServiceRoleClient()
      .from('notification_settings')
      .select('user_id')
      .eq('channel_type', CHANNEL_TYPE_TELEGRAM)
      .eq('is_enabled', true);
  }
}
