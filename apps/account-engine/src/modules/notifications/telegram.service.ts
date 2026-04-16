import { CHANNEL_TYPE_TELEGRAM, REGIME_EMOJI } from '@common/constants';
import { Logger } from '@common/logger';
import { ConfigService } from '@config/config.service';
import { DatabaseService } from '@database/database.service';
import { Context, Telegraf } from 'telegraf';

import { DailySuggestionData, DriftAlertData } from './interfaces';
import { TelegramTokenService } from './telegram-token.service';

/**
 * Notification settings row from database
 */
interface NotificationSettings {
  user_id: string;
  channel_type: string;
  is_enabled: boolean;
  config: {
    chat_id?: string;
    rebalance_threshold?: number;
  };
  updated_at: string;
  created_at: string;
}

interface StrategyTradeHistoryRow {
  id: number;
}

interface TelegramMessagePayload {
  message: string;
  replyMarkup?: {
    inline_keyboard: { text: string; callback_data: string }[][];
  };
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

/**
 * Telegram Service for bot operations and notifications.
 *
 * Handles:
 * - Bot initialization and command registration
 * - /start <token> - Connect user's Telegram to Zap Pilot
 * - /stop - Disconnect user's Telegram notifications
 * - sendDriftAlert() - Send portfolio drift notifications
 * - Webhook validation for secure Telegram updates
 *
 * @example
 * ```typescript
 * // Send drift alert to user
 * await telegramService.sendDriftAlert('user-uuid', {
 *   drift_percentage: 15.5,
 *   wallet_address: '0x1234...',
 *   recommendations: [...]
 * });
 * ```
 */
export class TelegramService {
  private static readonly DAILY_SUGGESTION_DONE_PREFIX = 'dsdone';
  private static readonly REASON_LABELS: Record<string, string> = {
    above_greed_sell:
      'Greed remains elevated, so the strategy stays defensive.',
    already_aligned: 'Portfolio is already aligned with the current target.',
    below_extreme_fear_buy:
      'Extreme fear remains in place, so the strategy stays risk-on.',
    eth_btc_ratio_cooldown_active: 'ETH/BTC rotation cooldown is still active.',
    eth_btc_ratio_rebalance: 'ETH/BTC rotation is out of balance.',
    eth_outperforming_btc: 'ETH is still outperforming BTC.',
    interval_wait: 'Minimum rebalance interval has not elapsed yet.',
    trade_quota_min_interval_active: 'Trade quota cooldown is still active.',
  };

  private readonly logger = new Logger(TelegramService.name);
  private bot: Telegraf | null = null;
  private readonly webhookSecret: string;
  private readonly botName: string;
  private readonly isConfigured: boolean;
  private isPolling = false;

  /* istanbul ignore next -- DI constructor */
  constructor(
    private readonly configService: ConfigService,
    private readonly databaseService: DatabaseService,
    private readonly tokenService: TelegramTokenService,
  ) {
    const botToken = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    this.webhookSecret =
      this.configService.get<string>('TELEGRAM_WEBHOOK_SECRET') ?? '';
    this.botName =
      this.configService.get<string>('TELEGRAM_BOT_NAME') ?? 'ZapPilotBot';

    this.isConfigured = !!botToken;

    if (!botToken) {
      this.logger.warn(
        'TELEGRAM_BOT_TOKEN not configured. Telegram service will not work.',
      );
      return;
    }

    this.bot = new Telegraf(botToken);
    this.setupCommands();
  }

  async start(): Promise<void> {
    if (!this.bot) return;

    const usePolling =
      this.configService.get<string>('NODE_ENV') === 'development';

    if (!usePolling) {
      this.logger.log('Telegram bot configured for webhook mode');
      return;
    }

    // Start polling in background - don't block server startup
    void this.startPolling();
  }

  stop(): Promise<void> {
    if (!this.bot || !this.isPolling) {
      return Promise.resolve();
    }

    this.bot.stop('shutdown');
    this.isPolling = false;
    return Promise.resolve();
  }

  /**
   * Start bot in polling mode. Extracted to satisfy ESLint rules
   * (require-await, promise/prefer-await-to-then, promise/catch-or-return).
   */
  private async startPolling(): Promise<void> {
    try {
      await this.bot!.launch();
      this.isPolling = true;
      this.logger.log('Telegram bot started in polling mode');
    } catch (error) {
      this.logger.error('Failed to start Telegram bot:', error);
    }
  }

