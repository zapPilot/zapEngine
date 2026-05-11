import { Context, Telegraf } from 'telegraf';

import { Logger } from '../../common/logger';
import { ConfigService } from '../../config/config.service';

export const TELEGRAM_HELP_TEXT =
  '📱 *Zap Pilot Telegram Bot*\n\n' +
  'Commands:\n' +
  '/start - Connect to Zap Pilot (use link from settings)\n' +
  '/stop - Disconnect notifications\n' +
  '/help - Show this message\n\n' +
  'For support, visit: https://zap-pilot.com/support';

type TelegramContextHandler = (ctx: Context) => void | Promise<void>;

export class TelegramBotCoreService {
  private readonly logger = new Logger(TelegramBotCoreService.name);
  private readonly webhookSecret: string;
  private readonly botName: string;
  private readonly isConfigured: boolean;
  private bot: Telegraf | null = null;
  private isPolling = false;

  constructor(private readonly configService: ConfigService) {
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
  }

  start(): void {
    if (!this.bot) return;

    const usePolling =
      this.configService.get<string>('NODE_ENV') === 'development';

    if (!usePolling) {
      this.logger.log('Telegram bot configured for webhook mode');
      return;
    }

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

  async startPolling(): Promise<void> {
    if (!this.bot) return;

    try {
      await this.bot.launch();
      this.isPolling = true;
      this.logger.log('Telegram bot started in polling mode');
    } catch (error) {
      this.logger.error('Failed to start Telegram bot:', error);
    }
  }

  onStart(handler: TelegramContextHandler): void {
    this.bot?.start(handler);
  }

  onCommand(command: string, handler: TelegramContextHandler): void {
    this.bot?.command(command, handler);
  }

  onCallbackQuery(handler: TelegramContextHandler): void {
    this.bot?.on('callback_query', handler);
  }

  onHelp(handler: TelegramContextHandler): void {
    this.bot?.help(handler);
  }

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

  getBot(): Telegraf | null {
    return this.bot;
  }

  getBotName(): string {
    return this.botName;
  }

  isServiceConfigured(): boolean {
    return this.isConfigured;
  }
}
