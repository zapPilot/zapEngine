import { Context } from 'telegraf';

import { CHANNEL_TYPE_TELEGRAM } from '../../common/constants';
import { BaseService } from '../../database/base.service';
import { DatabaseService } from '../../database/database.service';
import { TelegramTokenService } from './telegram-token.service';

interface TelegramStartContext {
  startPayload?: string;
}

export class TelegramConnectionService extends BaseService {
  constructor(
    databaseService: DatabaseService,
    private readonly tokenService: TelegramTokenService,
  ) {
    super(databaseService);
  }

  async handleStartCommand(ctx: Context): Promise<void> {
    const token = (ctx as Context & TelegramStartContext).startPayload;

    if (!token) {
      await ctx.reply(
        '⚠️ Invalid connection link.\n\n' +
          'Please request a new connection link from your Zap Pilot settings page.',
      );
      return;
    }

    const userId = await this.tokenService.validateToken(token);

    if (!userId) {
      await ctx.reply(
        '❌ Connection link expired or invalid.\n\n' +
          'Please request a new link from Zap Pilot. Links expire after 10 minutes.',
      );
      return;
    }

    const chatId = ctx.chat?.id.toString();
    if (!chatId) {
      this.logger.error('No chat ID available in context');
      await ctx.reply('❌ Connection failed. Please try again.');
      return;
    }

    const telegramUsername = ctx.from?.username;

    // Upsert isn't on the BaseService surface; raw call here is intentional.
    const { error: upsertError } = await this.serviceRoleSupabase
      .from('notification_settings')
      .upsert(
        {
          user_id: userId,
          channel_type: CHANNEL_TYPE_TELEGRAM,
          is_enabled: true,
          config: { chat_id: chatId },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,channel_type' },
      );

    if (upsertError) {
      this.logger.error(
        `Failed to store chat_id for user ${userId}:`,
        upsertError,
      );
      await ctx.reply(
        '❌ Connection failed. Please try again or contact support.',
      );
      return;
    }

    // username update and token invalidation are independent — run in parallel
    // so the user sees the success reply ~one round-trip sooner.
    await Promise.all([
      telegramUsername
        ? this.updateWhere(
            'users',
            { telegram_username: telegramUsername },
            { id: userId },
            { entityName: 'User', useServiceRole: true },
          )
        : Promise.resolve(),
      this.tokenService.invalidateToken(token),
    ]);

    this.logger.log(`User ${userId} connected Telegram (chat_id: ${chatId})`);

    await ctx.reply(
      '✅ *Successfully connected to Zap Pilot!*\n\n' +
        "You'll receive notifications when your portfolio drifts from target allocation.\n\n" +
        '*Commands:*\n' +
        '/stop - Disconnect notifications\n' +
        '/help - Get help',
      { parse_mode: 'Markdown' },
    );
  }

  async handleStopCommand(ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id.toString();
    if (!chatId) {
      await ctx.reply('❌ Unable to process request. Please try again.');
      return;
    }

    const userId = await this.findUserIdByChatId(chatId);

    if (!userId) {
      await ctx.reply(
        '⚠️ No active connection found.\n\n' +
          "You're not currently connected to Zap Pilot notifications.",
      );
      return;
    }

    try {
      await this.deleteWhere(
        'notification_settings',
        { user_id: userId, channel_type: CHANNEL_TYPE_TELEGRAM },
        { entityName: 'Telegram settings', useServiceRole: true },
      );
    } catch (error) {
      this.logger.error(`Failed to disconnect user ${userId}:`, error);
      await ctx.reply('❌ Failed to disconnect. Please try again.');
      return;
    }

    this.logger.log(`User ${userId} disconnected Telegram`);

    await ctx.reply(
      '👋 *Disconnected from Zap Pilot*\n\n' +
        "You won't receive any more notifications.\n" +
        'To reconnect, visit your Zap Pilot settings.',
      { parse_mode: 'Markdown' },
    );
  }

  async findUserIdByChatId(chatId: string): Promise<string | null> {
    // `config->>chat_id` is a Postgres JSON-path filter — not expressible via
    // the BaseService conditions shape. Raw client call is intentional. The
    // chain coincidentally matches the one in TelegramNotificationService
    // but the .maybeSingle() lookup vs list-fetch makes them distinct ops.
    // jscpd:ignore-start
    const { data } = await this.serviceRoleSupabase
      .from('notification_settings')
      .select('user_id')
      .eq('channel_type', CHANNEL_TYPE_TELEGRAM)
      .eq('is_enabled', true)
      .eq('config->>chat_id', chatId)
      .maybeSingle<{ user_id: string }>();
    // jscpd:ignore-end

    return data?.user_id ?? null;
  }
}
