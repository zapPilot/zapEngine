import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';

import { EMAIL_CONFIG } from '../../common/constants';
import { ServiceLayerException } from '../../common/exceptions';
import { HttpStatus } from '../../common/http';
import { Logger } from '../../common/logger';
import { getErrorMessage } from '../../common/utils';
import { ConfigService } from '../../config/config.service';

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  cid: string;
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
  metricsCount?: number;
}

export interface EmailSendResult {
  success: boolean;
  message: string;
  metadata?: {
    recipient: string;
    subject: string;
    chartGenerated?: boolean;
    metricsIncluded?: number;
  };
}

export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter | null = null;

  /* istanbul ignore next -- DI constructor */
  constructor(private configService: ConfigService) {
    this.createTransporter();
  }

  private createTransporter(): void {
    const emailUser = this.configService.get<string>('EMAIL_USER');
    const emailPassword = this.configService.get<string>('EMAIL_APP_PASSWORD');

    if (!emailUser || !emailPassword) {
      this.logger.warn(
        'Email credentials not configured. Email service will not work.',
      );
      return;
    }

    this.transporter = nodemailer.createTransport({
      host: EMAIL_CONFIG.SMTP_HOST,
      port: EMAIL_CONFIG.SMTP_PORT,
      secure: EMAIL_CONFIG.SMTP_SECURE,
      auth: {
        user: emailUser,
        pass: emailPassword,
      },
    });

    this.logger.log('Email transporter configured successfully');
  }

  async sendEmail(options: SendEmailOptions): Promise<EmailSendResult> {
    if (!this.transporter) {
      throw new ServiceLayerException(
        'Email transporter not configured. Check EMAIL_USER and EMAIL_APP_PASSWORD environment variables.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    try {
      const emailUser = this.configService.get<string>('EMAIL_USER');

      const emailContent = {
        from: `"Zap Pilot" <${emailUser}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
        attachments: options.attachments,
      };

      await this.transporter.sendMail(emailContent);

      this.logger.log(`Email sent successfully to ${options.to}`);

      return {
        success: true,
        message: 'Email sent successfully',
        metadata: {
          recipient: options.to,
          subject: options.subject,
          chartGenerated: !!options.attachments?.length,
          metricsIncluded: options.metricsCount,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to send email to ${options.to}:`, error);
      throw new ServiceLayerException(
        `Failed to send email: ${getErrorMessage(error)}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error instanceof Error ? error : undefined,
      );
    }
  }

  async validateEmailConfiguration(): Promise<{
    valid: boolean;
    message: string;
  }> {
    if (!this.transporter) {
      return {
        valid: false,
        message:
          'Email transporter not configured. Check EMAIL_USER and EMAIL_APP_PASSWORD environment variables.',
      };
    }

    try {
      await this.transporter.verify();
      return { valid: true, message: 'Email configuration is valid' };
    } catch (error) {
      const message = getErrorMessage(error);

      return {
        valid: false,
        message: `Email configuration error: ${message}`,
      };
    }
  }

  generateSubject(metrics: { weeklyPnLPercentage?: number }): string {
    const weeklyPnLPercentage = metrics.weeklyPnLPercentage;
    if (
      typeof weeklyPnLPercentage !== 'number' ||
      !Number.isFinite(weeklyPnLPercentage)
    ) {
      return '📊 Weekly Report | Zap Pilot';
    }

    const performance = weeklyPnLPercentage >= 0 ? '📈' : '📉';
    const signPrefix = weeklyPnLPercentage > 0 ? '+' : '';

    return `${performance} Weekly Report: ${signPrefix}${weeklyPnLPercentage.toFixed(1)}% | Zap Pilot`;
  }

  getTestRecipient(): string | undefined {
    return this.configService.get<string>('NOTIFICATIONS_TEST_RECIPIENT');
  }
}
