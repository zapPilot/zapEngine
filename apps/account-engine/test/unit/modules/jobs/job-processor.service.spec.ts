import { ServiceLayerException } from '../../../../src/common/exceptions';
import {
  type Job,
  type JobProcessingResult,
  type JobProcessor,
  JobStatus,
  JobType,
  LogLevel,
} from '../../../../src/modules/jobs/interfaces/job.interface';
import { JobProcessorService } from '../../../../src/modules/jobs/job-processor.service';
import { JobQueueService } from '../../../../src/modules/jobs/job-queue.service';
import { AdminNotificationService } from '../../../../src/modules/notifications/admin-notification.service';

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

function createMocks() {
  const jobQueueService = {
    getJob: vi.fn(),
    getNextJob: vi.fn(),
    startProcessing: vi.fn(),
    completeJob: vi.fn(),
    failJob: vi.fn(),
    retryJob: vi.fn(),
    logJobEvent: vi.fn(),
  };

  const adminNotificationService = {
    notifyJobFailure: vi.fn().mockResolvedValue(undefined),
  };

  const service = new JobProcessorService(
    jobQueueService as unknown as JobQueueService,
    adminNotificationService as unknown as AdminNotificationService,
  );

  return { service, jobQueueService, adminNotificationService };
}

function createTestProcessor(
  result: JobProcessingResult = { success: true },
): JobProcessor {
  return {
    supportedJobTypes: [JobType.WEEKLY_REPORT_BATCH],
    process: vi.fn().mockResolvedValue(result),
  };
}

