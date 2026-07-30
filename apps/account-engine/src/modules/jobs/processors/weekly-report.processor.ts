import { EMAIL_CONFIG } from '../../../common/constants';
import { Logger } from '../../../common/logger';
import {
  getErrorMessage,
  isFiniteNumber,
  percentChange,
} from '../../../common/utils';
import { AnalyticsClientService } from '../../notifications/analytics-client.service';
import { ChartService } from '../../notifications/chart.service';
import { EmailService } from '../../notifications/email.service';
import { ReportUnsubscribeTokenService } from '../../notifications/report-unsubscribe-token.service';
import {
  BalanceHistoryPoint,
  SupabaseUserService,
} from '../../notifications/supabase-user.service';
import {
  EmailMetrics,
  TemplateService,
} from '../../notifications/template.service';
import {
  createJobFailureResult,
  Job,
  JobProcessingResult,
  JobProcessor,
  JobType,
  LogLevel,
  SingleUserReportJobPayload,
  WeeklyReportJobPayload,
} from '../interfaces/job.interface';
import { JobQueueService } from '../job-queue.service';
import { BatchFanoutHelper } from '../utils/batch-fanout.helper';

/**
 * Processor for weekly report related jobs
 */
export class WeeklyReportProcessor implements JobProcessor {
  private readonly logger = new Logger(WeeklyReportProcessor.name);
  private readonly batchFanoutHelper: BatchFanoutHelper;

  readonly supportedJobTypes = [
    JobType.WEEKLY_REPORT_BATCH,
    JobType.WEEKLY_REPORT_SINGLE,
  ];

  /* istanbul ignore next -- DI constructor */
  constructor(
    private readonly jobQueueService: JobQueueService,
    private readonly emailService: EmailService,
    private readonly chartService: ChartService,
    private readonly templateService: TemplateService,
    private readonly analyticsClientService: AnalyticsClientService,
    private readonly supabaseUserService: SupabaseUserService,
    private readonly reportUnsubscribeTokenService: ReportUnsubscribeTokenService,
  ) {
    this.batchFanoutHelper = new BatchFanoutHelper(
      jobQueueService,
      this.logger,
    );
  }

  /**
   * Process weekly report jobs
   */
  async process(job: Job): Promise<JobProcessingResult> {
    try {
      switch (job.type) {
        case JobType.WEEKLY_REPORT_BATCH:
          return await this.processBatchWeeklyReport(job);
        case JobType.WEEKLY_REPORT_SINGLE:
          return await this.processSingleUserReport(job);
        default:
          throw new Error(`Unsupported job type: ${String(job.type)}`);
      }
    } catch (error) {
      this.logger.error(`Failed to process job ${job.id}`, error);
      return createJobFailureResult(error);
    }
  }

  /**
   * Validate email service configuration
   */
  private async validateEmailService(): Promise<void> {
    const emailValidation =
      await this.emailService.validateEmailConfiguration();
    if (!emailValidation.valid) {
      throw new Error(
        `Email service not configured: ${emailValidation.message}`,
      );
    }
  }

  /**
   * Validate analytics service connection (warn but don't fail)
   */
  private async validateAnalyticsService(jobId: string): Promise<void> {
    const analyticsValidation =
      await this.analyticsClientService.validateAnalyticsConnection();
    if (!analyticsValidation.connected) {
      this.logger.warn(
        `Analytics engine not available: ${analyticsValidation.message}`,
      );
      this.jobQueueService.logJobEvent(
        jobId,
        LogLevel.WARN,
        `Analytics engine not available: ${analyticsValidation.message}`,
      );
    }
  }

  /**
   * Validate and get test recipient for test mode
   */
  private validateTestMode(testMode?: boolean): string | undefined {
    if (!testMode) {
      return undefined;
    }

    const testRecipient = this.emailService.getTestRecipient();
    if (!testRecipient) {
      throw new Error(
        'Test mode enabled but NOTIFICATIONS_TEST_RECIPIENT is not configured',
      );
    }

    return testRecipient;
  }

  /**
   * Process batch weekly report job
   */
  /**
   * Both batch + single jobs share testMode / testRecipient option fields.
   * One helper to keep them in sync (and silence jscpd on the destructure).
   */
  private extractTestModeOptions(payload: Record<string, unknown>): {
    testMode?: boolean;
    testRecipient?: string;
  } {
    return {
      testMode: payload['testMode'] as boolean | undefined,
      testRecipient: payload['testRecipient'] as string | undefined,
    };
  }

