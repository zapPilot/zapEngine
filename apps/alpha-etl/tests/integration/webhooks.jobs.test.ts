/**
 * Integration tests for webhook job status endpoints
 * Tests HTTP endpoints using supertest instead of direct handler invocation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import type { ETLJob, ETLJobResult } from '../../src/types/index.js';

// Mock the logger to prevent console output during tests
vi.mock('../../src/utils/logger.js', async () => {
  const { mockLogger } = await import('../setup/mocks.js');
  return mockLogger();
});

// Mock database connection test
vi.mock('../../src/config/database.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/config/database.js')>();
  return {
    ...actual,
    testDatabaseConnection: vi.fn().mockResolvedValue(true),
    getDbPool: vi.fn(() => ({
      query: vi.fn(),
      connect: vi.fn(),
      end: vi.fn()
    }))
  };
});

// Create mock job queue with proper hoisting
const { mockJobQueue } = vi.hoisted(() => {
  const mockJobQueue = {
    getJob: vi.fn(),
    getResult: vi.fn(),
    enqueue: vi.fn(),
  };

  return { mockJobQueue };
});

vi.mock('../../src/modules/core/jobQueue.js', () => ({
  ETLJobQueue: vi.fn().mockImplementation(function ETLJobQueue() {
    return mockJobQueue;
  }),
}));

describe('GET /webhooks/jobs/:jobId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  const createJob = (overrides: Partial<ETLJob> = {}): ETLJob => ({
    jobId: overrides.jobId ?? 'etl_test_job',
    trigger: overrides.trigger ?? 'manual',
    sources: overrides.sources ?? ['defillama'],
    filters: overrides.filters,
    createdAt: overrides.createdAt ?? new Date('2024-01-01T00:00:00Z'),
    status: overrides.status ?? 'pending',
  });

  type SuccessfulResultData = Extract<ETLJobResult, { success: true }>['data'];
  type FailedResultError = Extract<ETLJobResult, { success: false }>['error'];

  const createSuccessResult = (overrides: Partial<SuccessfulResultData> = {}): ETLJobResult => ({
    success: true,
    data: {
      jobId: 'etl_test_job',
      status: 'completed',
      recordsProcessed: 10,
      recordsInserted: 10,
      sourceResults: {},
      duration: 5000,
      completedAt: new Date('2024-01-01T01:00:00Z'),
      ...overrides
    }
  });

  const createFailureResult = (message: string, overrides: Partial<FailedResultError> = {}): ETLJobResult => {
    return {
      success: false,
      error: {
        code: 'API_ERROR',
        message,
        source: 'system',
        ...overrides
      }
    };
  };

  it('should return 404 when job is not found', async () => {
    mockJobQueue.getJob.mockReturnValue(undefined);
    mockJobQueue.getResult.mockReturnValue(undefined);

    const response = await request(app)
      .get('/webhooks/jobs/unknown-job')
      .expect(404);

    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body.error.message).toBe('Job not found');
    expect(response.body.success).toBe(false);
    expect(response.body.timestamp).toBeDefined();
  });

  it('should return 202 while a job is pending', async () => {
    const job = createJob({ status: 'pending' });
    mockJobQueue.getJob.mockReturnValue(job);
    mockJobQueue.getResult.mockReturnValue(undefined);

    const response = await request(app)
      .get(`/webhooks/jobs/${job.jobId}`)
      .expect(202);

    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body.data.status).toBe('pending');
    expect(response.body.data.jobId).toBe(job.jobId);
    expect(response.body.data).not.toHaveProperty('recordsProcessed');
    expect(response.body.timestamp).toBeDefined();
  });

  it('should return 202 while a job is processing', async () => {
    const job = createJob({ status: 'processing' });
    mockJobQueue.getJob.mockReturnValue(job);
    mockJobQueue.getResult.mockReturnValue(undefined);

    const response = await request(app)
      .get(`/webhooks/jobs/${job.jobId}`)
      .expect(202);

    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body.data.status).toBe('processing');
    expect(response.body.data.jobId).toBe(job.jobId);
    expect(response.body.data).not.toHaveProperty('recordsProcessed');
    expect(response.body.timestamp).toBeDefined();
  });

  it('should return 500 when the job status is failed', async () => {
    const job = createJob({ status: 'failed' });
    const result = createFailureResult('timeout');
    mockJobQueue.getJob.mockReturnValue(job);
    mockJobQueue.getResult.mockReturnValue(result);

    const response = await request(app)
      .get(`/webhooks/jobs/${job.jobId}`)
      .expect(500);

    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body.data.status).toBe('failed');
    expect(response.body.error.message).toContain('timeout');
    expect(response.body.timestamp).toBeDefined();
  });

  it('should return 500 when a completed job reports failure in the result', async () => {
    const job = createJob({ status: 'completed' });
    const result = createFailureResult('validation error');
    mockJobQueue.getJob.mockReturnValue(job);
    mockJobQueue.getResult.mockReturnValue(result);

    const response = await request(app)
      .get(`/webhooks/jobs/${job.jobId}`)
      .expect(500);

    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body.data.status).toBe('failed');
    expect(response.body.error.message).toContain('validation error');
    expect(response.body.timestamp).toBeDefined();
  });

  it('should return 206 when inserts are less than processed records', async () => {
    const job = createJob({ status: 'completed' });
    const result = createSuccessResult({
      recordsProcessed: 10,
      recordsInserted: 8,
      errors: ['insert timeout'],
    });
    mockJobQueue.getJob.mockReturnValue(job);
    mockJobQueue.getResult.mockReturnValue(result);

    const response = await request(app)
      .get(`/webhooks/jobs/${job.jobId}`)
      .expect(206);

    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body.data.recordsProcessed).toBe(10);
    expect(response.body.data.recordsInserted).toBe(8);
    expect(response.body.timestamp).toBeDefined();
  });

  it('should return 200 for a fully successful completed job', async () => {
    const job = createJob({ status: 'completed' });
    const result = createSuccessResult({
      recordsProcessed: 5,
      recordsInserted: 5,
      errors: []
    });
    mockJobQueue.getJob.mockReturnValue(job);
    mockJobQueue.getResult.mockReturnValue(result);

    const response = await request(app)
      .get(`/webhooks/jobs/${job.jobId}`)
      .expect(200);

    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body.data.status).toBe('completed');
    expect(response.body.data.recordsProcessed).toBe(5);
    expect(response.body.data.recordsInserted).toBe(5);
    expect(response.body.timestamp).toBeDefined();
  });

  it('should handle server errors gracefully', async () => {
    mockJobQueue.getJob.mockImplementation(() => {
      throw new Error('Database connection failed');
    });

    const response = await request(app)
      .get('/webhooks/jobs/test-job')
      .expect(500);

    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body.error.message).toBe('Failed to retrieve job status');
    expect(response.body.timestamp).toBeDefined();
  });

  it('should include proper headers in all responses', async () => {
    const job = createJob({ status: 'completed' });
    mockJobQueue.getJob.mockReturnValue(job);
    mockJobQueue.getResult.mockReturnValue(createSuccessResult());

    const response = await request(app)
      .get(`/webhooks/jobs/${job.jobId}`)
      .expect(200);

    // Check for helmet security headers
    expect(response.headers).toHaveProperty('x-content-type-options');
    expect(response.headers).toHaveProperty('x-frame-options');
    expect(response.headers).toHaveProperty('x-xss-protection');
    expect(response.headers['content-type']).toMatch(/application\/json/);
  });

  it('should handle concurrent requests properly', async () => {
    const job1 = createJob({ jobId: 'job1', status: 'completed' });
    const job2 = createJob({ jobId: 'job2', status: 'pending' });

    mockJobQueue.getJob.mockImplementation((jobId: string) => {
      if (jobId === 'job1') return job1;
      if (jobId === 'job2') return job2;
      return undefined;
    });

    mockJobQueue.getResult.mockImplementation((jobId: string) => {
      if (jobId === 'job1') return createSuccessResult({ jobId: 'job1' });
      return undefined;
    });

    const requests = [
      request(app).get('/webhooks/jobs/job1'),
      request(app).get('/webhooks/jobs/job2'),
      request(app).get('/webhooks/jobs/nonexistent'),
    ];

    const responses = await Promise.all(requests);

    expect(responses[0].status).toBe(200);
    expect(responses[1].status).toBe(202);
    expect(responses[2].status).toBe(404);
  });
});
