import { CHANNEL_TYPE_TELEGRAM } from '../../common/constants';
import { BaseService } from '../../database/base.service';
import { DatabaseService } from '../../database/database.service';
import { TelegramBotCoreService } from './telegram-bot-core.service';

interface TelegramNotificationSettings {
  user_id: string;
  config: {
    chat_id?: string;
  };
}

/**
 * Outcome of one broadcast. The counts are split rather than summed because
 * they mean different things to the caller: a user with no chat id or one who
 * blocked the bot is unreachable and nothing can fix that by retrying, while a
 * `failedUserIds` entry is a transport error worth another attempt.
 */
export interface BroadcastResult {
  recipients: number;
  sent: number;
  skippedNoChatId: number;
  skippedBlocked: number;
  failedUserIds: string[];
}

export class TelegramNotificationService extends BaseService {
  /* istanbul ignore next -- DI constructor */
  constructor(
    databaseService: DatabaseService,
    private readonly botCore: TelegramBotCoreService,
  ) {
    super(databaseService);
  }

  /**
   * Send one message to every Telegram-connected user.
   *
   * Sequential on purpose: the recipient list is small and Telegram rate-limits
   * per bot, so a burst buys nothing and risks 429s.
   */
  async broadcastToConnectedUsers(
    message: string,
    logLabel: string,
  ): Promise<BroadcastResult> {
    // Fast-fail before the DB read when the bot isn't configured.
    if (!this.botCore.getBot()) {
      this.logger.warn(`Telegram bot not configured, cannot send ${logLabel}`);
      return {
        recipients: 0,
        sent: 0,
        skippedNoChatId: 0,
        skippedBlocked: 0,
        failedUserIds: [],
      };
    }

    const userIds = await this.getTelegramConnectedUserIds();
    const result: BroadcastResult = {
      recipients: userIds.length,
      sent: 0,
      skippedNoChatId: 0,
      skippedBlocked: 0,
      failedUserIds: [],
    };

    for (const userId of userIds) {
      const chatId = await this.getTelegramChatId(userId);
      if (!chatId) {
        result.skippedNoChatId += 1;
        continue;
      }

      try {
        const delivered = await this.sendMessageToUser(userId, chatId, message);
        if (delivered) {
          result.sent += 1;
        } else {
          result.skippedBlocked += 1;
        }
      } catch (error) {
        this.logger.error(
          `Failed to send ${logLabel} to user ${userId}:`,
          error,
        );
        result.failedUserIds.push(userId);
      }
    }

    this.logger.log(
      `Sent ${logLabel} to ${result.sent}/${result.recipients} Telegram users`,
    );

    return result;
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

  /** False when the user blocked the bot — handled, not an error to retry. */
  async sendMessageToUser(
    userId: string,
    chatId: string,
    message: string,
  ): Promise<boolean> {
    const bot = this.botCore.getBot();
    if (!bot) {
      this.logger.warn('Telegram bot not configured, cannot send message');
      return false;
    }

    try {
      await bot.telegram.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        link_preview_options: { is_disabled: true },
      });
      return true;
    } catch (error: unknown) {
      if (!this.isBotBlockedError(error)) {
        this.logger.error(`Failed to send message to user ${userId}:`, error);
        throw error;
      }

      this.logger.warn(`User ${userId} blocked bot - disabling notifications`);
      await this.disableTelegramNotifications(userId);
      return false;
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
