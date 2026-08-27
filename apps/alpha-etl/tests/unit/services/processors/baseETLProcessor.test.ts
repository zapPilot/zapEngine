import { describe, it, expect, vi } from 'vitest';
import { executeETLFlow } from '../../../../src/core/processors/baseETLProcessor.js';
import { wrapHealthCheck } from '../../../../src/utils/healthCheck.js';
import { logger } from '../../../../src/utils/logger.js';
import { createEtlJob } from '../../../utils/createEtlJob.js';

vi.mock('../../../../src/utils/logger.js', async () => {
  const { mockLogger } = await import('../../../setup/mocks.js');
  return mockLogger();
});

describe('BaseETLProcessor - executeETLFlow', () => {
  const mockJob = createEtlJob({
    jobId: 'test-job',
    filters: {},
    createdAt: new Date(),
    status: 'pending',
  });

  async function runFlow<TRaw, TTransformed>(
    fetchFn: () => Promise<TRaw[]>,
    transformFn: (raw: TRaw[]) => Promise<TTransformed[]>,
    writeFn: (
      data: TTransformed[],
    ) => Promise<{
      success: boolean;
      recordsInserted: number;
      errors: string[];
    }>,
  ) {
    return executeETLFlow(
      mockJob,
      'test-source',
      fetchFn,
      transformFn,
      writeFn,
    );
  }

  it('should fail if fetch returns empty array and empties are not allowed', async () => {
    const fetchFn = vi.fn().mockResolvedValue([]);
    const transformFn = vi.fn();
    const writeFn = vi.fn();

    const result = await runFlow(fetchFn, transformFn, writeFn);

    expect(result.success).toBe(false);
    expect(result.errors).toEqual(['No data fetched from test-source']);
    expect(result.recordsProcessed).toBe(0);
    expect(result.recordsInserted).toBe(0);
    expect(transformFn).not.toHaveBeenCalled();
    expect(writeFn).not.toHaveBeenCalled();
  });

  it('should fail if transform returns empty array and empties are not allowed', async () => {
    const fetchFn = vi.fn().mockResolvedValue(['raw-data']);
    const transformFn = vi.fn().mockResolvedValue([]);
    const writeFn = vi.fn();

    const result = await runFlow(fetchFn, transformFn, writeFn);

    expect(result.success).toBe(false);
    expect(result.errors).toEqual([
      'No valid data after transformation for test-source',
    ]);
    expect(result.recordsProcessed).toBe(1);
    expect(result.recordsInserted).toBe(0);
    expect(writeFn).not.toHaveBeenCalled();
  });

  it('should handle write failure', async () => {
    const fetchFn = vi.fn().mockResolvedValue(['raw-data']);
    const transformFn = vi.fn().mockResolvedValue(['transformed-data']);
    const writeFn = vi.fn().mockResolvedValue({
      success: false,
      recordsInserted: 0,
      errors: ['Database error'],
      duplicatesSkipped: 0,
    });

    const result = await runFlow(fetchFn, transformFn, writeFn);

    expect(result.success).toBe(false);
    expect(result.recordsInserted).toBe(0);
    expect(result.errors).toEqual(['Database error']);
  });

  it('should catch unknown errors during execution', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('Network error'));
    const transformFn = vi.fn();
    const writeFn = vi.fn();

    const result = await runFlow(fetchFn, transformFn, writeFn);

    expect(result.success).toBe(false);
    expect(result.errors).toEqual(['Network error']);
  });

  it('should pass empty fetch to transform when allowEmptyFetch=true', async () => {
    const mockTransform = vi.fn().mockResolvedValue(['derived']);
    const result = await executeETLFlow(
      mockJob,
      'test-source',
      async () => [],
      mockTransform,
      async () => ({ success: true, recordsInserted: 1, errors: [] }),
      { allowEmptyFetch: true },
    );

    expect(result.success).toBe(true);
    expect(mockTransform).toHaveBeenCalledWith([]);
  });

  it('should pass empty transform to write when allowEmptyTransform=true', async () => {
    const mockWrite = vi
      .fn()
      .mockResolvedValue({ success: true, recordsInserted: 0, errors: [] });
    const result = await executeETLFlow(
      mockJob,
      'test-source',
      async () => ['data'],
      async () => [],
      mockWrite,
      { allowEmptyTransform: true },
    );

    expect(result.success).toBe(true);
    expect(mockWrite).toHaveBeenCalledWith([]);
  });

  it('should log an error when fetch returns empty array', async () => {
    await runFlow(vi.fn().mockResolvedValue([]), vi.fn(), vi.fn());

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('No data fetched'),
      expect.any(Object),
    );
  });

  it('should log an error when transform returns empty array', async () => {
    await runFlow(
      vi.fn().mockResolvedValue(['data']),
      vi.fn().mockResolvedValue([]),
      vi.fn(),
    );

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('No valid data after transformation'),
      expect.any(Object),
    );
  });
});

describe('wrapHealthCheck', () => {
  it('should return healthy status', async () => {
    const result = await wrapHealthCheck(async () => ({
      status: 'healthy',
      details: 'OK',
    }));
    expect(result.status).toBe('healthy');
    expect(result.details).toBe('OK');
  });

  it('should return unhealthy status on exception', async () => {
    const result = await wrapHealthCheck(async () => {
      throw new Error('Check Fail');
    });
    expect(result.status).toBe('unhealthy');
  });
});
