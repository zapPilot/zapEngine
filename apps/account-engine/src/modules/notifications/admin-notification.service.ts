import { ADMIN_NOTIFICATION_CONFIG } from '@common/constants';
import { Logger } from '@common/logger';
import { escapeHtml, getErrorMessage, truncateString } from '@common/utils';
import { ConfigService } from '@config/config.service';
import { Job } from '@modules/jobs/interfaces/job.interface';

import { EmailService } from './email.service';

/**
 * Service for sending admin notifications when background jobs fail permanently.
 *
 * Uses a fire-and-forget pattern: notifications never block job processing
 * and all errors are caught internally.
 */
export class AdminNotificationService {
  private readonly logger = new Logger(AdminNotificationService.name);
  private readonly adminEmails: string[];
  private readonly notificationsEnabled: boolean;

  /* istanbul ignore next -- DI constructor */
  constructor(
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
  ) {
    this.notificationsEnabled = this.getNotificationsEnabled();
    this.adminEmails = this.parseAdminEmails();
    this.validateConfiguration();
  }

  /**
   * Send job failure notification to all configured admin emails.
   * Fire-and-forget: catches all errors internally and never throws.
   *
   * @param job - The failed job to notify about
   */
  async notifyJobFailure(job: Job): Promise<void> {
    // Early exit if notifications disabled
    if (!this.notificationsEnabled) {
      return;
    }

    // Early exit if no admins configured
    if (this.adminEmails.length === 0) {
      this.logger.warn(
        'Admin notifications enabled but no EMAIL_USER configured',
      );
      return;
    }

    try {
      const emailHtml = this.generateFailureEmailHtml(job);
      const subject = `[ALERT] Job Failure: ${job.type} (${job.id})`;

      // Send to each admin email
      for (const adminEmail of this.adminEmails) {
        try {
          await this.emailService.sendEmail({
            to: adminEmail,
            subject,
            html: emailHtml,
          });

          this.logger.log(`Sent job failure notification to ${adminEmail}`);
        } catch (error) {
          // Log but continue to next admin
          this.logger.error(
            `Failed to send notification to ${adminEmail}`,
            getErrorMessage(error),
          );
        }
      }
    } /* istanbul ignore next -- defensive catch-all for unexpected errors outside inner loop */ catch (error) {
      // Catch-all: never let notification errors escape
      this.logger.error(
        'Unexpected error in admin notification',
        getErrorMessage(error),
      );
    }
  }

  /**
   * Email template styles for failure notification HTML
   */
  private readonly EMAIL_STYLES = {
    CONTAINER: 'max-width: 600px; margin: 0 auto; background-color: #ffffff;',
    HEADER:
      'background-color: #ff4444; color: white; padding: 24px; text-align: center;',
    SECTION: 'padding: 24px; background-color: #f9f9f9;',
    SECTION_ALT: 'padding: 24px; background-color: #ffffff;',
    SECTION_TITLE: 'margin: 0 0 16px 0; font-size: 18px; color: #333;',
    TABLE: 'width: 100%; border-collapse: collapse;',
    TABLE_LABEL:
      'padding: 8px 0; font-weight: bold; color: #555; width: 140px;',
    TABLE_VALUE: 'padding: 8px 0; color: #333;',
    TABLE_VALUE_BREAK: 'padding: 8px 0; color: #333; word-break: break-all;',
    ERROR_BOX:
      'background-color: #fff5f5; border-left: 4px solid #ff4444; padding: 16px; margin-bottom: 16px;',
    ERROR_TEXT:
      "margin: 0; font-family: 'Courier New', monospace; font-size: 13px; color: #c62828; white-space: pre-wrap; word-wrap: break-word;",
    METADATA_BOX:
      'background-color: #ffffff; border: 1px solid #e0e0e0; padding: 16px; border-radius: 4px;',
    METADATA_TEXT:
      "margin: 0; font-family: 'Courier New', monospace; font-size: 12px; color: #555; white-space: pre-wrap; word-wrap: break-word; overflow-x: auto;",
    FOOTER:
      'padding: 20px; background-color: #eeeeee; text-align: center; border-top: 1px solid #dddddd;',
  } as const;

  /**
   * Build email header HTML
   */
  private buildEmailHeader(): string {
    return `
    <div style="${this.EMAIL_STYLES.HEADER}">
      <h1 style="margin: 0; font-size: 24px; font-weight: bold;">
        ⚠️ Job Failed Permanently
      </h1>
    </div>`;
  }

  /**
   * Build job details section HTML
   */
  private buildJobDetailsSection(
    job: Job,
    userId: string | null,
    timestamp: string,
  ): string {
    return `
    <div style="${this.EMAIL_STYLES.SECTION}">
      <h2 style="${this.EMAIL_STYLES.SECTION_TITLE}">
        Job Details
      </h2>
      <table style="${this.EMAIL_STYLES.TABLE}">
        <tr>
          <td style="${this.EMAIL_STYLES.TABLE_LABEL}">Job ID:</td>
          <td style="${this.EMAIL_STYLES.TABLE_VALUE_BREAK}">${escapeHtml(job.id)}</td>
        </tr>
        <tr>
          <td style="${this.EMAIL_STYLES.TABLE_LABEL}">Job Type:</td>
          <td style="${this.EMAIL_STYLES.TABLE_VALUE}">${escapeHtml(job.type)}</td>
        </tr>
        <tr>
          <td style="${this.EMAIL_STYLES.TABLE_LABEL}">User ID:</td>
          <td style="${this.EMAIL_STYLES.TABLE_VALUE_BREAK}">${userId ? escapeHtml(userId) : 'N/A'}</td>
        </tr>
        <tr>
          <td style="${this.EMAIL_STYLES.TABLE_LABEL}">Failed At:</td>
          <td style="${this.EMAIL_STYLES.TABLE_VALUE}">${timestamp}</td>
        </tr>
        <tr>
          <td style="${this.EMAIL_STYLES.TABLE_LABEL}">Retry Count:</td>
          <td style="${this.EMAIL_STYLES.TABLE_VALUE}">${job.retryCount}/${job.maxRetries} attempts</td>
        </tr>
      </table>
    </div>`;
  }

