import {
  type Job,
  JobStatus,
  JobType,
} from '@/modules/jobs/interfaces/job.interface';
import { JobQueueService } from '@/modules/jobs/job-queue.service';
import { WeeklyReportProcessor } from '@/modules/jobs/processors/weekly-report.processor';
import { AnalyticsClientService } from '@/modules/notifications/analytics-client.service';
import { ChartService } from '@/modules/notifications/chart.service';
import { EmailService } from '@/modules/notifications/email.service';
import { PortfolioNotFoundError } from '@/modules/notifications/errors/portfolio-not-found.error';
import { SupabaseUserService } from '@/modules/notifications/supabase-user.service';
import { TemplateService } from '@/modules/notifications/template.service';

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
      // eslint-disable-next-line sonarjs/publicly-writable-directories
      filePath: '/tmp/chart.png',
      contentId: 'chart-cid',
    }),
    cleanupTempFiles: vi.fn(),
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
    getUsersWithAllWallets: vi.fn().mockResolvedValue([
      {
        user: { id: 'u-1', email: 'user@test.com', subscription_active: true },
        wallets: ['0xabc'],
      },
    ]),
    getUserWithWallets: vi.fn().mockResolvedValue({
      user: { id: 'u-1', email: 'user@test.com', subscription_active: true },
      wallets: ['0xabc'],
    }),
    getBalanceHistory: vi.fn().mockResolvedValue([
      { date: '2025-01-01', usd_value: 4800 },
      { date: '2025-01-08', usd_value: 5000 },
    ]),
  };

  const processor = new WeeklyReportProcessor(
    jobQueueService as unknown as JobQueueService,
    emailService as unknown as EmailService,
    chartService as unknown as ChartService,
    templateService as unknown as TemplateService,
    analyticsClient as unknown as AnalyticsClientService,
    supabaseUserService as unknown as SupabaseUserService,
  );

  return {
    processor,
    jobQueueService,
    emailService,
    chartService,
    templateService,
    analyticsClient,
    supabaseUserService,
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
      supabaseUserService.getUsersWithAllWallets.mockResolvedValue([
        {
          user: { id: 'u-1', email: 'a@b.com', subscription_active: true },
          wallets: ['0x1'],
        },
        {
          user: { id: 'u-2', email: 'c@d.com', subscription_active: true },
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
      supabaseUserService.getUsersWithAllWallets.mockResolvedValue([]);

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
      const { processor, emailService, chartService } = createMocks();
      const job = createPendingJob({
        type: JobType.WEEKLY_REPORT_SINGLE,
        payload: { userId: 'u-1' },
      });

      const result = await processor.process(job);

      expect(result.success).toBe(true);
      expect(emailService.sendEmail).toHaveBeenCalled();
      expect(chartService.cleanupTempFiles).toHaveBeenCalled();
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

    it('skips gracefully when portfolio not found', async () => {
      const { processor, analyticsClient, emailService } = createMocks();
      analyticsClient.getPortfolioData.mockRejectedValue(
        new PortfolioNotFoundError('u-1'),
      );

      const job = createPendingJob({
        type: JobType.WEEKLY_REPORT_SINGLE,
        payload: { userId: 'u-1' },
      });

      const result = await processor.process(job);

      expect(result.success).toBe(true);
      expect(result.metadata?.['skipped']).toBe(true);
      expect(emailService.sendEmail).not.toHaveBeenCalled();
    });

    it('returns failure when user not found', async () => {
      const { processor, supabaseUserService } = createMocks();
      supabaseUserService.getUserWithWallets.mockResolvedValue(null);

      const job = createPendingJob({
        type: JobType.WEEKLY_REPORT_SINGLE,
        payload: { userId: 'u-1' },
      });

      const result = await processor.process(job);
      expect(result.success).toBe(false);
    });

    it('always cleans up chart files even on send failure', async () => {
      const { processor, emailService, chartService } = createMocks();
      emailService.sendEmail.mockRejectedValue(new Error('SMTP error'));

      const job = createPendingJob({
        type: JobType.WEEKLY_REPORT_SINGLE,
        payload: { userId: 'u-1' },
      });

      const result = await processor.process(job);

      expect(result.success).toBe(false);
      expect(chartService.cleanupTempFiles).toHaveBeenCalled();
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
