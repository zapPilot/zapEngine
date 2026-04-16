import {
  type Job,
  JobStatus,
  JobType,
} from '@modules/jobs/interfaces/job.interface';
import { JobQueueService } from '@modules/jobs/job-queue.service';
import { DailySuggestionProcessor } from '@modules/jobs/processors/daily-suggestion.processor';
import { AnalyticsClientService } from '@modules/notifications/analytics-client.service';
import { PortfolioNotFoundError } from '@modules/notifications/errors/portfolio-not-found.error';
import { TelegramService } from '@modules/notifications/telegram.service';

function createPendingJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'job-1',
    type: JobType.DAILY_SUGGESTION_BATCH,
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

function createMocks() {
  const jobQueueService = {
    createJob: jest.fn().mockImplementation((opts: any) => ({
      // eslint-disable-next-line sonarjs/pseudo-random
      id: `child-${Math.random().toString(36).slice(2, 8)}`,
      ...opts,
    })),
    logJobEvent: jest.fn(),
    updateJobMetadata: jest.fn(),
    updateJobStatus: jest.fn(),
  };

  const analyticsClient = {
    getDailySuggestion: jest.fn(),
  };

  const telegramService = {
    getTelegramConnectedUserIds: jest.fn().mockResolvedValue([]),
    sendDailySuggestion: jest.fn().mockResolvedValue(undefined),
  };

  const processor = new DailySuggestionProcessor(
    jobQueueService as unknown as JobQueueService,
    analyticsClient as unknown as AnalyticsClientService,
    telegramService as unknown as TelegramService,
  );

  return { processor, jobQueueService, analyticsClient, telegramService };
}

function makeSuggestionData(overrides: Record<string, any> = {}) {
  return {
    as_of: '2025-01-01',
    config_id: 'cfg',
    config_display_name: 'Test',
    strategy_id: 'strat',
    action: {
      status: 'action_required',
      required: true,
      kind: 'rebalance',
      reason_code: 'eth_btc_ratio_rebalance',
      transfers: [{ from_bucket: 'btc', to_bucket: 'eth', amount_usd: 100 }],
    },
    context: {
      market: { sentiment: 50 },
      signal: { regime: 'neutral', details: null },
      portfolio: { total_value: 10000, asset_allocation: { btc: 0.6 } },
      target: { allocation: { btc: 0.5 }, asset_allocation: { btc: 0.5 } },
      strategy: {
        stance: 'hold',
        reason_code: 'eth_btc_ratio_rebalance',
        details: null,
      },
    },
    ...overrides,
  };
}

describe('DailySuggestionProcessor', () => {
  describe('supportedJobTypes', () => {
    it('supports batch and single job types', () => {
      const { processor } = createMocks();
      expect(processor.supportedJobTypes).toContain(
        JobType.DAILY_SUGGESTION_BATCH,
      );
      expect(processor.supportedJobTypes).toContain(
        JobType.DAILY_SUGGESTION_SINGLE,
      );
    });
  });

  describe('process - batch', () => {
    it('fans out to single jobs for provided userIds', async () => {
      const { processor, jobQueueService } = createMocks();
      const job = createPendingJob({
        type: JobType.DAILY_SUGGESTION_BATCH,
        payload: { userIds: ['u-1', 'u-2'] },
      });

      const result = await processor.process(job);

      expect(result.success).toBe(true);
      expect(jobQueueService.createJob).toHaveBeenCalledTimes(2);
    });

    it('auto-discovers Telegram users when no userIds provided', async () => {
      const { processor, telegramService, jobQueueService } = createMocks();
      telegramService.getTelegramConnectedUserIds.mockResolvedValue([
        'u-1',
        'u-2',
        'u-3',
      ]);

      const job = createPendingJob({
        type: JobType.DAILY_SUGGESTION_BATCH,
        payload: {},
      });

      const result = await processor.process(job);

      expect(result.success).toBe(true);
      expect(jobQueueService.createJob).toHaveBeenCalledTimes(3);
    });

    it('returns success with 0 users when none are connected', async () => {
      const { processor, telegramService, jobQueueService } = createMocks();
      telegramService.getTelegramConnectedUserIds.mockResolvedValue([]);

      const job = createPendingJob({
        type: JobType.DAILY_SUGGESTION_BATCH,
        payload: {},
      });

      const result = await processor.process(job);

      expect(result.success).toBe(true);
      expect(result.metadata?.totalUsers).toBe(0);
      expect(jobQueueService.createJob).not.toHaveBeenCalled();
    });
  });

  describe('process - single', () => {
    it('sends suggestion when action is required', async () => {
      const { processor, analyticsClient, telegramService } = createMocks();
      analyticsClient.getDailySuggestion.mockResolvedValue(
        makeSuggestionData(),
      );

      const job = createPendingJob({
        type: JobType.DAILY_SUGGESTION_SINGLE,
        payload: { userId: 'u-1' },
      });

      const result = await processor.process(job);

      expect(result.success).toBe(true);
      expect(result.metadata?.notificationSent).toBe(true);
      expect(telegramService.sendDailySuggestion).toHaveBeenCalledWith(
        'u-1',
        expect.any(Object),
      );
    });

    it('skips notification when no action required', async () => {
      const { processor, analyticsClient, telegramService } = createMocks();
      analyticsClient.getDailySuggestion.mockResolvedValue(
        makeSuggestionData({
          action: {
            status: 'no_action',
            required: false,
            kind: null,
            reason_code: 'already_aligned',
            transfers: [],
          },
        }),
      );

      const job = createPendingJob({
        type: JobType.DAILY_SUGGESTION_SINGLE,
        payload: { userId: 'u-1' },
      });

      const result = await processor.process(job);

      expect(result.success).toBe(true);
      expect(result.metadata?.notificationSent).toBe(false);
      expect(result.metadata?.skipped).toBe(true);
      expect(telegramService.sendDailySuggestion).not.toHaveBeenCalled();
    });

    it('handles PortfolioNotFoundError gracefully', async () => {
      const { processor, analyticsClient } = createMocks();
      analyticsClient.getDailySuggestion.mockRejectedValue(
        new PortfolioNotFoundError('u-1'),
      );

      const job = createPendingJob({
        type: JobType.DAILY_SUGGESTION_SINGLE,
        payload: { userId: 'u-1' },
      });

      const result = await processor.process(job);

      expect(result.success).toBe(true);
      expect(result.metadata?.skipped).toBe(true);
    });

    it('returns failure on unexpected error', async () => {
      const { processor, analyticsClient } = createMocks();
      analyticsClient.getDailySuggestion.mockRejectedValue(
        new Error('Network error'),
      );

      const job = createPendingJob({
        type: JobType.DAILY_SUGGESTION_SINGLE,
        payload: { userId: 'u-1' },
      });

      const result = await processor.process(job);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network error');
    });
  });

  describe('unsupported job type', () => {
    it('returns failure for unknown type', async () => {
      const { processor } = createMocks();
      const job = createPendingJob({
        type: 'unknown_type' as JobType,
      });

      const result = await processor.process(job);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unsupported job type');
    });
  });
});
