import { describe, it, expect, vi } from 'vitest';
import {
  executeWithEIP7702,
  waitForEIP7702Confirmation,
} from '../../src/execution/eip7702.executor.js';
import { ExecutionError } from '../../src/errors/intent.errors.js';
import type { PreparedTransaction } from '../../src/types/transaction.types.js';

// Mock viem/actions
vi.mock('viem/actions', () => {
  return {
    sendCalls: vi.fn(),
    waitForCallsStatus: vi.fn(),
  };
});

import { sendCalls, waitForCallsStatus } from 'viem/actions';

describe('EIP-7702 Executor', () => {
  const mockTxs: PreparedTransaction[] = [
    {
      to: '0x111',
      data: '0xaa',
      value: '10',
      chainId: 1,
      meta: { intentType: 'TEST' },
    },
    {
      to: '0x222',
      data: '0xbb',
      value: '20',
      chainId: 1,
      meta: { intentType: 'TEST' },
    },
  ];

  const mockWalletClient = {
    account: { address: '0xabc' },
  } as unknown as import('viem').WalletClient;

  describe('executeWithEIP7702', () => {
    it('throws ExecutionError when txs array is empty', async () => {
      await expect(executeWithEIP7702([], mockWalletClient)).rejects.toThrow(
        ExecutionError,
      );
      await expect(executeWithEIP7702([], mockWalletClient)).rejects.toThrow(
        'Cannot execute empty transaction array',
      );
    });

    it('returns error result when wallet has no account', async () => {
      const walletWithoutAccount = {} as unknown as import('viem').WalletClient;
      const result = await executeWithEIP7702(mockTxs, walletWithoutAccount);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Wallet has no connected account');
    });

    it('successfully sends calls and returns callsId', async () => {
      vi.mocked(sendCalls).mockResolvedValue({
        id: 'calls-123',
      } as unknown as never);

      const result = await executeWithEIP7702(mockTxs, mockWalletClient);

      expect(sendCalls).toHaveBeenCalledWith(mockWalletClient, {
        account: mockWalletClient.account,
        calls: [
          { to: '0x111', data: '0xaa', value: 10n },
          { to: '0x222', data: '0xbb', value: 20n },
        ],
        forceAtomic: true,
      });

      expect(result.success).toBe(true);
      expect(result.callsId).toBe('calls-123');
    });

    it('returns error result when sendCalls fails', async () => {
      vi.mocked(sendCalls).mockRejectedValue(
        new Error('User rejected request'),
      );

      const result = await executeWithEIP7702(mockTxs, mockWalletClient);

      expect(result.success).toBe(false);
      expect(result.error).toBe('User rejected request');
    });
  });

  describe('waitForEIP7702Confirmation', () => {
    it('returns success status with transactionHash and receipts', async () => {
      vi.mocked(waitForCallsStatus).mockResolvedValue({
        status: 'success',
        receipts: [{ transactionHash: '0xtxhash1' }],
      } as unknown as never);

      const result = await waitForEIP7702Confirmation(
        'calls-123',
        mockWalletClient,
      );

      expect(waitForCallsStatus).toHaveBeenCalledWith(mockWalletClient, {
        id: 'calls-123',
        throwOnFailure: false,
      });

      expect(result.status).toBe('success');
      expect(result.transactionHash).toBe('0xtxhash1');
      expect(result.receipts).toEqual([{ transactionHash: '0xtxhash1' }]);
    });

    it('returns failure status when calls status is not success', async () => {
      vi.mocked(waitForCallsStatus).mockResolvedValue({
        status: 'reverted',
        receipts: [],
      } as unknown as never);

      const result = await waitForEIP7702Confirmation(
        'calls-123',
        mockWalletClient,
      );

      expect(result.status).toBe('failure');
      expect(result.transactionHash).toBeUndefined();
    });
  });
});
