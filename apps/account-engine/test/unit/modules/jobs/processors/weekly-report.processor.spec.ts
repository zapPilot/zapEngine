import {
  type Job,
  JobStatus,
  JobType,
} from '../../../../../src/modules/jobs/interfaces/job.interface';
import { JobQueueService } from '../../../../../src/modules/jobs/job-queue.service';
import { WeeklyReportProcessor } from '../../../../../src/modules/jobs/processors/weekly-report.processor';
import { AnalyticsClientService } from '../../../../../src/modules/notifications/analytics-client.service';
import { ChartService } from '../../../../../src/modules/notifications/chart.service';
import { EmailService } from '../../../../../src/modules/notifications/email.service';
import { PortfolioNotFoundError } from '../../../../../src/modules/notifications/errors/portfolio-not-found.error';
import { ReportUnsubscribeTokenService } from '../../../../../src/modules/notifications/report-unsubscribe-token.service';
import { SupabaseUserService } from '../../../../../src/modules/notifications/supabase-user.service';
import { TemplateService } from '../../../../../src/modules/notifications/template.service';

function createPendingJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'job-1',
    type: JobType.WEEKLY_REPORT_BATCH,
    status: JobStatus.PENDING,
    payload: {},
    priority: 0,
    maxRetries: 3,
    retryCount: 0,
    retryDelaySeconds: 60,
    scheduledAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

let mockChildJobCounter = 0;

function createMocks() {
  const jobQueueService = {
    createJob: vi.fn().mockImplementation((opts: any) => ({
      id: `child-${String(++mockChildJobCounter).padStart(4, '0')}`,
      ...opts,
    })),
    logJobEvent: vi.fn(),
    updateJobMetadata: vi.fn(),
    updateJobStatus: vi.fn(),
  };

  const emailService = {
    validateEmailConfiguration: vi
      .fn()
      .mockResolvedValue({ valid: true, message: 'ok' }),
    getTestRecipient: vi.fn().mockReturnValue('qa@test.com'),
    sendEmail: vi.fn().mockResolvedValue({ success: true }),
    generateSubject: vi.fn().mockReturnValue('Weekly Report'),
  };

  const chartService = {
    generateHistoricalBalanceChart: vi.fn().mockResolvedValue({
      buffer: Buffer.from('PNG'),
      fileName: 'chart.png',
      contentId: 'chart-cid',
    }),
  };

  const templateService = {
    generateReportHTML: vi.fn().mockReturnValue('<html>Report</html>'),
  };

  const analyticsClient = {
    getPortfolioData: vi.fn().mockResolvedValue({
      total_net_usd: 5000,
      portfolio_roi: {
        recommended_yearly_roi: 10,
        estimated_yearly_pnl_usd: 500,
        recommended_period: '30_days',
        windows: { roi_7d: { value: 1.5 } },
      },
      estimated_monthly_income: 41.67,
      weighted_apr: 8.5,
      wallet_count: 2,
    }),
    transformToEmailMetrics: vi.fn().mockReturnValue({
      currentBalance: 5000,
      estimatedYearlyROI: 10,
      estimatedYearlyPnL: 500,
      monthlyIncome: 41.67,
      weightedAPR: 8.5,
      walletCount: 2,
      recommendedPeriod: '30_days',
      weeklyPnLPercentage: 1.5,
    }),
    validateAnalyticsConnection: vi
      .fn()
      .mockResolvedValue({ connected: true, message: 'ok' }),
    getAnalyticsEngineUrl: vi.fn().mockReturnValue('http://localhost:8001'),
  };

  const supabaseUserService = {
    getReportRecipientsWithWallets: vi.fn().mockResolvedValue([
      {
        user: { id: 'u-1', email: 'user@test.com' },
        wallets: ['0xabc'],
      },
    ]),
    getReportRecipientWithWallets: vi.fn().mockResolvedValue({
      user: { id: 'u-1', email: 'user@test.com' },
      wallets: ['0xabc'],
    }),
    getBalanceHistory: vi.fn().mockResolvedValue([
      { date: '2025-01-01', usd_value: 4800 },
      { date: '2025-01-08', usd_value: 5000 },
    ]),
  };

  const reportUnsubscribeTokenService = {
    createUnsubscribeUrl: vi
      .fn()
      .mockReturnValue('https://app.zap-pilot.org/unsubscribe?token=signed'),
  };

  const processor = new WeeklyReportProcessor(
    jobQueueService as unknown as JobQueueService,
    emailService as unknown as EmailService,
    chartService as unknown as ChartService,
    templateService as unknown as TemplateService,
    analyticsClient as unknown as AnalyticsClientService,
    supabaseUserService as unknown as SupabaseUserService,
    reportUnsubscribeTokenService as unknown as ReportUnsubscribeTokenService,
  );

  return {
    processor,
    jobQueueService,
    emailService,
    chartService,
    templateService,
    analyticsClient,
    supabaseUserService,
    reportUnsubscribeTokenService,
  };
}

