import { Logger } from '@common/logger';
import { getErrorMessage } from '@common/utils';
import {
  createJobFailureResult,
  Job,
  JobProcessingResult,
  JobProcessor,
  JobType,
  LogLevel,
  SingleUserReportJobPayload,
  WeeklyReportJobPayload,
} from '@modules/jobs/interfaces/job.interface';
import { JobQueueService } from '@modules/jobs/job-queue.service';
import { BatchFanoutHelper } from '@modules/jobs/utils/batch-fanout.helper';
import { AnalyticsClientService } from '@modules/notifications/analytics-client.service';
import { ChartService } from '@modules/notifications/chart.service';
import { EmailService } from '@modules/notifications/email.service';
import { PortfolioNotFoundError } from '@modules/notifications/errors/portfolio-not-found.error';
import { PortfolioResponse } from '@modules/notifications/interfaces/portfolio-response.interface';
import {
  BalanceHistoryPoint,
  SupabaseUserService,
} from '@modules/notifications/supabase-user.service';
import {
  EmailMetrics,
  TemplateService,
} from '@modules/notifications/template.service';

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
  private async processBatchWeeklyReport(
    job: Job,
  ): Promise<JobProcessingResult> {
    const payload: WeeklyReportJobPayload = {
      userIds: job.payload.userIds as string[] | undefined,
      testMode: job.payload.testMode as boolean | undefined,
      testRecipient: job.payload.testRecipient as string | undefined,
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
      (userId) => {
        const userEntry = usersWithWallets.find((uw) => uw.user.id === userId)!;
        return {
          userId,
          wallets: userEntry.wallets,
          testMode: payload.testMode,
          testRecipient,
        } as Record<string, unknown>;
      },
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
      userId: job.payload.userId as string,
      testMode: job.payload.testMode as boolean | undefined,
      testRecipient: job.payload.testRecipient as string | undefined,
    };

    try {
      // Get user data first to extract wallets from database
      const userWithWallets = await this.supabaseUserService.getUserWithWallets(
        payload.userId,
      );
      if (!userWithWallets) {
        throw new Error(`User ${payload.userId} not found or not subscribed`);
      }

      const { user, wallets: userWallets } = userWithWallets;

      this.jobQueueService.logJobEvent(
        job.id,
        LogLevel.INFO,
        `Processing weekly report for user ${payload.userId}`,
        { userId: payload.userId, walletCount: userWallets.length },
      );

      // Get portfolio data - wrap in try-catch for 404 handling
      let portfolioData: PortfolioResponse;
      let emailMetrics: EmailMetrics;

      try {
        portfolioData = await this.analyticsClientService.getPortfolioData(
          user.id,
        );
        emailMetrics =
          this.analyticsClientService.transformToEmailMetrics(portfolioData);
      } catch (error) {
        // Portfolio 404 is expected for new/inactive users - skip gracefully
        if (error instanceof PortfolioNotFoundError) {
          this.logger.error(
            `Portfolio data not found for user ${user.id}. Skipping weekly report email.`,
            {
              userId: user.id,
              userEmail: user.email,
              walletCount: userWallets.length,
              wallets: userWallets,
              skipReason: 'portfolio_not_found',
              analyticsEngineUrl:
                this.analyticsClientService.getAnalyticsEngineUrl(),
            },
          );

          // Log job event for observability
          this.jobQueueService.logJobEvent(
            job.id,
            LogLevel.ERROR,
            'Weekly report skipped: portfolio data not available',
            {
              userId: user.id,
              userEmail: user.email,
              skipReason: 'portfolio_not_found',
              walletCount: userWallets.length,
            },
          );

          // Mark job as COMPLETED (not failed) - 404 is expected state
          return {
            success: true,
            metadata: {
              userId: user.id,
              userEmail: user.email,
              skipped: true,
              skipReason: 'portfolio_not_found',
              walletCount: userWallets.length,
            },
          };
        }

        // Other errors (500, network, etc.) should still retry
        throw error;
      }

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

      try {
        // Generate email HTML with portfolio metrics
        const emailHtml = this.templateService.generateReportHTML(
          user.id,
          emailMetrics,
          user.email,
          chart.contentId,
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

        return {
          success: true,
          metadata: {
            userId: user.id,
            recipient,
            testMode: payload.testMode,
            walletCount: userWallets.length,
          },
        };
      } finally {
        // Always cleanup chart files
        this.chartService.cleanupTempFiles(chart);
      }
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
      await this.supabaseUserService.getUsersWithAllWallets();

    // Apply additional user ID filter if provided
    if (userIds && userIds.length > 0) {
      return allUsersWithWallets.filter((entry) =>
        userIds.includes(entry.user.id),
      );
    }

    return allUsersWithWallets;
  }

  private resolveWeeklySubjectPercentage(
    userId: string,
    emailMetrics: EmailMetrics,
    balanceHistory: BalanceHistoryPoint[],
  ): number | undefined {
    if (
      typeof emailMetrics.weeklyPnLPercentage === 'number' &&
      Number.isFinite(emailMetrics.weeklyPnLPercentage)
    ) {
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

    if (baselinePoint.usdValue <= 0) {
      return { reason: 'invalid_7d_baseline_balance' };
    }

    return {
      weeklyPnLPercentage:
        ((latestPoint.usdValue - baselinePoint.usdValue) /
          baselinePoint.usdValue) *
        100,
      reason: 'resolved_from_balance_history',
    };
  }
}