  private async processBatchWeeklyReport(
    job: Job,
  ): Promise<JobProcessingResult> {
    const payload: WeeklyReportJobPayload = {
      userIds: job.payload['userIds'] as string[] | undefined,
      ...this.extractTestModeOptions(job.payload),
    };

    // Validate services
    await this.validateEmailService();
    await this.validateAnalyticsService(job.id);

    // Validate test mode configuration
    const testRecipient = this.validateTestMode(payload.testMode);

    // Get users with wallets
    const usersWithWallets = await this.getUsersWithWallets(payload.userIds);

    if (usersWithWallets.length === 0) {
      throw new Error('No subscribed users matched the provided filters');
    }

    // Fan out to individual jobs
    return this.batchFanoutHelper.fanOutBatch(
      job,
      usersWithWallets.map((uw) => uw.user.id),
      JobType.WEEKLY_REPORT_SINGLE,
      (userId) => ({
        userId,
        testMode: payload.testMode,
        testRecipient,
      }),
      (totalUsers) => {
        this.jobQueueService.logJobEvent(
          job.id,
          LogLevel.INFO,
          `Starting batch weekly report processing for ${totalUsers} users`,
        );
      },
    );
  }

  /**
   * Process single user weekly report job
   */
  private async processSingleUserReport(
    job: Job,
  ): Promise<JobProcessingResult> {
    const payload: SingleUserReportJobPayload = {
      userId: job.payload['userId'] as string,
      ...this.extractTestModeOptions(job.payload),
    };

    try {
      const userWithWallets =
        await this.supabaseUserService.getReportRecipientWithWallets(
          payload.userId,
        );
      if (!userWithWallets) {
        this.jobQueueService.logJobEvent(
          job.id,
          LogLevel.INFO,
          'Weekly report skipped: recipient is no longer eligible',
          {
            userId: payload.userId,
            balanceUsd: null,
            skipReason: 'recipient_not_eligible',
          },
        );
        return this.createSuccessWithPersistedMetadata(job.id, {
          userId: payload.userId,
          balanceUsd: null,
          skipped: true,
          skipReason: 'recipient_not_eligible',
        });
      }
      const { user, wallets: userWallets } = userWithWallets;

      this.jobQueueService.logJobEvent(
        job.id,
        LogLevel.INFO,
        `Processing weekly report for user ${payload.userId}`,
        { userId: payload.userId, walletCount: userWallets.length },
      );

      const portfolioData = await this.analyticsClientService.getPortfolioData(
        user.id,
      );
      const balanceUsd = portfolioData.total_net_usd;
      if (!isFiniteNumber(balanceUsd)) {
        throw new Error(
          `Analytics returned an invalid portfolio balance for user ${user.id}`,
        );
      }
      if (balanceUsd < EMAIL_CONFIG.MIN_WEEKLY_REPORT_BALANCE_USD) {
        this.jobQueueService.logJobEvent(
          job.id,
          LogLevel.INFO,
          'Weekly report skipped: portfolio balance below minimum',
          {
            userId: user.id,
            balanceUsd,
            minimumBalanceUsd: EMAIL_CONFIG.MIN_WEEKLY_REPORT_BALANCE_USD,
            skipReason: 'below_minimum_balance',
          },
        );
        return this.createSuccessWithPersistedMetadata(job.id, {
          userId: user.id,
          balanceUsd,
          skipped: true,
          skipReason: 'below_minimum_balance',
          walletCount: userWallets.length,
        });
      }
      const emailMetrics: EmailMetrics =
        this.analyticsClientService.transformToEmailMetrics(portfolioData);

      // Get balance history
      const balanceHistory = await this.supabaseUserService.getBalanceHistory(
        user.id,
      );
      const weeklySubjectPercentage = this.resolveWeeklySubjectPercentage(
        user.id,
        emailMetrics,
        balanceHistory,
      );

      // Generate chart
      const chart =
        await this.chartService.generateHistoricalBalanceChart(balanceHistory);

      this.jobQueueService.logJobEvent(
        job.id,
        LogLevel.INFO,
        'Generated chart and retrieved portfolio data',
      );

      // Generate email HTML with portfolio metrics
      const unsubscribeUrl =
        this.reportUnsubscribeTokenService.createUnsubscribeUrl(
          user.id,
          user.email,
        );
      const emailHtml = this.templateService.generateReportHTML(
        user.id,
        emailMetrics,
        chart.contentId,
        unsubscribeUrl,
        userWallets.length > 0 ? userWallets : ['unknown'],
      );

      // Send email
      const recipient = payload.testMode
        ? (payload.testRecipient ?? user.email)
        : user.email;

      await this.emailService.sendEmail({
        to: recipient,
        subject: this.emailService.generateSubject({
          weeklyPnLPercentage: weeklySubjectPercentage,
        }),
        html: emailHtml,
        attachments: [
          {
            filename: chart.fileName,
            content: chart.buffer,
            cid: chart.contentId,
          },
        ],
      });

      this.jobQueueService.logJobEvent(
        job.id,
        LogLevel.INFO,
        `Successfully sent weekly report to ${recipient}`,
        { userId: user.id, recipient, testMode: payload.testMode },
      );

      return this.createSuccessWithPersistedMetadata(job.id, {
        userId: user.id,
        recipient,
        testMode: payload.testMode,
        balanceUsd,
        walletCount: userWallets.length,
      });
    } catch (error) {
      this.logger.error(
        `Failed to process weekly report for user ${payload.userId}`,
        error,
      );

      this.jobQueueService.logJobEvent(
        job.id,
        LogLevel.ERROR,
        `Failed to process weekly report for user ${payload.userId}`,
        {
          userId: payload.userId,
          error: getErrorMessage(error),
        },
      );

      throw error;
    }
  }

