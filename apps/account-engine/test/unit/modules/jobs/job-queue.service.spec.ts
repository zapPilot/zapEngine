import {
  JobStatus,
  JobType,
  LogLevel,
} from '../../../../src/modules/jobs/interfaces/job.interface';
import { JobQueueService } from '../../../../src/modules/jobs/job-queue.service';

function makeService() {
  const service = new JobQueueService();
  return service;
}

afterEach(() => {
  jest.useRealTimers();
});

describe('JobQueueService', () => {
  describe('createJob', () => {
    it('creates a job with defaults', () => {
      const service = makeService();
      const job = service.createJob({
        type: JobType.WEEKLY_REPORT_BATCH,
        payload: {},
      });
      expect(job.type).toBe(JobType.WEEKLY_REPORT_BATCH);
      expect(job.status).toBe(JobStatus.PENDING);
      expect(job.priority).toBe(0);
      expect(job.maxRetries).toBe(3);
      expect(job.retryCount).toBe(0);
      service.stop();
    });

    it('respects explicit priority, maxRetries, and retryDelaySeconds', () => {
      const service = makeService();
      const job = service.createJob({
        type: JobType.WEEKLY_REPORT_SINGLE,
        payload: { userId: 'u-1' },
        priority: 5,
        maxRetries: 10,
        retryDelaySeconds: 30,
      });
      expect(job.priority).toBe(5);
      expect(job.maxRetries).toBe(10);
      expect(job.retryDelaySeconds).toBe(30);
      service.stop();
    });

    it('stores metadata when provided', () => {
      const service = makeService();
      const job = service.createJob({
        type: JobType.DAILY_SUGGESTION_BATCH,
        payload: {},
        metadata: { tag: 'test' },
      });
      expect(job.metadata?.tag).toBe('test');
      service.stop();
    });
  });

  describe('getNextJob', () => {
    it('returns null when no jobs are pending', () => {
      const service = makeService();
      expect(service.getNextJob()).toBeNull();
      service.stop();
    });

    it('returns the highest-priority pending job', () => {
      const service = makeService();
      service.createJob({
        type: JobType.DAILY_SUGGESTION_BATCH,
        payload: {},
        priority: 0,
      });
      const high = service.createJob({
        type: JobType.WEEKLY_REPORT_BATCH,
        payload: {},
        priority: 5,
      });

      const next = service.getNextJob();
      expect(next?.id).toBe(high.id);

      // Clean up
      service.stop();
    });

    it('returns null when all jobs are not yet scheduled', () => {
      const service = makeService();
      const future = new Date(Date.now() + 60_000);
      service.createJob({
        type: JobType.DAILY_SUGGESTION_SINGLE,
        payload: {},
        scheduledAt: future,
      });
      expect(service.getNextJob()).toBeNull();
      service.stop();
    });
  });

  describe('updateJobStatus', () => {
    it('updates status', () => {
      const service = makeService();
      const job = service.createJob({
        type: JobType.WEEKLY_REPORT_BATCH,
        payload: {},
      });
      const updated = service.updateJobStatus(job.id, JobStatus.PROCESSING);
      expect(updated.status).toBe(JobStatus.PROCESSING);
      service.stop();
    });

    it('sets startedAt when the option is provided', () => {
      const service = makeService();
      const job = service.createJob({
        type: JobType.WEEKLY_REPORT_BATCH,
        payload: {},
      });
      const startedAt = new Date();
      const updated = service.updateJobStatus(job.id, JobStatus.PROCESSING, {
        startedAt,
      });
      expect(updated.startedAt).toEqual(startedAt);
      service.stop();
    });

    it('sets completedAt when the option is provided', () => {
      const service = makeService();
      const job = service.createJob({
        type: JobType.WEEKLY_REPORT_BATCH,
        payload: {},
      });
      const completedAt = new Date();
      const updated = service.updateJobStatus(job.id, JobStatus.COMPLETED, {
        completedAt,
      });
      expect(updated.completedAt).toEqual(completedAt);
      service.stop();
    });

    it('increments retryCount when incrementRetryCount is true', () => {
      const service = makeService();
      const job = service.createJob({
        type: JobType.WEEKLY_REPORT_BATCH,
        payload: {},
      });
      const updated = service.updateJobStatus(job.id, JobStatus.PENDING, {
        incrementRetryCount: true,
      });
      expect(updated.retryCount).toBe(1);
      service.stop();
    });

    it('sets errorMessage when provided', () => {
      const service = makeService();
      const job = service.createJob({
        type: JobType.WEEKLY_REPORT_BATCH,
        payload: {},
      });
      const updated = service.updateJobStatus(job.id, JobStatus.FAILED, {
        errorMessage: 'something broke',
      });
      expect(updated.errorMessage).toBe('something broke');
      service.stop();
    });

    it('throws ServiceLayerException for unknown jobId', () => {
      const service = makeService();
      expect(() =>
        service.updateJobStatus('nonexistent-id', JobStatus.PROCESSING),
      ).toThrow();
      service.stop();
    });
  });

  describe('startProcessing', () => {
    it('marks job as PROCESSING and sets startedAt', () => {
      const service = makeService();
      const job = service.createJob({
        type: JobType.WEEKLY_REPORT_BATCH,
        payload: {},
      });
      const updated = service.startProcessing(job.id);
      expect(updated.status).toBe(JobStatus.PROCESSING);
      expect(updated.startedAt).toBeDefined();
      service.stop();
    });
  });

  describe('completeJob', () => {
    it('marks job as COMPLETED and sets completedAt', () => {
      const service = makeService();
      const job = service.createJob({
        type: JobType.WEEKLY_REPORT_BATCH,
        payload: {},
      });
      const updated = service.completeJob(job.id);
      expect(updated.status).toBe(JobStatus.COMPLETED);
      expect(updated.completedAt).toBeDefined();
      service.stop();
    });
  });

  describe('failJob', () => {
    it('marks job as FAILED with an error message', () => {
      const service = makeService();
      const job = service.createJob({
        type: JobType.WEEKLY_REPORT_BATCH,
        payload: {},
      });
      const failed = service.failJob(job.id, 'timeout');
      expect(failed.status).toBe(JobStatus.FAILED);
      expect(failed.errorMessage).toBe('timeout');
      service.stop();
    });
  });

  describe('updateJobMetadata', () => {
    it('merges new metadata into existing', () => {
      const service = makeService();
      const job = service.createJob({
        type: JobType.WEEKLY_REPORT_BATCH,
        payload: {},
        metadata: { existing: true },
      });
      const updated = service.updateJobMetadata(job.id, {
        childJobIds: ['c-1'],
      });
      expect(updated.metadata?.existing).toBe(true);
      expect(updated.metadata?.childJobIds).toEqual(['c-1']);
      service.stop();
    });
  });

  describe('retryJob', () => {
    it('increments retryCount and resets status to PENDING', () => {
      const service = makeService();
      const job = service.createJob({
        type: JobType.DAILY_SUGGESTION_SINGLE,
        payload: { userId: 'u-1' },
      });
      const retried = service.retryJob(job.id, 'temporary failure');
      expect(retried.retryCount).toBe(1);
      expect(retried.status).toBe(JobStatus.PENDING);
      expect(retried.errorMessage).toBe('temporary failure');
      service.stop();
    });

    it('schedules the retry in the future', () => {
      const service = makeService();
      const before = new Date();
      const job = service.createJob({
        type: JobType.DAILY_SUGGESTION_SINGLE,
        payload: {},
      });
      const retried = service.retryJob(job.id, 'error');
      expect(retried.scheduledAt.getTime()).toBeGreaterThanOrEqual(
        before.getTime(),
      );
      service.stop();
    });
  });

  describe('getJob', () => {
    it('returns the job when found', () => {
      const service = makeService();
      const job = service.createJob({
        type: JobType.WEEKLY_REPORT_BATCH,
        payload: {},
      });
      expect(service.getJob(job.id)).not.toBeNull();
      service.stop();
    });

    it('returns null when not found', () => {
      const service = makeService();
      expect(service.getJob('does-not-exist')).toBeNull();
      service.stop();
    });
  });

  describe('getJobWithAggregatedStatus', () => {
    it('returns null when job does not exist', () => {
      const service = makeService();
      expect(service.getJobWithAggregatedStatus('nonexistent')).toBeNull();
      service.stop();
    });

    it('returns { job } when job has no childJobIds metadata', () => {
      const service = makeService();
      const job = service.createJob({
        type: JobType.WEEKLY_REPORT_BATCH,
        payload: {},
      });
      const result = service.getJobWithAggregatedStatus(job.id);
      expect(result?.job.id).toBe(job.id);
      expect(result?.progress).toBeUndefined();
      service.stop();
    });

    it('returns { job } when childJobIds is an empty array', () => {
      const service = makeService();
      const job = service.createJob({
        type: JobType.WEEKLY_REPORT_BATCH,
        payload: {},
      });
      service.updateJobMetadata(job.id, { childJobIds: [] });
      const result = service.getJobWithAggregatedStatus(job.id);
      expect(result?.progress).toBeUndefined();
      service.stop();
    });

    it('aggregates child job progress', () => {
      const service = makeService();
      const parent = service.createJob({
        type: JobType.WEEKLY_REPORT_BATCH,
        payload: {},
      });
      const childA = service.createJob({
        type: JobType.WEEKLY_REPORT_SINGLE,
        payload: {},
      });
      const childB = service.createJob({
        type: JobType.WEEKLY_REPORT_SINGLE,
        payload: {},
      });

      service.updateJobMetadata(parent.id, {
        childJobIds: [childA.id, childB.id],
      });
      service.completeJob(childA.id);
      service.failJob(childB.id, 'error');

      const result = service.getJobWithAggregatedStatus(parent.id);
      expect(result?.progress?.completed).toBe(1);
      expect(result?.progress?.failed).toBe(1);
      expect(result?.job.status).toBe(JobStatus.FAILED);
      service.stop();
    });

    it('marks aggregated status as COMPLETED when all children complete', () => {
      const service = makeService();
      const parent = service.createJob({
        type: JobType.WEEKLY_REPORT_BATCH,
        payload: {},
      });
      const child = service.createJob({
        type: JobType.WEEKLY_REPORT_SINGLE,
        payload: {},
      });
      service.updateJobMetadata(parent.id, { childJobIds: [child.id] });
      service.completeJob(child.id);
      const result = service.getJobWithAggregatedStatus(parent.id);
      expect(result?.job.status).toBe(JobStatus.COMPLETED);
      service.stop();
    });

    it('counts PENDING children in progress.pending', () => {
      const service = makeService();
      const parent = service.createJob({
        type: JobType.WEEKLY_REPORT_BATCH,
        payload: {},
      });
      const child = service.createJob({
        type: JobType.WEEKLY_REPORT_SINGLE,
        payload: {},
      });
      service.updateJobMetadata(parent.id, { childJobIds: [child.id] });
      const result = service.getJobWithAggregatedStatus(parent.id);
      expect(result?.progress?.pending).toBe(1);
      service.stop();
    });

    it('marks aggregated status as PROCESSING when children are still pending', () => {
      const service = makeService();
      const parent = service.createJob({
        type: JobType.WEEKLY_REPORT_BATCH,
        payload: {},
      });
      const childA = service.createJob({
        type: JobType.WEEKLY_REPORT_SINGLE,
        payload: {},
      });
      const childB = service.createJob({
        type: JobType.WEEKLY_REPORT_SINGLE,
        payload: {},
      });
      service.updateJobMetadata(parent.id, {
        childJobIds: [childA.id, childB.id],
      });
      service.completeJob(childA.id); // one done, one pending
      const result = service.getJobWithAggregatedStatus(parent.id);
      expect(result?.job.status).toBe(JobStatus.PROCESSING);
      service.stop();
    });
  });

  describe('queryJobs', () => {
    it('returns all jobs when no filters are applied', () => {
      const service = makeService();
      service.createJob({ type: JobType.WEEKLY_REPORT_BATCH, payload: {} });
      service.createJob({ type: JobType.DAILY_SUGGESTION_BATCH, payload: {} });
      expect(service.queryJobs().length).toBe(2);
      service.stop();
    });

    it('filters by status', () => {
      const service = makeService();
      const j1 = service.createJob({
        type: JobType.WEEKLY_REPORT_BATCH,
        payload: {},
      });
      service.createJob({ type: JobType.DAILY_SUGGESTION_BATCH, payload: {} });
      service.completeJob(j1.id);
      const result = service.queryJobs({ status: [JobStatus.COMPLETED] });
      expect(result.length).toBe(1);
      expect(result[0].status).toBe(JobStatus.COMPLETED);
      service.stop();
    });

    it('filters by type', () => {
      const service = makeService();
      service.createJob({ type: JobType.WEEKLY_REPORT_BATCH, payload: {} });
      service.createJob({ type: JobType.DAILY_SUGGESTION_BATCH, payload: {} });
      const result = service.queryJobs({ type: [JobType.WEEKLY_REPORT_BATCH] });
      expect(result.length).toBe(1);
      service.stop();
    });

    it('filters by priority range', () => {
      const service = makeService();
      service.createJob({
        type: JobType.WEEKLY_REPORT_BATCH,
        payload: {},
        priority: 1,
      });
      service.createJob({
        type: JobType.WEEKLY_REPORT_BATCH,
        payload: {},
        priority: 5,
      });
      service.createJob({
        type: JobType.WEEKLY_REPORT_BATCH,
        payload: {},
        priority: 10,
      });
      const result = service.queryJobs({ priority: { min: 3, max: 8 } });
      expect(result.length).toBe(1);
      expect(result[0].priority).toBe(5);
      service.stop();
    });

    it('filters by scheduledBefore and scheduledAfter', () => {
      const service = makeService();
      const past = new Date(Date.now() - 10_000);
      const future = new Date(Date.now() + 10_000);
      service.createJob({
        type: JobType.WEEKLY_REPORT_BATCH,
        payload: {},
        scheduledAt: past,
      });
      service.createJob({
        type: JobType.WEEKLY_REPORT_BATCH,
        payload: {},
        scheduledAt: future,
      });

      const beforeNow = service.queryJobs({ scheduledBefore: new Date() });
      expect(beforeNow.length).toBe(1);

      const afterNow = service.queryJobs({ scheduledAfter: new Date() });
      expect(afterNow.length).toBe(1);
      service.stop();
    });

    it('filters by createdBefore and createdAfter', () => {
      const service = makeService();
      service.createJob({ type: JobType.WEEKLY_REPORT_BATCH, payload: {} });
      const afterFarFuture = service.queryJobs({
        createdAfter: new Date(Date.now() + 100_000),
      });
      expect(afterFarFuture.length).toBe(0);
      const beforeFarFuture = service.queryJobs({
        createdBefore: new Date(Date.now() + 100_000),
      });
      expect(beforeFarFuture.length).toBe(1);
      service.stop();
    });

    it('paginates with offset and limit', () => {
      const service = makeService();
      for (let i = 0; i < 5; i++) {
        service.createJob({ type: JobType.WEEKLY_REPORT_BATCH, payload: {} });
      }
      const page1 = service.queryJobs({ limit: 2, offset: 0 });
      const page2 = service.queryJobs({ limit: 2, offset: 2 });
      expect(page1.length).toBe(2);
      expect(page2.length).toBe(2);
      expect(page1[0].id).not.toBe(page2[0].id);
      service.stop();
    });
  });

  describe('getJobStatistics', () => {
    it('returns zero stats for an empty queue', () => {
      const service = makeService();
      const stats = service.getJobStatistics();
      expect(stats.total).toBe(0);
      expect(stats.pending).toBe(0);
      service.stop();
    });

    it('counts jobs by status correctly', () => {
      const service = makeService();
      service.createJob({ type: JobType.WEEKLY_REPORT_BATCH, payload: {} }); // stays PENDING
      const j2 = service.createJob({
        type: JobType.WEEKLY_REPORT_BATCH,
        payload: {},
      });
      const j3 = service.createJob({
        type: JobType.WEEKLY_REPORT_BATCH,
        payload: {},
      });
      const j4 = service.createJob({
        type: JobType.WEEKLY_REPORT_BATCH,
        payload: {},
      });

      service.startProcessing(j2.id);
      service.completeJob(j3.id);
      service.failJob(j4.id, 'error');

      const stats = service.getJobStatistics();
      expect(stats.total).toBe(4);
      expect(stats.pending).toBe(1);
      expect(stats.processing).toBe(1);
      expect(stats.completed).toBe(1);
      expect(stats.failed).toBe(1);
      service.stop();
    });
  });

  describe('logJobEvent', () => {
    it('stores log entries and can be retrieved via getJobLogs', () => {
      const service = makeService();
      const job = service.createJob({
        type: JobType.WEEKLY_REPORT_BATCH,
        payload: {},
      });
      service.logJobEvent(job.id, LogLevel.INFO, 'test log entry', {
        key: 'value',
      });
      const logs = service.getJobLogs(job.id);
      expect(logs.some((l) => l.includes('test log entry'))).toBe(true);
      service.stop();
    });

    it('logs WARN level entries', () => {
      const service = makeService();
      const job = service.createJob({
        type: JobType.WEEKLY_REPORT_BATCH,
        payload: {},
      });
      // Should not throw
      expect(() =>
        service.logJobEvent(job.id, LogLevel.WARN, 'warning'),
      ).not.toThrow();
      service.stop();
    });

    it('logs ERROR level entries', () => {
      const service = makeService();
      const job = service.createJob({
        type: JobType.WEEKLY_REPORT_BATCH,
        payload: {},
      });
      expect(() =>
        service.logJobEvent(job.id, LogLevel.ERROR, 'fatal error'),
      ).not.toThrow();
      service.stop();
    });
  });

  describe('getJobLogs', () => {
    it('returns empty array for unknown jobId', () => {
      const service = makeService();
      expect(service.getJobLogs('nonexistent')).toEqual([]);
      service.stop();
    });
  });

  describe('stop / cleanup', () => {
    it('stop() clears the cleanup interval without error', () => {
      const service = makeService();
      expect(() => service.stop()).not.toThrow();
    });

    it('cleanup removes completed jobs older than 1 hour', () => {
      jest.useFakeTimers();
      const service = makeService();

      const job = service.createJob({
        type: JobType.WEEKLY_REPORT_BATCH,
        payload: {},
      });
      service.completeJob(job.id);

      // Advance system clock 2 hours so completedAt is in the past
      jest.setSystemTime(Date.now() + 2 * 60 * 60 * 1000);

      // Trigger cleanup interval
      jest.advanceTimersByTime(60 * 60 * 1000 + 1);

      // Job should be cleaned up
      expect(service.getJob(job.id)).toBeNull();
      service.stop();
    });
  });
});
