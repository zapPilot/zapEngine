import { describe, expect, it, vi } from 'vitest';

import {
  BaseWriter,
  createEmptyWriteResult,
  type WriteResult,
} from '../../../../src/core/database/baseWriter.js';

vi.mock('../../../../src/utils/logger.js', async () => {
  const { mockLogger } = await import('../../../setup/mocks.js');
  return mockLogger();
});

vi.mock('../../../../src/config/database.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../../src/config/database.js')>();
  return {
    ...actual,
    getDbPool: vi.fn(),
    getDbClient: vi.fn(),
  };
});

class ExposedWriter extends BaseWriter<{ id: string }> {
  public exposedMergeBatchResult(
    target: WriteResult,
    batchResult: WriteResult,
  ): void {
    this.mergeBatchResult(target, batchResult);
  }

  public exposedAddInsertMetrics(
    result: WriteResult,
    batchSize: number,
    affectedRows: number,
  ): void {
    this.addInsertMetrics(result, batchSize, affectedRows);
  }
}

function writeResult(overrides: Partial<WriteResult> = {}): WriteResult {
  return {
    success: true,
    recordsInserted: 0,
    errors: [],
    ...overrides,
  };
}

describe('BaseWriter coverage', () => {
  it('merges into a target without a duplicatesSkipped counter', () => {
    const writer = new ExposedWriter();
    const target = writeResult({ duplicatesSkipped: undefined });

    writer.exposedMergeBatchResult(
      target,
      writeResult({ recordsInserted: 3, duplicatesSkipped: 2 }),
    );

    expect(target.recordsInserted).toBe(3);
    expect(target.duplicatesSkipped).toBe(2);
  });

  it('accumulates insert metrics onto a result without a duplicatesSkipped counter', () => {
    const writer = new ExposedWriter();
    const result = writeResult({ duplicatesSkipped: undefined });

    writer.exposedAddInsertMetrics(result, 5, 3);

    expect(result.recordsInserted).toBe(3);
    expect(result.duplicatesSkipped).toBe(2);
  });

  it('keeps an explicit empty result at full coverage', () => {
    expect(createEmptyWriteResult()).toEqual({
      success: true,
      recordsInserted: 0,
      errors: [],
      duplicatesSkipped: 0,
    });
  });
});