  /**
   * Get users with wallets, applying filters
   */
  private async getUsersWithWallets(userIds?: string[]) {
    const allUsersWithWallets =
      await this.supabaseUserService.getReportRecipientsWithWallets();

    // Apply additional user ID filter if provided
    if (userIds && userIds.length > 0) {
      return allUsersWithWallets.filter((entry) =>
        userIds.includes(entry.user.id),
      );
    }

    return allUsersWithWallets;
  }

  private createSuccessWithPersistedMetadata(
    jobId: string,
    metadata: Record<string, unknown>,
  ): JobProcessingResult {
    this.jobQueueService.updateJobMetadata(jobId, metadata);
    return { success: true, metadata };
  }

  private resolveWeeklySubjectPercentage(
    userId: string,
    emailMetrics: EmailMetrics,
    balanceHistory: BalanceHistoryPoint[],
  ): number | undefined {
    if (isFiniteNumber(emailMetrics.weeklyPnLPercentage)) {
      return emailMetrics.weeklyPnLPercentage;
    }

    const resolvedFromHistory =
      this.calculateWeeklyPercentageFromBalanceHistory(balanceHistory);
    if (resolvedFromHistory.weeklyPnLPercentage !== undefined) {
      return resolvedFromHistory.weeklyPnLPercentage;
    }

    this.logger.warn(
      `Unable to resolve weekly report subject percentage for user ${userId}: ${resolvedFromHistory.reason}`,
    );
    return undefined;
  }

  private calculateWeeklyPercentageFromBalanceHistory(
    balanceHistory: BalanceHistoryPoint[],
  ): { weeklyPnLPercentage?: number; reason: string } {
    const normalizedHistory = balanceHistory
      .map((entry) => ({
        timestamp: new Date(entry.date).getTime(),
        usdValue: entry.usd_value,
      }))
      .filter(
        (entry) =>
          Number.isFinite(entry.timestamp) && Number.isFinite(entry.usdValue),
      )
      .sort((a, b) => b.timestamp - a.timestamp);

    if (normalizedHistory.length === 0) {
      return { reason: 'no_valid_balance_history' };
    }

    const latestPoint = normalizedHistory[0];
    if (!latestPoint) {
      return { reason: 'no_valid_balance_history' };
    }

    if (latestPoint.usdValue <= 0) {
      return { reason: 'invalid_latest_balance' };
    }

    const sevenDaysAgo = latestPoint.timestamp - 7 * 24 * 60 * 60 * 1000;
    const baselinePoint = normalizedHistory.find(
      (entry) => entry.timestamp <= sevenDaysAgo,
    );

    if (!baselinePoint) {
      return { reason: 'missing_7d_baseline' };
    }

    // Single authoritative percent-change formula lives in `percentChange`;
    // both this code path and the ROI window in analytics-client.service.ts
    // route through it so the two cannot diverge.
    const pct = percentChange(latestPoint.usdValue, baselinePoint.usdValue);
    if (pct === null) {
      return { reason: 'invalid_7d_baseline_balance' };
    }

    return {
      weeklyPnLPercentage: pct,
      reason: 'resolved_from_balance_history',
    };
  }
}