  /**
   * Setup bot commands
   */
  private setupCommands(): void {
    if (!this.bot) return;

    this.bot.start((ctx: Context) => this.handleStartCommand(ctx));
    this.bot.command('stop', (ctx: Context) => this.handleStopCommand(ctx));
    this.bot.on('callback_query', (ctx: Context) =>
      this.handleCallbackQuery(ctx),
    );

    // Handle /help
    this.bot.help(async (ctx) => {
      await ctx.reply(
        '📱 *Zap Pilot Telegram Bot*\n\n' +
          'Commands:\n' +
          '/start - Connect to Zap Pilot (use link from settings)\n' +
          '/stop - Disconnect notifications\n' +
          '/help - Show this message\n\n' +
          'For support, visit: https://zap-pilot.com/support',
        { parse_mode: 'Markdown' },
      );
    });

    this.logger.log('Telegram bot commands configured');
  }

  /**
   * Handle /start <token> command
   */
  private async handleStartCommand(ctx: Context): Promise<void> {
    // @ts-expect-error - startPayload is available on start context
    const token = ctx.startPayload as string | undefined;

    if (!token) {
      await ctx.reply(
        '⚠️ Invalid connection link.\n\n' +
          'Please request a new connection link from your Zap Pilot settings page.',
      );
      return;
    }

    // Validate token
    const userId = await this.tokenService.validateToken(token);

    if (!userId) {
      await ctx.reply(
        '❌ Connection link expired or invalid.\n\n' +
          'Please request a new link from Zap Pilot. Links expire after 10 minutes.',
      );
      return;
    }

    // Store chat_id in notification_settings
    const chatId = ctx.chat?.id.toString();
    if (!chatId) {
      this.logger.error('No chat ID available in context');
      await ctx.reply('❌ Connection failed. Please try again.');
      return;
    }

    const telegramUsername = ctx.from?.username;

    // Upsert notification settings
    const { error: upsertError } = await this.databaseService
      .getServiceRoleClient()
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

    // Optionally store telegram username for audit trail
    if (telegramUsername) {
      await this.databaseService
        .getServiceRoleClient()
        .from('users')
        .update({ telegram_username: telegramUsername })
        .eq('id', userId);
    }

    // Invalidate token (single-use)
    await this.tokenService.invalidateToken(token);

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

  /**
   * Handle /stop command - disconnect user's Telegram
   */
  private async handleStopCommand(ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id.toString();
    if (!chatId) {
      await ctx.reply('❌ Unable to process request. Please try again.');
      return;
    }

    // Find user by chat_id in notification_settings
    const userId = await this.findUserIdByChatId(chatId);

    if (!userId) {
      await ctx.reply(
        '⚠️ No active connection found.\n\n' +
          "You're not currently connected to Zap Pilot notifications.",
      );
      return;
    }

    // Delete the notification settings
    const { error: deleteError } = await this.databaseService
      .getServiceRoleClient()
      .from('notification_settings')
      .delete()
      .eq('user_id', userId)
      .eq('channel_type', CHANNEL_TYPE_TELEGRAM);

    if (deleteError) {
      this.logger.error(`Failed to disconnect user ${userId}:`, deleteError);
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

  private async handleCallbackQuery(ctx: Context): Promise<void> {
    const callbackData = this.getCallbackData(ctx);
    if (
      !callbackData?.startsWith(
        `${TelegramService.DAILY_SUGGESTION_DONE_PREFIX}|`,
      )
    ) {
      return;
    }

    await this.handleDailySuggestionDoneCallback(ctx, callbackData);
  }

  private async handleDailySuggestionDoneCallback(
    ctx: Context,
    callbackData: string,
  ): Promise<void> {
    const parsed = this.parseDailySuggestionDoneCallbackData(callbackData);
    if (!parsed) {
      await this.answerCallbackQuery(ctx, 'Unable to record this action.');
      return;
    }

    const chatId = this.resolveCallbackChatId(ctx);
    if (!chatId) {
      await this.answerCallbackQuery(ctx, 'Unable to resolve Telegram chat.');
      return;
    }

    const userId = await this.findUserIdByChatId(chatId);
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

  /**
   * Send drift alert notification to user.
   *
   * @param userId - User's UUID
   * @param driftData - Drift information and recommendations
   */
  async sendDriftAlert(
    userId: string,
    driftData: DriftAlertData,
  ): Promise<void> {
    await this.sendNotification(
      userId,
      () => this.formatDriftMessage(driftData),
      `drift alert (${driftData.drift_percentage.toFixed(1)}% drift)`,
    );
  }

  /**
   * Send daily suggestion notification to user.
   *
   * @param userId - User's UUID
   * @param data - Daily suggestion data from analytics engine
   */
  async sendDailySuggestion(
    userId: string,
    data: DailySuggestionData,
  ): Promise<void> {
    if (!this.bot) {
      this.logger.warn(
        'Telegram bot not configured, cannot send daily suggestion',
      );
      return;
    }
    const chatId = await this.getTelegramChatId(userId);
    if (!chatId) return;

    const payload = this.buildDailySuggestionMessagePayload(data);
    await this.sendMessageToUser(
      userId,
      chatId,
      payload.message,
      payload.replyMarkup,
    );
    this.logger.log(`Sent daily suggestion to user ${userId}`);
  }

  /**
   * Common notification send pattern: check bot, get chat ID, format, send, log.
   */
  private async sendNotification(
    userId: string,
    formatMessage: () => string,
    logLabel: string,
  ): Promise<void> {
    if (!this.bot) {
      this.logger.warn(`Telegram bot not configured, cannot send ${logLabel}`);
      return;
    }
    const chatId = await this.getTelegramChatId(userId);
    if (!chatId) return;
    await this.sendMessageToUser(userId, chatId, formatMessage());
    this.logger.log(`Sent ${logLabel} to user ${userId}`);
  }

  private getNotificationSettingsQuery() {
    return this.databaseService
      .getServiceRoleClient()
      .from('notification_settings')
      .select('user_id')
      .eq('channel_type', CHANNEL_TYPE_TELEGRAM)
      .eq('is_enabled', true);
  }

  /**
   * Retrieve all user IDs with an enabled Telegram notification channel.
   * Used for auto-discover mode in batch jobs.
   */
  async getTelegramConnectedUserIds(): Promise<string[]> {
    const { data } = await this.getNotificationSettingsQuery();

    if (!data) {
      this.logger.warn('Failed to fetch Telegram-connected users');
      return [];
    }

    return data.map(
      (row: Pick<NotificationSettings, 'user_id'>) => row.user_id,
    );
  }

  /**
   * Retrieve Telegram chat_id for a user from notification_settings.
   * Returns null if no enabled Telegram settings exist.
   */
  private async getTelegramChatId(userId: string): Promise<string | null> {
    const { data: settings } = await this.databaseService
      .getServiceRoleClient()
      .from('notification_settings')
      .select('config')
      .eq('user_id', userId)
      .eq('channel_type', CHANNEL_TYPE_TELEGRAM)
      .eq('is_enabled', true)
      .single<Pick<NotificationSettings, 'config'>>();

    if (!settings) {
      this.logger.warn(`No Telegram chat_id for user ${userId}`);
      return null;
    }

    return settings.config.chat_id ?? null;
  }

  /**
   * Send a Markdown message to a user's Telegram chat.
   * Handles bot-blocked errors by disabling notifications.
   */
  private async sendMessageToUser(
    userId: string,
    chatId: string,
    message: string,
    replyMarkup?: TelegramMessagePayload['replyMarkup'],
  ): Promise<void> {
    try {
      await this.bot!.telegram.sendMessage(chatId, message, {
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

  /**
   * Format daily suggestion message for Telegram.
   */
  private buildDailySuggestionMessagePayload(
    data: DailySuggestionData,
  ): TelegramMessagePayload {
    const message = this.formatDailySuggestionMessage(data);
    const callbackData = this.encodeDailySuggestionDoneCallbackData(
      data.config_id,
      data.strategy_id,
    );
    if (data.action.status !== 'action_required' || callbackData.length > 64) {
      return { message };
    }

    return {
      message,
      replyMarkup: {
        inline_keyboard: [[{ text: '☑️ Done', callback_data: callbackData }]],
      },
    };
  }

  private formatDailySuggestionMessage(data: DailySuggestionData): string {
    const regime = data.context.signal.regime;
    const regimeEmoji = REGIME_EMOJI[regime] ?? '⚪';
    const regimeLabel = this.formatIdentifierTitleCase(regime);
    const sentiment =
      data.context.market.sentiment !== null
        ? ` (FGI: ${data.context.market.sentiment})`
        : '';
    const contextLine = `${data.config_display_name} · ${regimeLabel}${sentiment}`;
    const portfolioSummary = this.formatDailySuggestionPortfolioSummary(data);
    const whyLine = this.humanizeReasonCode(data.action.reason_code);

    if (data.action.status === 'blocked') {
      return (
        `⛔ *Action Blocked*\n\n` +
        `${regimeEmoji} ${contextLine}\n` +
        `Why: ${whyLine}\n` +
        portfolioSummary
      );
    }

    if (data.action.status === 'no_action') {
      return (
        `✅ *No Action Needed*\n\n` +
        `${regimeEmoji} ${contextLine}\n` +
        `Why: ${whyLine}\n` +
        portfolioSummary
      );
    }

    let message =
      `🔁 *Rebalance Needed*\n\n` +
      `${regimeEmoji} ${contextLine}\n\n` +
      '*Do now:*\n';

    for (const transfer of data.action.transfers.slice(0, 3)) {
      message +=
        `• Move ${this.formatUsdAmount(transfer.amount_usd)} ` +
        `from ${this.formatIdentifierUppercase(transfer.from_bucket)} ` +
        `to ${this.formatIdentifierUppercase(transfer.to_bucket)}\n`;
    }

    if (data.action.transfers.length > 3) {
      message += `• +${data.action.transfers.length - 3} more\n`;
    }

    message += `\nWhy: ${whyLine}\n` + portfolioSummary;

    return message;
  }

  private formatIdentifierUppercase(value: string): string {
    return value.replaceAll(/[_-]+/g, ' ').toUpperCase();
  }

  private formatIdentifierTitleCase(value: string): string {
    return value
      .replaceAll(/[_-]+/g, ' ')
      .split(' ')
      .filter((part) => part.length > 0)
      .map((part) => part[0].toUpperCase() + part.slice(1).toLowerCase())
      .join(' ');
  }

  private humanizeReasonCode(reasonCode: string): string {
    const mappedLabel = TelegramService.REASON_LABELS[reasonCode];
    if (mappedLabel) {
      return mappedLabel;
    }

    const normalized = reasonCode
      .replaceAll(/[_-]+/g, ' ')
      .trim()
      .toLowerCase();
    if (!normalized) {
      return 'No additional context.';
    }

    return normalized[0].toUpperCase() + normalized.slice(1) + '.';
  }

  private formatDailySuggestionPortfolioSummary(
    data: DailySuggestionData,
  ): string {
    const totalDebt = data.context.portfolio.total_debt_usd ?? 0;
    if (totalDebt <= 0) {
      return `Portfolio: ${this.formatUsdAmount(data.context.portfolio.total_value)}`;
    }

    const totalAssets =
      data.context.portfolio.total_assets_usd ??
      data.context.portfolio.total_value;
    const totalNet =
      data.context.portfolio.total_net_usd ?? totalAssets - totalDebt;

    return (
      `Net: ${this.formatUsdAmount(totalNet)}\n` +
      `Assets: ${this.formatUsdAmount(totalAssets)}\n` +
      `Debt: ${this.formatUsdAmount(totalDebt)}`
    );
  }

  private encodeDailySuggestionDoneCallbackData(
    configId: string,
    strategyId: string,
  ): string {
    return [
      TelegramService.DAILY_SUGGESTION_DONE_PREFIX,
      configId,
      strategyId,
    ].join('|');
  }

  private parseDailySuggestionDoneCallbackData(
    callbackData: string,
  ): { configId: string; strategyId: string } | null {
    const [prefix, configId, strategyId, ...rest] = callbackData.split('|');
    if (
      prefix !== TelegramService.DAILY_SUGGESTION_DONE_PREFIX ||
      !configId ||
      !strategyId ||
      rest.length > 0
    ) {
      return null;
    }

    return { configId, strategyId };
  }

  private getCallbackData(ctx: Context): string | null {
    const callbackQuery = (ctx as unknown as { callbackQuery: unknown })
      .callbackQuery;
    if (!callbackQuery || typeof callbackQuery !== 'object') {
      return null;
    }

    const data = (callbackQuery as TelegramCallbackQueryData).data;
    return typeof data === 'string' ? data : null;
  }

  private resolveCallbackChatId(ctx: Context): string | null {
    const chatId = ctx.chat?.id;
    return chatId === undefined ? null : chatId.toString();
  }

  private async findUserIdByChatId(chatId: string): Promise<string | null> {
    const { data } = await this.getNotificationSettingsQuery()
      .eq('config->>chat_id', chatId)
      .maybeSingle<Pick<NotificationSettings, 'user_id'>>();

    return data?.user_id ?? null;
  }

  private async hasDailySuggestionTradeHistory(params: {
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

  private getAnswerCallbackQuery(ctx: Context): AnswerCallbackQueryFn | null {
    const answerCbQuery = (
      ctx as unknown as { answerCbQuery: AnswerCallbackQueryFn }
    ).answerCbQuery;
    return typeof answerCbQuery === 'function' ? answerCbQuery : null;
  }

  private async answerCallbackQuery(
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

  private getEditMessageReplyMarkup(
    ctx: Context,
  ): EditMessageReplyMarkupFn | null {
    const editMessageReplyMarkup = (
      ctx as unknown as { editMessageReplyMarkup: EditMessageReplyMarkupFn }
    ).editMessageReplyMarkup;
    return typeof editMessageReplyMarkup === 'function'
      ? editMessageReplyMarkup
      : null;
  }

  private async clearCallbackButtons(ctx: Context): Promise<void> {
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

  /**
   * Format drift alert message for Telegram.
   */
  private formatDriftMessage(data: DriftAlertData): string {
    const walletShort = `${data.wallet_address.slice(0, 8)}...${data.wallet_address.slice(-6)}`;
    const driftFormatted = data.drift_percentage.toFixed(1);

    let message =
      `⚠️ *Portfolio Drift Alert*\n\n` +
      `Your portfolio has drifted *${driftFormatted}%* from target allocation.\n\n` +
      `Wallet: \`${walletShort}\`\n\n`;

    // Add recommendations if available
    if (data.recommendations.length > 0) {
      message += '*Recommendations:*\n';

      for (const rec of data.recommendations.slice(0, 5)) {
        // Limit to 5
        const emoji = rec.action === 'buy' ? '🟢' : '🔴';
        const action = rec.action.charAt(0).toUpperCase() + rec.action.slice(1);
        message += `${emoji} ${action} $${rec.amount_usd.toFixed(0)} ${rec.token}\n`;
      }

      message += '\n';
    }

    message +=
      `Rebalancing recommended to maintain your investment strategy.\n\n` +
      `[Open Zap Pilot](https://zap-pilot.com/rebalance?wallet=${data.wallet_address})`;

    return message;
  }

  /**
   * Check if error is a "bot blocked by user" error.
   */
  private isBotBlockedError(error: unknown): boolean {
    if (typeof error === 'object' && error !== null) {
      const err = error as { response?: { error_code?: number } };
      return err.response?.error_code === 403;
    }
    return false;
  }

  private async disableTelegramNotifications(userId: string): Promise<void> {
    await this.databaseService
      .getServiceRoleClient()
      .from('notification_settings')
      .update({ is_enabled: false })
      .eq('user_id', userId)
      .eq('channel_type', CHANNEL_TYPE_TELEGRAM);
  }

  private formatUsdAmount(amount: number): string {
    return `$${amount.toLocaleString('en-US', {
      maximumFractionDigits: 0,
    })}`;
  }

  /**
   * Validate webhook request secret.
   *
   * @param secret - Secret token from X-Telegram-Bot-Api-Secret-Token header
   * @returns true if secret matches configured webhook secret
   */
  validateWebhookSecret(secret: string): boolean {
    if (!this.webhookSecret) {
      this.logger.warn('TELEGRAM_WEBHOOK_SECRET not configured');
      return false;
    }
    return secret === this.webhookSecret;
  }

  logWebhookError(error: unknown): void {
    this.logger.error('Error processing Telegram update:', error);
  }

  /**
   * Get the Telegraf bot instance for webhook handling.
   *
   * @returns Telegraf instance or null if not configured
   */
  getBot(): Telegraf | null {
    return this.bot;
  }

  /**
   * Get the bot name for deep link generation.
   */
  getBotName(): string {
    return this.botName;
  }

  /**
   * Check if Telegram service is properly configured.
   */
  isServiceConfigured(): boolean {
    return this.isConfigured;
  }
}
