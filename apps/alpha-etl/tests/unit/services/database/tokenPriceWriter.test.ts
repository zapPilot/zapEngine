import { describe, it, expect, vi, beforeEach } from 'vitest';
import { logger } from '../../../../src/utils/logger.js';
import { TokenPriceWriter } from '../../../../src/modules/token-price/index.js';

// Mock logger
vi.mock('../../../../src/utils/logger.js', async () => {
  const { mockLogger } = await import('../../../setup/mocks.js');
  return mockLogger();
});

describe('TokenPriceWriter', () => {
    let writer: TokenPriceWriter;
    let mockClient: { query: ReturnType<typeof vi.fn> };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let withDatabaseClientSpy: any;

    beforeEach(() => {
        mockClient = { query: vi.fn() };
        writer = new TokenPriceWriter();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        withDatabaseClientSpy = vi.spyOn(writer as any, 'withDatabaseClient');
        withDatabaseClientSpy.mockImplementation(async (fn: unknown) => {
            return await (fn as (client: unknown) => Promise<unknown>)(mockClient);
        });
    });

    const createMockPriceData = () => ({
        priceUsd: 50000,
        marketCapUsd: 1000000000000,
        volume24hUsd: 30000000000,
        timestamp: new Date('2024-12-15T12:00:00Z'),
        source: 'coingecko',
        tokenSymbol: 'BTC',
        tokenId: 'bitcoin'
    });

    describe('insertSnapshot', () => {
        it('should insert snapshot successfully', async () => {
            mockClient.query.mockResolvedValue({
                rows: [{ id: 1, snapshot_date: '2024-12-15' }],
                rowCount: 1
            });

            const priceData = createMockPriceData();
            await writer.insertSnapshot(priceData);

            expect(mockClient.query).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO alpha_raw.token_price_snapshots'),
                expect.arrayContaining([50000, 1000000000000, 30000000000, 'coingecko', 'BTC', 'bitcoin'])
            );
        });

        it('should throw error when database insert fails', async () => {
            mockClient.query.mockRejectedValue(new Error('Connection refused'));

            const priceData = createMockPriceData();
            await expect(writer.insertSnapshot(priceData)).rejects.toThrow('Connection refused');
        });

        it('should include raw_data as JSON', async () => {
            mockClient.query.mockResolvedValue({
                rows: [{ id: 1, snapshot_date: '2024-12-15' }],
                rowCount: 1
            });

            const priceData = createMockPriceData();
            await writer.insertSnapshot(priceData);

            const callArgs = mockClient.query.mock.calls[0][1];
            expect(callArgs![8]).toContain('"priceUsd":50000');
        });
    });

    describe('insertBatch', () => {
        it('should insert all snapshots successfully', async () => {
            mockClient.query.mockResolvedValue({
                rows: [{ id: 1 }, { id: 2 }],
                rowCount: 2
            });

            const snapshots = [
                createMockPriceData(),
                { ...createMockPriceData(), timestamp: new Date('2024-12-14T12:00:00Z') }
            ];

            const inserted = await writer.insertBatch(snapshots);

            expect(inserted).toBe(2);
            expect(mockClient.query).toHaveBeenCalledTimes(1);
        });

        it('should fall back to UNKNOWN token symbol when missing', async () => {
            mockClient.query.mockResolvedValue({
                rows: [{ id: 1 }],
                rowCount: 1
            });

            const snapshots = [
                {
                    ...createMockPriceData(),
                    tokenSymbol: undefined as unknown as string
                }
            ];

            const inserted = await writer.insertBatch(snapshots);

            expect(inserted).toBe(1);
        });

        it('should fall back to rows length when rowCount is missing', async () => {
            mockClient.query.mockResolvedValue({
                rows: [{ id: 1 }, { id: 2 }],
            });

            const snapshots = [
                createMockPriceData(),
                { ...createMockPriceData(), timestamp: new Date('2024-12-14T12:00:00Z') }
            ];

            const inserted = await writer.insertBatch(snapshots);

            expect(inserted).toBe(2);
        });

        it('should return 0 when rowCount and rows length are missing', async () => {
            mockClient.query.mockResolvedValue({});

            const snapshots = [createMockPriceData()];

            const inserted = await writer.insertBatch(snapshots);

            expect(inserted).toBe(0);
        });

        it('should throw on batch insert failure', async () => {
            mockClient.query.mockRejectedValue(new Error('Duplicate key'));

            const snapshots = [
                createMockPriceData(),
                { ...createMockPriceData(), timestamp: new Date('2024-12-14T12:00:00Z') },
                { ...createMockPriceData(), timestamp: new Date('2024-12-13T12:00:00Z') }
            ];

            await expect(writer.insertBatch(snapshots)).rejects.toThrow('Duplicate key');
        });

        it('should handle empty array', async () => {
            const inserted = await writer.insertBatch([]);
            expect(inserted).toBe(0);
            expect(mockClient.query).not.toHaveBeenCalled();
        });
    });

    describe('getLatestSnapshot', () => {
        it('should return latest snapshot when exists', async () => {
            mockClient.query.mockResolvedValue({
                rows: [{
                    snapshot_date: new Date('2024-12-15T00:00:00Z'),
                    price_usd: '50000.50',
                    token_symbol: 'BTC'
                }],
                rowCount: 1
            });

            const result = await writer.getLatestSnapshot('BTC');

            expect(result).toEqual({
                date: '2024-12-15',
                price: 50000.50,
                tokenSymbol: 'BTC'
            });
        });

        it('should return null when no snapshots exist', async () => {
            mockClient.query.mockResolvedValue({
                rows: [],
                rowCount: 0
            });

            const result = await writer.getLatestSnapshot('BTC');

            expect(result).toBeNull();
        });

        it('should throw error on database failure', async () => {
            mockClient.query.mockRejectedValue(new Error('Database error'));

            await expect(writer.getLatestSnapshot('BTC')).rejects.toThrow('Database error');
        });

        it('should use default token symbol', async () => {
            mockClient.query.mockResolvedValue({
                rows: [],
                rowCount: 0
            });

            await writer.getLatestSnapshot();

            expect(mockClient.query).toHaveBeenCalledWith(
                expect.any(String),
                ['BTC']
            );
        });
    });

    describe('getSnapshotCount', () => {
        it('should return count when snapshots exist', async () => {
            mockClient.query.mockResolvedValue({
                rows: [{ count: '150' }],
                rowCount: 1
            });

            const count = await writer.getSnapshotCount('BTC');

            expect(count).toBe(150);
        });

        it('should return 0 when no snapshots exist', async () => {
            mockClient.query.mockResolvedValue({
                rows: [{ count: '0' }],
                rowCount: 1
            });

            const count = await writer.getSnapshotCount('ETH');

            expect(count).toBe(0);
        });

        it('should return 0 when count is missing', async () => {
            mockClient.query.mockResolvedValue({
                rows: [],
                rowCount: 0
            });

            const count = await writer.getSnapshotCount('BTC');

            expect(count).toBe(0);
        });

        it('should return 0 on database error', async () => {
            mockClient.query.mockRejectedValue(new Error('Connection lost'));

            const count = await writer.getSnapshotCount('BTC');

            expect(count).toBe(0);
        });

        it('should use default token symbol', async () => {
            mockClient.query.mockResolvedValue({
                rows: [{ count: '10' }],
                rowCount: 1
            });

            await writer.getSnapshotCount();

            expect(mockClient.query).toHaveBeenCalledWith(
                expect.any(String),
                ['BTC']
            );
        });
    });

    describe('getExistingDatesInRange', () => {
        it('should return existing dates in range without timezone shift', async () => {
            const mockRows = [
                { snapshot_date: '2024-12-01' },
                { snapshot_date: '2024-12-03' },
                { snapshot_date: '2024-12-05' }
            ];

            mockClient.query.mockResolvedValue({
                rows: mockRows,
                rowCount: 3
            });

            const result = await writer.getExistingDatesInRange(
                new Date('2024-12-01'),
                new Date('2024-12-05'),
                'BTC',
                'coingecko'
            );

            expect(result).toEqual(['2024-12-01', '2024-12-03', '2024-12-05']);
            expect(mockClient.query).toHaveBeenCalledWith(
                expect.stringContaining('to_char(snapshot_date'),
                ['coingecko', 'BTC', '2024-12-01', '2024-12-05']
            );
        });

        it('should return empty array when no dates exist', async () => {
            mockClient.query.mockResolvedValue({
                rows: [],
                rowCount: 0
            });

            const result = await writer.getExistingDatesInRange(
                new Date('2024-12-01'),
                new Date('2024-12-05'),
                'BTC'
            );

            expect(result).toEqual([]);
        });

        it('should handle database errors gracefully', async () => {
            mockClient.query.mockRejectedValue(
                new Error('Database connection failed')
            );

            const result = await writer.getExistingDatesInRange(
                new Date('2024-12-01'),
                new Date('2024-12-05'),
                'BTC'
            );

            expect(result).toEqual([]); // Fallback to empty array
        });

        it('should use correct SQL parameters', async () => {
            mockClient.query.mockResolvedValue({
                rows: [],
                rowCount: 0
            });

            await writer.getExistingDatesInRange(
                new Date('2024-11-01'),
                new Date('2024-11-30'),
                'ETH',
                'coingecko'
            );

            expect(mockClient.query).toHaveBeenCalledWith(
                expect.any(String),
                ['coingecko', 'ETH', '2024-11-01', '2024-11-30']
            );
        });

        it('should use default parameters when not provided', async () => {
            mockClient.query.mockResolvedValue({
                rows: [],
                rowCount: 0
            });

            await writer.getExistingDatesInRange(
                new Date('2024-12-01'),
                new Date('2024-12-05')
            );

            expect(mockClient.query).toHaveBeenCalledWith(
                expect.any(String),
                ['coingecko', 'BTC', '2024-12-01', '2024-12-05']
            );
        });

        it('should return dates as strings from PostgreSQL to_char()', async () => {
            const mockRows = [
                { snapshot_date: '2024-12-01' },
                { snapshot_date: '2024-12-02' }
            ];

            mockClient.query.mockResolvedValue({
                rows: mockRows,
                rowCount: 2
            });

            const result = await writer.getExistingDatesInRange(
                new Date('2024-12-01'),
                new Date('2024-12-05'),
                'BTC'
            );

            expect(result).toEqual(['2024-12-01', '2024-12-02']);
        });

        it('should query with correct date order', async () => {
            mockClient.query.mockResolvedValue({
                rows: [],
                rowCount: 0
            });

            await writer.getExistingDatesInRange(
                new Date('2024-12-01'),
                new Date('2024-12-31'),
                'SOL'
            );

            expect(mockClient.query).toHaveBeenCalledWith(
                expect.stringContaining('ORDER BY snapshot_date ASC'),
                expect.any(Array)
            );
        });

        describe('timezone independence', () => {
            it('should not shift dates regardless of server timezone', async () => {
                const mockRows = [
                    { snapshot_date: '2025-12-16' },
                    { snapshot_date: '2025-12-17' }
                ];

                mockClient.query.mockResolvedValue({
                    rows: mockRows,
                    rowCount: 2
                });

                const result = await writer.getExistingDatesInRange(
                    new Date('2025-12-15'),
                    new Date('2025-12-18'),
                    'BTC',
                    'coingecko'
                );

                expect(result).toEqual(['2025-12-16', '2025-12-17']);
            });

            it('should handle date boundaries correctly without off-by-one errors', async () => {
                const mockRows = [
                    { snapshot_date: '2024-11-30' },
                    { snapshot_date: '2024-12-01' },
                    { snapshot_date: '2024-12-31' }
                ];

                mockClient.query.mockResolvedValue({
                    rows: mockRows,
                    rowCount: 3
                });

                const result = await writer.getExistingDatesInRange(
                    new Date('2024-11-30'),
                    new Date('2024-12-31'),
                    'BTC',
                    'coingecko'
                );

                expect(result).toEqual(['2024-11-30', '2024-12-01', '2024-12-31']);
            });

            it('should return all dates as YYYY-MM-DD strings (never Date objects)', async () => {
                const mockRows = [
                    { snapshot_date: '2025-01-15' },
                    { snapshot_date: '2025-01-16' }
                ];

                mockClient.query.mockResolvedValue({
                    rows: mockRows,
                    rowCount: 2
                });

                const result = await writer.getExistingDatesInRange(
                    new Date('2025-01-15'),
                    new Date('2025-01-16'),
                    'BTC',
                    'coingecko'
                );

                result.forEach(date => {
                    expect(typeof date).toBe('string');
                    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
                });
            });

            it('should use to_char() in SQL query for timezone-safe formatting', async () => {
                mockClient.query.mockResolvedValue({
                    rows: [],
                    rowCount: 0
                });

                await writer.getExistingDatesInRange(
                    new Date('2025-12-01'),
                    new Date('2025-12-05'),
                    'BTC',
                    'coingecko'
                );

                expect(mockClient.query).toHaveBeenCalledWith(
                    expect.stringMatching(/to_char\(snapshot_date,\s*'YYYY-MM-DD'\)/),
                    expect.any(Array)
                );
            });

            it('should handle year boundaries without timezone shift', async () => {
                const mockRows = [
                    { snapshot_date: '2024-12-31' },
                    { snapshot_date: '2025-01-01' }
                ];

                mockClient.query.mockResolvedValue({
                    rows: mockRows,
                    rowCount: 2
                });

                const result = await writer.getExistingDatesInRange(
                    new Date('2024-12-31'),
                    new Date('2025-01-01'),
                    'BTC',
                    'coingecko'
                );

                expect(result).toEqual(['2024-12-31', '2025-01-01']);
            });
        });
    });

    describe('error logging', () => {
        it('should throw "Unknown insert error" when executeBatchWrite returns empty errors', async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            vi.spyOn(writer as any, 'executeBatchWrite').mockResolvedValueOnce({
                success: false,
                errors: [],
                recordsInserted: 0,
                duplicatesSkipped: 0,
            });

            const priceData = createMockPriceData();
            await expect(writer.insertSnapshot(priceData)).rejects.toThrow('Unknown insert error');
        });

        it('should log error context when insertSnapshot fails', async () => {
            mockClient.query.mockRejectedValue(new Error('insert failed'));

            const priceData = createMockPriceData();
            await expect(writer.insertSnapshot(priceData)).rejects.toThrow('insert failed');
            expect(logger.error).toHaveBeenCalledWith(
                'Failed to save token price snapshot',
                expect.objectContaining({ error: 'insert failed', tokenSymbol: 'BTC' })
            );
        });

        it('should log error context when getLatestSnapshot fails', async () => {
            mockClient.query.mockRejectedValue(new Error('query failed'));

            await expect(writer.getLatestSnapshot('BTC')).rejects.toThrow('query failed');
            expect(logger.error).toHaveBeenCalledWith(
                'Failed to get latest snapshot',
                expect.objectContaining({ tokenSymbol: 'BTC', error: 'query failed' })
            );
        });

        it('should log error context when getSnapshotCount fails', async () => {
            mockClient.query.mockRejectedValue(new Error('count failed'));

            await writer.getSnapshotCount('BTC');

            expect(logger.error).toHaveBeenCalledWith(
                'Failed to get snapshot count',
                expect.objectContaining({ tokenSymbol: 'BTC', error: 'count failed' })
            );
        });

        it('should log error context when getExistingDatesInRange fails', async () => {
            mockClient.query.mockRejectedValue(new Error('range query failed'));

            await writer.getExistingDatesInRange(
                new Date('2023-01-01'),
                new Date('2023-12-31'),
                'BTC',
                'coingecko'
            );

            expect(logger.error).toHaveBeenCalledWith(
                'Failed to get existing dates in range',
                expect.objectContaining({ tokenSymbol: 'BTC', error: 'range query failed' })
            );
        });
    });
});
