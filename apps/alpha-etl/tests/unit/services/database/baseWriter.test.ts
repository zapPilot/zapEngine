/**
 * Unit tests for BaseWriter class
 * Tests batch processing and error paths
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Hoisted mocks
const { mockLogger } = vi.hoisted(() => ({
    mockLogger: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
    },
}));

vi.mock('../../../../src/utils/logger.js', () => ({
    logger: mockLogger,
}));

// Mock the database module
vi.mock('../../../../src/config/database.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../../../src/config/database.js')>();
    return {
        ...actual,
        getDbPool: vi.fn(),
        getDbClient: vi.fn(),
    };
});

describe('BaseWriter', () => {
    let TestWriter: unknown;

    beforeEach(async () => {
        vi.clearAllMocks();

        // Create a concrete test implementation of BaseWriter
        const { BaseWriter } = await import('../../../../src/core/database/baseWriter.js');

        const { createEmptyWriteResult } = await import('../../../../src/core/database/baseWriter.js');

        class ConcreteTestWriter extends BaseWriter<{ id: string; value: number }> {
            public async testProcessBatches(
                records: { id: string; value: number }[],
                writeBatch: (batch: { id: string; value: number }[], batchNumber: number) => Promise<unknown>,
                logContext: string
            ) {
                return this.processBatches(records, writeBatch, logContext);
            }

            public testCreateEmptyWriteResult() {
                return createEmptyWriteResult();
            }
        }

        TestWriter = new ConcreteTestWriter();
    });

    describe('createEmptyWriteResult', () => {
        it('should return a fresh WriteResult object', () => {
            const result = TestWriter.testCreateEmptyWriteResult();
            expect(result).toEqual({
                success: true,
                recordsInserted: 0,
                duplicatesSkipped: 0,
                errors: [],
            });
        });
    });

    describe('processBatches', () => {
        it('should return empty result for empty records array', async () => {
            const writeBatch = vi.fn();
            const result = await TestWriter.testProcessBatches([], writeBatch, 'test batches');

            expect(result).toEqual({
                success: true,
                recordsInserted: 0,
                duplicatesSkipped: 0,
                errors: [],
            });
            expect(writeBatch).not.toHaveBeenCalled();
        });

        it('should handle exception in writeBatch', async () => {
            const records = [{ id: '1', value: 100 }];
            const writeBatch = vi.fn().mockRejectedValue(new Error('Database connection lost'));

            const result = await TestWriter.testProcessBatches(records, writeBatch, 'test batches');

            expect(result.success).toBe(false);
            expect(result.errors).toContain('Database connection lost');
            expect(mockLogger.error).toHaveBeenCalled();
        });

        it('should aggregate results from multiple batches', async () => {
            const records = Array.from({ length: 10 }, (_, i) => ({ id: `${i}`, value: i * 10 }));

            // Set batch size to 5 to force multiple batches
            TestWriter.batchSize = 5;

            const writeBatch = vi.fn()
                .mockResolvedValueOnce({
                    success: true,
                    recordsInserted: 5,
                    duplicatesSkipped: 1,
                    errors: [],
                })
                .mockResolvedValueOnce({
                    success: true,
                    recordsInserted: 4,
                    duplicatesSkipped: 2,
                    errors: [],
                });

            const result = await TestWriter.testProcessBatches(records, writeBatch, 'test batches');

            expect(result.success).toBe(true);
            expect(result.recordsInserted).toBe(9);
            expect(result.duplicatesSkipped).toBe(3);
            expect(writeBatch).toHaveBeenCalledTimes(2);
        });

        it('should mark overall success as false if any batch fails', async () => {
            const records = Array.from({ length: 10 }, (_, i) => ({ id: `${i}`, value: i * 10 }));
            TestWriter.batchSize = 5;

            const writeBatch = vi.fn()
                .mockResolvedValueOnce({
                    success: true,
                    recordsInserted: 5,
                    errors: [],
                })
                .mockResolvedValueOnce({
                    success: false,
                    recordsInserted: 0,
                    errors: ['Batch 2 failed'],
                });

            const result = await TestWriter.testProcessBatches(records, writeBatch, 'test batches');

            expect(result.success).toBe(false);
            expect(result.recordsInserted).toBe(5);
            expect(result.errors).toContain('Batch 2 failed');
        });

        it('should handle non-Error exception in writeBatch', async () => {
            const records = [{ id: '1', value: 100 }];
            const writeBatch = vi.fn().mockRejectedValue('String error');

            const result = await TestWriter.testProcessBatches(records, writeBatch, 'test batches');

            expect(result.success).toBe(false);
            expect(result.errors).toContain('Unknown error');
        });
    });
});
