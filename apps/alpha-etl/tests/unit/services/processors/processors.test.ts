import { describe, it, expect, vi } from 'vitest';
import { validateWalletFetchJob } from '../../../../src/core/processors/validation.js';

// validateWalletFetchJob uses declared schemas; these tests drive specific metadata failures.

vi.mock('../../../../src/utils/logger.js', async () => {
  const { mockLogger } = await import('../../../setup/mocks.js');
  return mockLogger();
});

describe('Processors', () => {
  describe('Validation', () => {
    it('should throw "Invalid wallet_fetch metadata" for non-wallet errors', () => {
      // Valid walletAddress but missing required userId.
      const job: unknown = {
        jobId: 'test-job',
        trigger: 'manual',
        status: 'pending',
        createdAt: new Date(),
        metadata: {
          jobType: 'wallet_fetch',
          walletAddress: '0x1234567890123456789012345678901234567890',
          // userId missing intentionally
        },
      };

      expect(() => validateWalletFetchJob(job)).toThrow(
        'Invalid wallet_fetch metadata',
      );
    });

    it('should throw "Wallet address missing" for errors on walletAddress path', () => {
      // Invalid walletAddress type to trigger walletAddress-specific validation error.
      const job: unknown = {
        jobId: 'test-job',
        trigger: 'manual',
        status: 'pending',
        createdAt: new Date(),
        metadata: {
          jobType: 'wallet_fetch',
          walletAddress: 123, // Invalid type - should be string
          userId: 'user-123',
        },
      };

      expect(() => validateWalletFetchJob(job)).toThrow(
        'Wallet address missing from job metadata',
      );
    });

    it('should throw "Wallet address missing" when walletAddress is not in metadata', () => {
      const job: unknown = {
        jobId: 'test-job',
        trigger: 'manual',
        status: 'pending',
        createdAt: new Date(),
        metadata: {
          jobType: 'wallet_fetch',
          userId: 'user-123',
          // walletAddress missing entirely
        },
      };

      expect(() => validateWalletFetchJob(job)).toThrow(
        'Wallet address missing from job metadata',
      );
    });

    it('should return valid metadata when all fields are correct', () => {
      const job: unknown = {
        jobId: 'test-job',
        trigger: 'manual',
        status: 'pending',
        createdAt: new Date(),
        metadata: {
          jobType: 'wallet_fetch',
          walletAddress: '0x1234567890123456789012345678901234567890',
          userId: 'user-123',
        },
      };

      const result = validateWalletFetchJob(job);
      expect(result.walletAddress).toBe(
        '0x1234567890123456789012345678901234567890',
      );
      expect(result.userId).toBe('user-123');
    });
  });
});