describe('WeeklyReportProcessor', () => {
  describe('supportedJobTypes', () => {
    it('supports batch and single job types', () => {
      const { processor } = createMocks();
      expect(processor.supportedJobTypes).toContain(
        JobType.WEEKLY_REPORT_BATCH,
      );
      expect(processor.supportedJobTypes).toContain(
        JobType.WEEKLY_REPORT_SINGLE,
      );
    });
  });

  describe('process - batch', () => {
    it('fans out to single jobs for matched users', async () => {
      const { processor, jobQueueService } = createMocks();
      const job = createPendingJob({
        type: JobType.WEEKLY_REPORT_BATCH,
        payload: {},
      });

      const result = await processor.process(job);

      expect(result.success).toBe(true);
      expect(jobQueueService.createJob).toHaveBeenCalledTimes(1);
    });

    it('filters users by provided userIds', async () => {
      const { processor, supabaseUserService, jobQueueService } = createMocks();
      supabaseUserService.getReportRecipientsWithWallets.mockResolvedValue([
        {
          user: { id: 'u-1', email: 'a@b.com' },
          wallets: ['0x1'],
        },
        {
          user: { id: 'u-2', email: 'c@d.com' },
          wallets: ['0x2'],
        },
      ]);

      const job = createPendingJob({
        type: JobType.WEEKLY_REPORT_BATCH,
        payload: { userIds: ['u-1'] },
      });

      const result = await processor.process(job);

      expect(result.success).toBe(true);
      expect(jobQueueService.createJob).toHaveBeenCalledTimes(1);
    });

    it('validates email service before processing', async () => {
      const { processor, emailService } = createMocks();
      emailService.validateEmailConfiguration.mockResolvedValue({
        valid: false,
        message: 'not configured',
      });

      const job = createPendingJob({
        type: JobType.WEEKLY_REPORT_BATCH,
        payload: {},
      });

      const result = await processor.process(job);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not configured');
    });

    it('returns failure when no users match', async () => {
      const { processor, supabaseUserService } = createMocks();
      supabaseUserService.getReportRecipientsWithWallets.mockResolvedValue([]);

      const job = createPendingJob({
        type: JobType.WEEKLY_REPORT_BATCH,
        payload: {},
      });

      const result = await processor.process(job);
      expect(result.success).toBe(false);
    });
  });

  describe('process - single', () => {
    it('sends weekly report email successfully', async () => {
      const {
        processor,
        emailService,
        reportUnsubscribeTokenService,
        templateService,
      } = createMocks();
      const job = createPendingJob({
        type: JobType.WEEKLY_REPORT_SINGLE,
        payload: { userId: 'u-1' },
      });

      const result = await processor.process(job);

      expect(result.success).toBe(true);
      expect(result.metadata?.['balanceUsd']).toBe(5000);
      expect(emailService.sendEmail).toHaveBeenCalled();
      expect(
        reportUnsubscribeTokenService.createUnsubscribeUrl,
      ).toHaveBeenCalledWith('u-1', 'user@test.com');
      expect(templateService.generateReportHTML).toHaveBeenCalledWith(
        'u-1',
        expect.any(Object),
        'chart-cid',
        'https://app.zap-pilot.org/unsubscribe?token=signed',
        ['0xabc'],
      );
    });

    it('skips a portfolio below the $10 minimum', async () => {
      const {
        processor,
        analyticsClient,
        emailService,
        chartService,
        jobQueueService,
      } = createMocks();
      analyticsClient.getPortfolioData.mockResolvedValue({
        total_net_usd: 9.99,
      });

      const result = await processor.process(
        createPendingJob({
          type: JobType.WEEKLY_REPORT_SINGLE,
          payload: { userId: 'u-1' },
        }),
      );

      expect(result).toEqual(
        expect.objectContaining({
          success: true,
          metadata: expect.objectContaining({
            balanceUsd: 9.99,
            skipped: true,
            skipReason: 'below_minimum_balance',
          }),
        }),
      );
      expect(emailService.sendEmail).not.toHaveBeenCalled();
      expect(
        chartService.generateHistoricalBalanceChart,
      ).not.toHaveBeenCalled();
      expect(jobQueueService.updateJobMetadata).toHaveBeenCalledWith(
        'job-1',
        expect.objectContaining({
          balanceUsd: 9.99,
          skipReason: 'below_minimum_balance',
        }),
      );
    });

    it('treats a normal empty portfolio as a zero-dollar skip', async () => {
      const { processor, analyticsClient, emailService } = createMocks();
      analyticsClient.getPortfolioData.mockResolvedValue({
        total_net_usd: 0,
      });

      const result = await processor.process(
        createPendingJob({
          type: JobType.WEEKLY_REPORT_SINGLE,
          payload: { userId: 'u-1' },
        }),
      );

      expect(result.metadata).toEqual(
        expect.objectContaining({
          balanceUsd: 0,
          skipped: true,
          skipReason: 'below_minimum_balance',
        }),
      );
      expect(emailService.sendEmail).not.toHaveBeenCalled();
    });

    it('sends a portfolio worth exactly $10', async () => {
      const { processor, analyticsClient, emailService } = createMocks();
      analyticsClient.getPortfolioData.mockResolvedValue({
        total_net_usd: 10,
      });

      const result = await processor.process(
        createPendingJob({
          type: JobType.WEEKLY_REPORT_SINGLE,
          payload: { userId: 'u-1' },
        }),
      );

      expect(result.success).toBe(true);
      expect(result.metadata?.['balanceUsd']).toBe(10);
      expect(emailService.sendEmail).toHaveBeenCalled();
    });

    it('uses test recipient in test mode', async () => {
      const { processor, emailService } = createMocks();
      const job = createPendingJob({
        type: JobType.WEEKLY_REPORT_SINGLE,
        payload: { userId: 'u-1', testMode: true, testRecipient: 'qa@q.com' },
      });

      await processor.process(job);

      expect(emailService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'qa@q.com' }),
      );
    });

    it('returns a retryable failure when portfolio is not found', async () => {
      const { processor, analyticsClient, emailService } = createMocks();
      analyticsClient.getPortfolioData.mockRejectedValue(
        new PortfolioNotFoundError('u-1'),
      );

      const job = createPendingJob({
        type: JobType.WEEKLY_REPORT_SINGLE,
        payload: { userId: 'u-1' },
      });

      const result = await processor.process(job);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Portfolio data not found');
      expect(emailService.sendEmail).not.toHaveBeenCalled();
    });

    it('skips when the user is no longer an eligible recipient', async () => {
      const { processor, supabaseUserService } = createMocks();
      supabaseUserService.getReportRecipientWithWallets.mockResolvedValue(null);

      const job = createPendingJob({
        type: JobType.WEEKLY_REPORT_SINGLE,
        payload: { userId: 'u-1' },
      });

      const result = await processor.process(job);
      expect(result).toEqual(
        expect.objectContaining({
          success: true,
          metadata: expect.objectContaining({
            balanceUsd: null,
            skipped: true,
            skipReason: 'recipient_not_eligible',
          }),
        }),
      );
    });

    it('does not trust stale recipient details carried by an older child job', async () => {
      const { processor, supabaseUserService, emailService } = createMocks();
      supabaseUserService.getReportRecipientWithWallets.mockResolvedValue(null);

      const result = await processor.process(
        createPendingJob({
          type: JobType.WEEKLY_REPORT_SINGLE,
          payload: {
            userId: 'u-1',
            email: 'stale@test.com',
            wallets: ['0xstale'],
          },
        }),
      );

      expect(result.success).toBe(true);
      expect(result.metadata?.['skipReason']).toBe('recipient_not_eligible');
      expect(emailService.sendEmail).not.toHaveBeenCalled();
    });

    it('propagates send failure as job failure', async () => {
      const { processor, emailService } = createMocks();
      emailService.sendEmail.mockRejectedValue(new Error('SMTP error'));

      const job = createPendingJob({
        type: JobType.WEEKLY_REPORT_SINGLE,
        payload: { userId: 'u-1' },
      });

      const result = await processor.process(job);

      expect(result.success).toBe(false);
    });
  });

  describe('unsupported job type', () => {
    it('returns failure', async () => {
      const { processor } = createMocks();
      const result = await processor.process(
        createPendingJob({ type: 'unknown' as JobType }),
      );
      expect(result.success).toBe(false);
    });
  });

  describe('validateAnalyticsService', () => {
    it('logs warning but continues when analytics is not connected', async () => {
      const { processor, analyticsClient, jobQueueService } = createMocks();
      analyticsClient.validateAnalyticsConnection.mockResolvedValue({
        connected: false,
        message: 'connection refused',
      });

      const job = createPendingJob({
        type: JobType.WEEKLY_REPORT_BATCH,
        payload: {},
      });

      const result = await processor.process(job);

      expect(result.success).toBe(true);
      expect(jobQueueService.logJobEvent).toHaveBeenCalledWith(
        job.id,
        expect.anything(),
        expect.stringContaining('connection refused'),
      );
    });
  });

  describe('validateTestMode', () => {
    it('throws when testMode is true but no test recipient configured (batch)', async () => {
      const { processor, emailService } = createMocks();
      emailService.getTestRecipient.mockReturnValue(null);

      const job = createPendingJob({
        type: JobType.WEEKLY_REPORT_BATCH,
        payload: { testMode: true }, // testMode=true but no NOTIFICATIONS_TEST_RECIPIENT
      });

      const result = await processor.process(job);
      expect(result.success).toBe(false);
      expect(result.error).toContain('NOTIFICATIONS_TEST_RECIPIENT');
    });
  });

  describe('non-PortfolioNotFoundError rethrows', () => {
    it('returns failure when a non-portfolio error is thrown during analytics fetch', async () => {
      const { processor, analyticsClient } = createMocks();
      analyticsClient.getPortfolioData.mockRejectedValue(
        new Error('500 internal error'),
      );

      const job = createPendingJob({
        type: JobType.WEEKLY_REPORT_SINGLE,
        payload: { userId: 'u-1' },
      });

      const result = await processor.process(job);
      expect(result.success).toBe(false);
      expect(result.error).toContain('500 internal error');
    });
  });

  describe('resolveWeeklySubjectPercentage via balance history', () => {
    it('computes weekly PnL from balance history when emailMetrics has no weeklyPnLPercentage', async () => {
      const { processor, analyticsClient, emailService, supabaseUserService } =
        createMocks();
      analyticsClient.transformToEmailMetrics.mockReturnValue({
        currentBalance: 5000,
        estimatedYearlyROI: 10,
        estimatedYearlyPnL: 500,
        monthlyIncome: 41.67,
        weightedAPR: 8.5,
        walletCount: 2,
        recommendedPeriod: '30_days',
        // no weeklyPnLPercentage
      });

      const now = Date.now();
      const eightDaysAgo = new Date(
        now - 8 * 24 * 60 * 60 * 1000,
      ).toISOString();
      const today = new Date(now).toISOString();

      supabaseUserService.getBalanceHistory.mockResolvedValue([
        { date: eightDaysAgo, usd_value: 4000 },
        { date: today, usd_value: 5000 },
      ]);

      const job = createPendingJob({
        type: JobType.WEEKLY_REPORT_SINGLE,
        payload: { userId: 'u-1' },
      });

      const result = await processor.process(job);
      expect(result.success).toBe(true);
      expect(emailService.generateSubject).toHaveBeenCalled();
    });

    it('handles empty balance history gracefully', async () => {
      const { processor, analyticsClient, supabaseUserService } = createMocks();
      analyticsClient.transformToEmailMetrics.mockReturnValue({
        currentBalance: 5000,
        estimatedYearlyROI: 10,
        estimatedYearlyPnL: 500,
        monthlyIncome: 41.67,
        weightedAPR: 8.5,
        walletCount: 2,
        recommendedPeriod: '30_days',
      });
      supabaseUserService.getBalanceHistory.mockResolvedValue([]);

      const job = createPendingJob({
        type: JobType.WEEKLY_REPORT_SINGLE,
        payload: { userId: 'u-1' },
      });

      const result = await processor.process(job);
      expect(result.success).toBe(true);
    });

    it('handles balance history with no 7d baseline', async () => {
      const { processor, analyticsClient, supabaseUserService } = createMocks();
      analyticsClient.transformToEmailMetrics.mockReturnValue({
        currentBalance: 5000,
        estimatedYearlyROI: 10,
        estimatedYearlyPnL: 500,
        monthlyIncome: 41.67,
        weightedAPR: 8.5,
        walletCount: 2,
        recommendedPeriod: '30_days',
      });
      // Only recent data, no 7+ day old entry
      supabaseUserService.getBalanceHistory.mockResolvedValue([
        { date: new Date().toISOString(), usd_value: 5000 },
      ]);

      const job = createPendingJob({
        type: JobType.WEEKLY_REPORT_SINGLE,
        payload: { userId: 'u-1' },
      });

      const result = await processor.process(job);
      expect(result.success).toBe(true);
    });

    it('handles balance history with zero latest balance', async () => {
      const { processor, analyticsClient, supabaseUserService } = createMocks();
      analyticsClient.transformToEmailMetrics.mockReturnValue({
        currentBalance: 0,
        estimatedYearlyROI: 0,
        estimatedYearlyPnL: 0,
        monthlyIncome: 0,
        weightedAPR: 0,
        walletCount: 1,
        recommendedPeriod: '30_days',
      });
      supabaseUserService.getBalanceHistory.mockResolvedValue([
        { date: new Date().toISOString(), usd_value: 0 },
      ]);

      const job = createPendingJob({
        type: JobType.WEEKLY_REPORT_SINGLE,
        payload: { userId: 'u-1' },
      });

      const result = await processor.process(job);
      expect(result.success).toBe(true);
    });
  });
});