  /**
   * Build error details section HTML
   */
  private buildErrorSection(errorMessage: string): string {
    return `
    <div style="${this.EMAIL_STYLES.SECTION_ALT}">
      <h2 style="${this.EMAIL_STYLES.SECTION_TITLE}">
        Error Details
      </h2>
      <div style="${this.EMAIL_STYLES.ERROR_BOX}">
        <pre style="${this.EMAIL_STYLES.ERROR_TEXT}">${escapeHtml(errorMessage)}</pre>
      </div>
    </div>`;
  }

  /**
   * Build job metadata section HTML
   */
  private buildMetadataSection(metadata: string): string {
    return `
    <div style="${this.EMAIL_STYLES.SECTION}">
      <h2 style="${this.EMAIL_STYLES.SECTION_TITLE}">
        Job Metadata
      </h2>
      <div style="${this.EMAIL_STYLES.METADATA_BOX}">
        <pre style="${this.EMAIL_STYLES.METADATA_TEXT}">${escapeHtml(metadata)}</pre>
      </div>
    </div>`;
  }

  /**
   * Build email footer HTML
   */
  private buildEmailFooter(): string {
    return `
    <div style="${this.EMAIL_STYLES.FOOTER}">
      <p style="margin: 0 0 8px 0; font-size: 13px; color: #666;">
        This is an automated alert from <strong>Account Engine</strong> job processor.
      </p>
      <p style="margin: 0; font-size: 12px; color: #999;">
        Job logs are available in the application console for detailed debugging.
      </p>
    </div>`;
  }

  /**
   * Generate HTML email template for job failure notification.
   *
   * @param job - The failed job
   * @returns HTML email content
   */
  private generateFailureEmailHtml(job: Job): string {
    const userId = this.extractUserId(job);
    const timestamp = new Date().toISOString();
    const errorMessage = truncateString(
      job.errorMessage ?? 'Unknown error',
      ADMIN_NOTIFICATION_CONFIG.ERROR_MESSAGE_MAX_LENGTH,
    );
    const payload = job.payload as unknown;
    const metadata = truncateString(
      JSON.stringify(
        typeof payload === 'object' && payload !== null ? payload : {},
        null,
        2,
      ),
      ADMIN_NOTIFICATION_CONFIG.METADATA_MAX_LENGTH,
    );

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Job Failure Alert</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif;">
  <div style="${this.EMAIL_STYLES.CONTAINER}">
${this.buildEmailHeader()}
${this.buildJobDetailsSection(job, userId, timestamp)}
${this.buildErrorSection(errorMessage)}
${this.buildMetadataSection(metadata)}
${this.buildEmailFooter()}
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * Extract user ID from job payload if available.
   *
   * @param job - The job to extract user ID from
   * @returns User ID or null if not found
   */
  private extractUserId(job: Job): string | null {
    const payload = job.payload as Record<string, unknown> | undefined;

    if (!payload) {
      return null;
    }

    // Try common user ID field names
    const userId =
      payload.userId ?? payload.user_id ?? payload.id ?? payload.user ?? null;
    return typeof userId === 'string' ? userId : null;
  }

  /**
   * Parse comma-separated admin emails from environment variable.
   * Trims whitespace from each email address.
   *
   * @returns Array of admin email addresses
   */
  private parseAdminEmails(): string[] {
    const emailsString = this.configService.get<string>('EMAIL_USER');

    if (!emailsString || emailsString.trim() === '') {
      return [];
    }

    return emailsString
      .split(',')
      .map((email) => email.trim())
      .filter((email) => email.length > 0);
  }

  /**
   * Get notifications enabled flag from environment variable.
   * Defaults to true if not specified.
   *
   * @returns Whether admin notifications are enabled
   */
  private getNotificationsEnabled(): boolean {
    const enabled = this.configService.get<string>(
      'ADMIN_NOTIFICATIONS_ENABLED',
    );

    // Default to enabled if not specified
    if (!enabled) {
      return true;
    }

    // Parse boolean from string
    return enabled.toLowerCase() === 'true';
  }

  /**
   * Validate email configuration on service startup.
   * Logs warnings for invalid configurations.
   */
  private validateConfiguration(): void {
    if (!this.notificationsEnabled) {
      this.logger.log('Admin notifications are disabled via configuration');
      return;
    }

    if (this.adminEmails.length === 0) {
      this.logger.warn(
        'Admin notifications enabled but no EMAIL_USER configured. ' +
          'Set EMAIL_USER environment variable to receive job failure alerts.',
      );
      return;
    }

    this.logger.log(
      `Admin notifications enabled for ${this.adminEmails.length} recipient(s): ${this.adminEmails.join(', ')}`,
    );
  }
}
