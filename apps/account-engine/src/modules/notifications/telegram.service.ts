import { Context, Telegraf } from 'telegraf';

import { ConfigService } from '../../config/config.service';
import { DatabaseService } from '../../database/database.service';
import { DailySuggestionData, DriftAlertData } from './interfaces';
import {
  TELEGRAM_HELP_TEXT,
  TelegramBotCoreService,
} from './telegram-bot-core.service';
import { TelegramConnectionService } from './telegram-connection.service';
import { TelegramNotificationService } from './telegram-notification.service';
import { TelegramTokenService } from './telegram-token.service';
import { TelegramTradeRecorderService } from './telegram-trade-recorder.service';

export class TelegramService {
  private readonly botCore: TelegramBotCoreService;
  private readonly connection: TelegramConnectionService;
  private readonly notifications: TelegramNotificationService;
  private readonly tradeRecorder: TelegramTradeRecorderService;

  /* istanbul ignore next -- DI constructor */
  constructor(
    configService: ConfigService,
    databaseService: DatabaseService,
    tokenService: TelegramTokenService,
  ) {
    this.connection = new TelegramConnectionService(
      databaseService,
      tokenService,
    );
    this.botCore = new TelegramBotCoreService(configService);
    this.notifications = new TelegramNotificationService(
      databaseService,
      this.botCore,
    );
    this.tradeRecorder = new TelegramTradeRecorderService(
      databaseService,
      this.connection,
    );

    this.registerHandlers();
  }

  start(): void {
    this.botCore.start();
  }

  stop(): Promise<void> {
    return this.botCore.stop();
  }

  async sendDriftAlert(
    userId: string,
    driftData: DriftAlertData,
  ): Promise<void> {
    await this.notifications.sendDriftAlert(userId, driftData);
  }

  async sendDailySuggestion(
    userId: string,
    data: DailySuggestionData,
  ): Promise<void> {
    await this.notifications.sendDailySuggestion(userId, data);
  }

  async getTelegramConnectedUserIds(): Promise<string[]> {
    return this.notifications.getTelegramConnectedUserIds();
  }

  validateWebhookSecret(secret: string): boolean {
    return this.botCore.validateWebhookSecret(secret);
  }

  logWebhookError(error: unknown): void {
    this.botCore.logWebhookError(error);
  }

  getBot(): Telegraf | null {
    return this.botCore.getBot();
  }

  getBotName(): string {
    return this.botCore.getBotName();
  }

  isServiceConfigured(): boolean {
    return this.botCore.isServiceConfigured();
  }

  private registerHandlers(): void {
    this.botCore.onStart((ctx: Context) =>
      this.connection.handleStartCommand(ctx),
    );
    this.botCore.onCommand('stop', (ctx: Context) =>
      this.connection.handleStopCommand(ctx),
    );
    this.botCore.onCallbackQuery((ctx: Context) =>
      this.tradeRecorder.handleDailySuggestionDoneCallback(ctx),
    );
    this.botCore.onHelp(async (ctx: Context) => {
      await ctx.reply(TELEGRAM_HELP_TEXT, { parse_mode: 'Markdown' });
    });
  }
}