describe('JobProcessorService', () => {
  describe('registerProcessor', () => {
    it('registers a processor for supported job types', () => {
      const { service } = createMocks();
      const processor = createTestProcessor();

      service.registerProcessor(processor);

      const stats = service.getProcessingStats();
      expect(stats.registeredProcessors).toContain(JobType.WEEKLY_REPORT_BATCH);
    });

    it('warns when overwriting an already registered processor', () => {
      const { service } = createMocks();
      service.registerProcessor(createTestProcessor());
      // registering same type again should warn but not throw
      expect(() =>
        service.registerProcessor(createTestProcessor()),
      ).not.toThrow();
    });
  });

  describe('unregisterProcessor', () => {
    it('removes a registered processor', () => {
      const { service } = createMocks();
      service.registerProcessor(createTestProcessor());

      service.unregisterProcessor(JobType.WEEKLY_REPORT_BATCH);

      const stats = service.getProcessingStats();
      expect(stats.registeredProcessors).not.toContain(
        JobType.WEEKLY_REPORT_BATCH,
      );
    });
  });

  describe('start / stop', () => {
    it('starts and stops processing', () => {
      const { service } = createMocks();

      service.start();
      expect(service.getProcessingStats().isProcessing).toBe(true);

      service.stop();
      expect(service.getProcessingStats().isProcessing).toBe(false);
    });

    it('is idempotent when already started', () => {
      const { service } = createMocks();
      service.start();
      service.start(); // should not throw
      service.stop();
    });

    it('stopProcessing is a no-op when not processing', () => {
      const { service } = createMocks();
      // never started
      expect(() => service.stop()).not.toThrow();
      expect(service.getProcessingStats().isProcessing).toBe(false);
    });
  });

  describe('processAvailableJobs (via interval)', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('picks up jobs when interval fires', async () => {
      const { service, jobQueueService } = createMocks();
      const job = createPendingJob();
      jobQueueService.getNextJob.mockReturnValueOnce(job).mockReturnValue(null);
      service.registerProcessor(createTestProcessor());
      service.start();

      // JOB_CONFIG.PROCESSING_INTERVAL_MS = 5000
      vi.advanceTimersByTime(5100);
      service.stop();

      // Flush background microtasks from executeJobInBackground
      for (let i = 0; i < 10; i++) {
        await Promise.resolve();
      }

      // getNextJob was called during the interval, confirming processAvailableJobs ran
      expect(jobQueueService.getNextJob).toHaveBeenCalled();
    });

    it('handles error thrown by getNextJob without crashing', () => {
      const { service, jobQueueService } = createMocks();
      jobQueueService.getNextJob.mockImplementation(() => {
        throw new Error('DB error');
      });
      service.start();

      expect(() => vi.advanceTimersByTime(5100)).not.toThrow();
      service.stop();
    });
  });

  describe('processor cleanup', () => {
    it('calls processor.cleanup after successful processing', async () => {
      const { service, jobQueueService } = createMocks();
      const job = createPendingJob();
      jobQueueService.getJob.mockReturnValue(job);

      const cleanup = vi.fn().mockResolvedValue(undefined);
      const processorWithCleanup = {
        supportedJobTypes: [JobType.WEEKLY_REPORT_BATCH],
        process: vi.fn().mockResolvedValue({ success: true }),
        cleanup,
      };
      service.registerProcessor(processorWithCleanup);

      await service.processJob('job-1');

      expect(cleanup).toHaveBeenCalledWith(job, { success: true });
    });

    it('does not throw when cleanup throws', async () => {
      const { service, jobQueueService } = createMocks();
      const job = createPendingJob();
      jobQueueService.getJob.mockReturnValue(job);

      const processorWithCleanup = {
        supportedJobTypes: [JobType.WEEKLY_REPORT_BATCH],
        process: vi.fn().mockResolvedValue({ success: true }),
        cleanup: vi.fn().mockRejectedValue(new Error('cleanup error')),
      };
      service.registerProcessor(processorWithCleanup);

      await expect(service.processJob('job-1')).resolves.toBeDefined();
    });
  });

  describe('admin notification on permanent failure', () => {
    it('does not throw when notifyJobFailure fails', async () => {
      const { service, jobQueueService, adminNotificationService } =
        createMocks();
      const job = createPendingJob({ maxRetries: 0, retryCount: 0 });
      jobQueueService.getJob.mockReturnValue(job);
      adminNotificationService.notifyJobFailure.mockRejectedValue(
        new Error('email down'),
      );

      const processor = createTestProcessor({
        success: false,
        error: 'perm fail',
      });
      service.registerProcessor(processor);

      // This should not reject even though notification fails
      await expect(service.processJob('job-1')).resolves.toBeDefined();

      // Wait for the fire-and-forget notification attempt
      await Promise.resolve();
      await Promise.resolve();
    });
  });

  describe('processJob', () => {
    it('processes a pending job successfully', async () => {
      const { service, jobQueueService } = createMocks();
      const job = createPendingJob();
      jobQueueService.getJob.mockReturnValue(job);
      service.registerProcessor(createTestProcessor());

      const result = await service.processJob('job-1');

      expect(result.success).toBe(true);
      expect(jobQueueService.startProcessing).toHaveBeenCalledWith('job-1');
      expect(jobQueueService.completeJob).toHaveBeenCalledWith('job-1');
    });

    it('throws when job not found', async () => {
      const { service, jobQueueService } = createMocks();
      jobQueueService.getJob.mockReturnValue(undefined);

      await expect(service.processJob('nope')).rejects.toThrow(
        ServiceLayerException,
      );
    });

    it('throws when job not in pending status', async () => {
      const { service, jobQueueService } = createMocks();
      jobQueueService.getJob.mockReturnValue(
        createPendingJob({ status: JobStatus.PROCESSING }),
      );

      await expect(service.processJob('job-1')).rejects.toThrow(
        ServiceLayerException,
      );
    });

    it('returns failure when no processor is registered', async () => {
      const { service, jobQueueService } = createMocks();
      jobQueueService.getJob.mockReturnValue(createPendingJob());

      const result = await service.processJob('job-1');

      expect(result.success).toBe(false);
      expect(result.error).toContain('No processor registered');
    });

    it('retries on retryable error', async () => {
      const { service, jobQueueService } = createMocks();
      const job = createPendingJob({ maxRetries: 3, retryCount: 0 });
      jobQueueService.getJob.mockReturnValue(job);
      const processor = createTestProcessor({
        success: false,
        error: 'Temporary failure',
      });
      service.registerProcessor(processor);

      await service.processJob('job-1');

      expect(jobQueueService.retryJob).toHaveBeenCalledWith(
        'job-1',
        'Temporary failure',
      );
    });

    it('fails permanently after max retries', async () => {
      const { service, jobQueueService } = createMocks();
      const job = createPendingJob({ maxRetries: 3, retryCount: 3 });
      jobQueueService.getJob.mockReturnValue(job);
      const processor = createTestProcessor({
        success: false,
        error: 'Still failing',
      });
      service.registerProcessor(processor);

      await service.processJob('job-1');

      expect(jobQueueService.failJob).toHaveBeenCalledWith(
        'job-1',
        'Still failing',
      );
    });

    it('does not retry non-retryable errors', async () => {
      const { service, jobQueueService } = createMocks();
      const job = createPendingJob({ maxRetries: 3, retryCount: 0 });
      jobQueueService.getJob.mockReturnValue(job);

      const failingProcessor: JobProcessor = {
        supportedJobTypes: [JobType.WEEKLY_REPORT_BATCH],
        process: vi
          .fn()
          .mockRejectedValue(new Error('ValidationError: bad input')),
      };
      service.registerProcessor(failingProcessor);

      await service.processJob('job-1');

      expect(jobQueueService.failJob).toHaveBeenCalled();
      expect(jobQueueService.retryJob).not.toHaveBeenCalled();
    });

    it('handles batch job dispatched status', async () => {
      const { service, jobQueueService } = createMocks();
      const job = createPendingJob();
      jobQueueService.getJob.mockReturnValue(job);
      const processor = createTestProcessor({
        success: true,
        metadata: { batchStatus: 'processing', childJobIds: ['c-1'] },
      });
      service.registerProcessor(processor);

      await service.processJob('job-1');

      expect(jobQueueService.completeJob).not.toHaveBeenCalled();
      expect(jobQueueService.logJobEvent).toHaveBeenCalledWith(
        'job-1',
        LogLevel.INFO,
        expect.stringContaining('Batch job dispatched'),
        expect.any(Object),
      );
    });
  });
});
