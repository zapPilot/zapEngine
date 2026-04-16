// tests/unit/services/fetchers/hyperliquid.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HyperliquidFetcher } from '../../../../src/modules/hyperliquid/fetcher.js';
import { logger } from '../../../../src/utils/logger.js';
import { APIError } from '../../../../src/utils/errors.js';

vi.mock('../../../../src/utils/logger.js', async () => {
  const { mockLogger } = await import('../../../setup/mocks.js');
  return mockLogger();
});

describe('HyperliquidFetcher', () => {
    let fetcher: HyperliquidFetcher;
    const mockFetch = vi.fn();

    // Helper to create valid vault details response
    const createValidVaultResponse = (overrides = {}) => ({
        vaultAddress: '0xdfc24b077bc1425ad1dea75bcb6f8158e10df303',
        leader: '0x123',
        apr: 0.15,
        totalVlm: 1000000,
        name: 'Test Vault',
        description: 'Test Description',
        leaderCommission: 0.1,
        leaderFraction: 0.5,
        maxDistributable: 1000,
        maxWithdrawable: 1000,
        followerState: null,
        followers: [],
        relationship: { type: 'follower' },
        totalFollowers: 10,
        isClosed: false,
        allowDeposits: true,
        ...overrides
    });

    beforeEach(() => {
        mockFetch.mockReset();
        vi.clearAllMocks();
        global.fetch = mockFetch;
        // Set maxRetries to 1 for faster testing
        fetcher = new HyperliquidFetcher({ maxRetries: 1, retryDelayMs: 0 });
    });

    describe('healthCheck', () => {
        it('returns healthy when API responds correctly', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(createValidVaultResponse())
            });

            const result = await fetcher.healthCheck();
            expect(result.status).toBe('healthy');
            expect(logger.error).not.toHaveBeenCalled();
        });

        it('returns unhealthy on API error', async () => {
            mockFetch.mockImplementation(() => Promise.reject(new Error('API Fail')));
            const result = await fetcher.healthCheck();
            expect(result.status).toBe('unhealthy');
            expect(result.details).toContain('API Fail');
        });

        it('returns unhealthy on non-ok response', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 500,
                statusText: 'Internal Server Error'
            });

            const result = await fetcher.healthCheck();
            expect(result.status).toBe('unhealthy');
        });
    });

    describe('getVaultDetails', () => {
        const userWallet = '0xuser123';
        const vaultAddress = '0xdfc24b077bc1425ad1dea75bcb6f8158e10df303';

        it('successfully fetches and validates vault details', async () => {
            const mockResponse = createValidVaultResponse({
                followerState: {
                    user: userWallet,
                    vaultAddress,
                    totalAccountValue: 5000,
                    vaultEquity: 4800,
                    maxWithdrawable: 4000,
                    maxDistributable: 3000,
                    pnl: 200,
                    allTimePnl: 500
                }
            });

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockResponse)
            });

            const result = await fetcher.getVaultDetails(userWallet, vaultAddress);

            expect(result.vaultAddress).toBe(vaultAddress);
            expect(result.leader).toBe('0x123');
            expect(result.apr).toBe(0.15);
            expect(result.followerState).toBeDefined();
            expect(result.followerState?.user).toBe(userWallet);
        });

        it('handles response with all optional fields missing (minimal valid)', async () => {
            const minimalResponse = {
                vaultAddress: '0xdfc24b077bc1425ad1dea75bcb6f8158e10df303',
                leader: '0x123',
                apr: 0.15,
                followerState: null
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(minimalResponse)
            });

            const result = await fetcher.getVaultDetails(userWallet);

            expect(result.vaultAddress).toBe('0xdfc24b077bc1425ad1dea75bcb6f8158e10df303');
            expect(result.leader).toBe('0x123');
            expect(result.apr).toBe(0.15);
            expect(result.name).toBeUndefined();
            expect(result.description).toBeUndefined();
        });

        it('throws APIError on Zod validation failure', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    vaultAddress: '0xtest',
                    // Missing required 'leader' field
                    apr: 'invalid' // Invalid type
                })
            });

            await expect(
                fetcher.getVaultDetails(userWallet, vaultAddress)
            ).rejects.toThrow(APIError);

            expect(logger.error).toHaveBeenCalled();
        });

        it('handles non-Error objects in catch block', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    vaultAddress: '0xtest',
                    leader: '0x123',
                    apr: NaN // Will fail Zod validation
                })
            });

            await expect(
                fetcher.getVaultDetails(userWallet, vaultAddress)
            ).rejects.toThrow();
        });

        it('handles numeric preprocessing with string values', async () => {
            const responseWithStringNumbers = createValidVaultResponse({
                apr: '0.25', // String that should be converted
                totalVlm: '2000000', // String that should be converted
                leaderCommission: '0.15'
            });

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(responseWithStringNumbers)
            });

            const result = await fetcher.getVaultDetails(userWallet, vaultAddress);

            expect(result.apr).toBe(0.25);
            expect(result.totalVlm).toBe(2000000);
            expect(result.leaderCommission).toBe(0.15);
        });

        it('handles numeric preprocessing with non-finite string values', async () => {
            const responseWithInvalidNumbers = {
                vaultAddress: '0xdfc24b077bc1425ad1dea75bcb6f8158e10df303',
                leader: '0x123',
                apr: 'not-a-number', // Non-finite string
                followerState: null
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(responseWithInvalidNumbers)
            });

            await expect(
                fetcher.getVaultDetails(userWallet, vaultAddress)
            ).rejects.toThrow(APIError);
        });

        it('handles numeric preprocessing with non-string numeric values', async () => {
            const responseWithNumericValues = createValidVaultResponse({
                apr: 0.35, // Already a number
                totalVlm: 3000000, // Already a number
                followerState: {
                    user: userWallet,
                    totalAccountValue: 8000, // Already a number
                    vaultEquity: 7500
                }
            });

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(responseWithNumericValues)
            });

            const result = await fetcher.getVaultDetails(userWallet, vaultAddress);

            expect(result.apr).toBe(0.35);
            expect(result.totalVlm).toBe(3000000);
            expect(result.followerState?.totalAccountValue).toBe(8000);
        });

        it('handles optionalNumeric with null/undefined values', async () => {
            const responseWithNulls = createValidVaultResponse({
                leaderCommission: null as unknown,
                leaderFraction: undefined,
                totalVlm: null as unknown,
                followerState: {
                    user: userWallet,
                    totalAccountValue: 5000,
                    maxWithdrawable: null as unknown,
                    pnl: undefined
                }
            });

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(responseWithNulls)
            });

            const result = await fetcher.getVaultDetails(userWallet, vaultAddress);

            expect(result.leaderCommission).toBeUndefined();
            expect(result.leaderFraction).toBeUndefined();
            expect(result.totalVlm).toBeUndefined();
        });
    });

    describe('getVaultDetailsForUsers', () => {
        it('batch processes multiple users successfully', async () => {
            const users = ['0xuser1', '0xuser2', '0xuser3'];

            // Mock 3 successful responses
            users.forEach(() => {
                mockFetch.mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve(createValidVaultResponse())
                });
            });

            const results = await fetcher.getVaultDetailsForUsers(users);

            expect(results).toHaveLength(3);
            expect(mockFetch).toHaveBeenCalledTimes(3);
        });

        it('handles partial failures (2/3 users succeed)', async () => {
            const users = ['0xuser1', '0xuser2', '0xuser3'];

            // First user succeeds
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(createValidVaultResponse())
            });

            // Second user fails
            mockFetch.mockRejectedValueOnce(new Error('Network error'));

            // Third user succeeds
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(createValidVaultResponse())
            });

            const results = await fetcher.getVaultDetailsForUsers(users);

            expect(results).toHaveLength(2); // Only 2 succeeded
            expect(logger.error).toHaveBeenCalled();
        });

        it('throws when all users fail', async () => {
            const users = ['0xuser1', '0xuser2'];

            // Both fail (each will be retried once due to maxRetries: 1)
            mockFetch.mockRejectedValue(new Error('Fail'));

            await expect(
                fetcher.getVaultDetailsForUsers(users)
            ).rejects.toThrow(APIError);

            // Should be called at least 2 times (once for each user failure)
            expect(logger.error).toHaveBeenCalled();
        });
    });

    describe('extractPositionData', () => {
        const userWallet = '0xuser123';

        it('extracts position data with valid followerState', async () => {
            const vaultDetails = createValidVaultResponse({
                followerState: {
                    user: userWallet,
                    vaultAddress: '0xvault',
                    totalAccountValue: 10000,
                    vaultEquity: 9500,
                    maxWithdrawable: 8000,
                    maxDistributable: 7000
                },
                relationship: { type: 'follower' }
            });

            const result = fetcher.extractPositionData(vaultDetails, userWallet);

            expect(result).not.toBeNull();
            expect(result?.userWallet).toBe(userWallet);
            expect(result?.vaultUsdValue).toBe(10000);
            expect(result?.maxWithdrawable).toBe(8000);
            expect(result?.relationshipType).toBe('follower');
        });

        it('returns null with null followerState', async () => {
            const vaultDetails = createValidVaultResponse({
                followerState: null
            });

            const result = fetcher.extractPositionData(vaultDetails, userWallet);

            expect(result).toBeNull();
            expect(logger.warn).toHaveBeenCalled();
        });

        it('returns null when vault value is undefined', async () => {
            const vaultDetails = createValidVaultResponse({
                followerState: {
                    user: userWallet,
                    vaultAddress: '0xvault',
                    // No totalAccountValue or vaultEquity
                }
            });

            const result = fetcher.extractPositionData(vaultDetails, userWallet);

            expect(result).toBeNull();
            expect(logger.warn).toHaveBeenCalled();
        });

        it('handles missing optional fields with fallbacks', async () => {
            const vaultDetails = {
                vaultAddress: '0xvault',
                leader: '0xleader',
                apr: 0.1,
                followerState: {
                    user: userWallet,
                    totalAccountValue: 5000
                },
                maxWithdrawable: 4000 // Fallback for followerState.maxWithdrawable
            };

            const result = fetcher.extractPositionData(vaultDetails, userWallet);

            expect(result).not.toBeNull();
            expect(result?.maxWithdrawable).toBe(4000); // Uses vault-level fallback
            expect(result?.vaultName).toBe('Hyperliquid Vault'); // Default name
            expect(result?.relationshipType).toBeNull(); // No relationship
            expect(result?.vaultDescription).toBeNull(); // No description
        });
    });

    describe('extractAprData', () => {
        it('transforms vault data correctly with all fields', async () => {
            const vaultDetails = createValidVaultResponse({
                name: 'Premium Vault',
                apr: 0.25,
                totalVlm: 5000000,
                leaderCommission: 0.15,
                leaderFraction: 0.6,
                totalFollowers: 100,
                isClosed: false,
                allowDeposits: true
            });

            const result = fetcher.extractAprData(vaultDetails);

            expect(result.vaultName).toBe('Premium Vault');
            expect(result.apr).toBe(0.25);
            expect(result.tvlUsd).toBe(5000000);
            expect(result.leaderCommission).toBe(0.15);
            expect(result.leaderFraction).toBe(0.6);
            expect(result.totalFollowers).toBe(100);
            expect(result.isClosed).toBe(false);
            expect(result.allowDeposits).toBe(true);
        });

        it('handles missing optional fields with nulls and defaults', async () => {
            const minimalVaultDetails = {
                vaultAddress: '0xvault',
                leader: '0xleader',
                apr: 0.1,
                followerState: null
                // No name, description, commissions, etc.
            };

            const result = fetcher.extractAprData(minimalVaultDetails);

            expect(result.vaultName).toBe('Hyperliquid Vault'); // Default name
            expect(result.tvlUsd).toBeNull(); // No TVL data
            expect(result.leaderCommission).toBeNull();
            expect(result.leaderFraction).toBeNull();
            expect(result.totalFollowers).toBeNull();
            expect(result.isClosed).toBe(false); // Default false
            expect(result.allowDeposits).toBe(true); // Default true
        });

        it('derives total followers from followers array when totalFollowers missing', async () => {
            const vaultDetails = createValidVaultResponse({
                totalFollowers: undefined,
                followers: [
                    { user: '0x1', totalAccountValue: 1000 },
                    { user: '0x2', totalAccountValue: 2000 }
                ]
            });

            const result = fetcher.extractAprData(vaultDetails);

            expect(result.totalFollowers).toBe(2);
        });
    });

    describe('deriveTvlFromPortfolio', () => {
        it('calculates TVL from portfolio day bucket', async () => {
            const vaultDetails = createValidVaultResponse({
                totalVlm: undefined, // Force use of portfolio
                portfolio: [
                    ['day', {
                        accountValueHistory: [
                            [1000000, 100000],
                            [2000000, 150000],
                            [3000000, 200000] // Latest value
                        ]
                    }]
                ]
            });

            const result = fetcher.extractAprData(vaultDetails);

            expect(result.tvlUsd).toBe(200000);
        });

        it('falls back to first portfolio bucket when day not found', async () => {
            const vaultDetails = createValidVaultResponse({
                totalVlm: undefined,
                portfolio: [
                    ['week', {
                        accountValueHistory: [
                            [1000000, 50000]
                        ]
                    }]
                ]
            });

            const result = fetcher.extractAprData(vaultDetails);

            expect(result.tvlUsd).toBe(50000);
        });

        it('returns null when portfolio is empty', async () => {
            const vaultDetails = createValidVaultResponse({
                totalVlm: undefined,
                portfolio: []
            });

            const result = fetcher.extractAprData(vaultDetails);

            expect(result.tvlUsd).toBeNull();
        });

        it('returns null when portfolio is undefined', async () => {
            const vaultDetails = createValidVaultResponse({
                totalVlm: undefined,
                portfolio: undefined
            });

            const result = fetcher.extractAprData(vaultDetails);

            expect(result.tvlUsd).toBeNull();
        });

        it('returns null when accountValueHistory is missing', async () => {
            const vaultDetails = createValidVaultResponse({
                totalVlm: undefined,
                portfolio: [
                    ['day', {}] // No accountValueHistory
                ]
            });

            const result = fetcher.extractAprData(vaultDetails);

            expect(result.tvlUsd).toBeNull();
        });

        it('returns null when accountValueHistory is empty', async () => {
            const vaultDetails = createValidVaultResponse({
                totalVlm: undefined,
                portfolio: [
                    ['day', { accountValueHistory: [] }]
                ]
            });

            const result = fetcher.extractAprData(vaultDetails);

            expect(result.tvlUsd).toBeNull();
        });

        it('handles string values in portfolio history', async () => {
            const vaultDetails = createValidVaultResponse({
                totalVlm: undefined,
                portfolio: [
                    ['day', {
                        accountValueHistory: [
                            [1000000, '250000'] // String value
                        ]
                    }]
                ]
            });

            const result = fetcher.extractAprData(vaultDetails);

            expect(result.tvlUsd).toBe(250000);
        });

        it('returns null for non-finite numeric values in portfolio', async () => {
            const vaultDetails = createValidVaultResponse({
                totalVlm: undefined,
                portfolio: [
                    ['day', {
                        accountValueHistory: [
                            [1000000, NaN]
                        ]
                    }]
                ]
            });

            const result = fetcher.extractAprData(vaultDetails);

            expect(result.tvlUsd).toBeNull();
        });

        it('returns null for invalid lastPoint structure', async () => {
            const vaultDetails = createValidVaultResponse({
                totalVlm: undefined,
                portfolio: [
                    ['day', {
                        accountValueHistory: [
                            [1000000] // Missing value
                        ]
                    }]
                ]
            });

            const result = fetcher.extractAprData(vaultDetails);

            expect(result.tvlUsd).toBeNull();
        });

        it('handles non-array lastPoint in portfolio history', async () => {
            const vaultDetails = createValidVaultResponse({
                totalVlm: undefined,
                portfolio: [
                    ['day', {
                        accountValueHistory: [
                            'not-an-array' as unknown // Invalid structure
                        ]
                    }]
                ]
            });

            const result = fetcher.extractAprData(vaultDetails);

            expect(result.tvlUsd).toBeNull();
        });
    });

    describe('Edge Cases', () => {
        it('should throw "All retry attempts failed" when maxRetries is 0 (line 420)', async () => {
            const zeroRetryFetcher = new HyperliquidFetcher({ maxRetries: 0 });
            // fetchWithRetryAndBackoff is private, but called by getVaultDetails
            // If maxRetries is 0, loop doesn't run, throws immediately
            await expect(zeroRetryFetcher.getVaultDetails('0x123', '0x456'))
                .rejects.toThrow('failed after 0 attempts');
        });

        it('should return null for invalid string TVL in deriveTvlFromPortfolio (line 475)', async () => {
            const badPortfolio = [
                ['day', {
                    accountValueHistory: [
                        [1234567890, 'not-a-number']
                    ]
                }]
            ];

            const vaultDetails: unknown = {
                vaultAddress: '0x123',
                leader: '0xabc',
                apr: 0.1,
                portfolio: badPortfolio
            };

            const result = fetcher.extractAprData(vaultDetails);
            expect(result.tvlUsd).toBeNull();
        });

        it('should handle maxWithdrawable fallbacks (line 342)', async () => {
            // Case 1: followerState.maxWithdrawable is undefined, vaultDetails.maxWithdrawable is defined
            const detailsFallback: unknown = {
                vaultAddress: '0x123',
                leader: '0xabc',
                apr: 0.1,
                followerState: {
                    totalAccountValue: 1000,
                    maxWithdrawable: undefined
                },
                maxWithdrawable: 500
            };
            const res1 = fetcher.extractPositionData(detailsFallback, '0xuser');
            expect(res1?.maxWithdrawable).toBe(500);

            // Case 2: Both undefined
            const detailsNull: unknown = {
                vaultAddress: '0x123',
                leader: '0xabc',
                apr: 0.1,
                followerState: {
                    totalAccountValue: 1000,
                    maxWithdrawable: undefined
                },
                maxWithdrawable: undefined
            };
            const res2 = fetcher.extractPositionData(detailsNull, '0xuser');
            expect(res2?.maxWithdrawable).toBeNull();
        });
        it('should use default values when config is missing (lines 166, 177)', async () => {
            const defaultFetcher = new HyperliquidFetcher();
            // We can't easily check private config, but we can check behavior or use any cast
            expect((defaultFetcher as unknown).config.maxRetries).toBe(3);
            expect((defaultFetcher as unknown).config.rateLimitRpm).toBe(60);
        });

        it('should handle non-Error exceptions in getVaultDetails (line 244)', async () => {
            // Mock fetch to throw a string
            const fetcher = new HyperliquidFetcher({ maxRetries: 0 });
            (fetcher as unknown).fetchWithRetryAndBackoff = vi.fn().mockRejectedValue('String Error');

            await expect(fetcher.getVaultDetails('0x123')).rejects.toBe('String Error');

            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to fetch'), expect.objectContaining({
                error: 'Unknown error'
            }));
        });

        it('should handle non-Error exceptions in getVaultDetailsForUsers (line 285)', async () => {
            const fetcher = new HyperliquidFetcher();
            // Mock getVaultDetails to fail with non-Error
            vi.spyOn(fetcher, 'getVaultDetails').mockRejectedValue('String Error');

            await expect(fetcher.getVaultDetailsForUsers(['0x123'])).rejects.toThrow(/All vault detail fetches failed/);

            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to fetch vault details for user'), expect.objectContaining({
                error: 'Unknown error'
            }));
        });
    });

    describe('fetchWithRetryAndBackoff', () => {
        it('succeeds on first attempt', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(createValidVaultResponse())
            });

            const result = await fetcher.getVaultDetails('0xuser');

            expect(result).toBeDefined();
            expect(mockFetch).toHaveBeenCalledTimes(1);
        });

        it('retries with exponential backoff after failures', async () => {
            const fetcher3Retries = new HyperliquidFetcher({ maxRetries: 3, retryDelayMs: 10 });

            // First attempt fails
            mockFetch.mockRejectedValueOnce(new Error('Temporary failure'));

            // Second attempt fails
            mockFetch.mockRejectedValueOnce(new Error('Still failing'));

            // Third attempt succeeds
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(createValidVaultResponse())
            });

            const result = await fetcher3Retries.getVaultDetails('0xuser');

            expect(result).toBeDefined();
            expect(mockFetch).toHaveBeenCalledTimes(3);
            expect(logger.warn).toHaveBeenCalledTimes(2); // 2 retries
        });

        it('throws after max retries exhausted', async () => {
            const fetcher2Retries = new HyperliquidFetcher({ maxRetries: 2, retryDelayMs: 0 });

            // All attempts fail
            mockFetch.mockRejectedValue(new Error('Persistent failure'));

            await expect(
                fetcher2Retries.getVaultDetails('0xuser')
            ).rejects.toThrow('Persistent failure');

            expect(mockFetch).toHaveBeenCalledTimes(2);
            expect(logger.warn).toHaveBeenCalled();
        });

        it('handles non-Error objects in retry logic', async () => {
            const fetcher2Retries = new HyperliquidFetcher({ maxRetries: 2, retryDelayMs: 0 });

            // Throw non-Error object
            mockFetch.mockRejectedValue('String error');

            await expect(
                fetcher2Retries.getVaultDetails('0xuser')
            ).rejects.toBeDefined();

            expect(mockFetch).toHaveBeenCalledTimes(2);
        });
    });

    describe('getDefaultVaultAddress', () => {
        it('returns the default HLP vault address', () => {
            const address = fetcher.getDefaultVaultAddress();
            expect(address).toBe('0xdfc24b077bc1425ad1dea75bcb6f8158e10df303');
        });
    });

    describe('HyperliquidFetcher constructor', () => {
        it('creates a HyperliquidFetcher instance', async () => {
            const fetcher = new HyperliquidFetcher({ maxRetries: 2 });
            expect(fetcher).toBeInstanceOf(HyperliquidFetcher);
            expect(fetcher.getDefaultVaultAddress()).toBe('0xdfc24b077bc1425ad1dea75bcb6f8158e10df303');
        });
    });
});
