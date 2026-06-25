import {
  preparePrivyAtomicBatch,
  sendPrivyAtomicBatch,
} from '@zapengine/app-core/services/privyWalletService';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const httpMocks = vi.hoisted(() => ({
  post: vi.fn(),
}));

vi.mock('@zapengine/app-core/lib/http', () => ({
  httpUtils: {
    accountApi: {
      post: httpMocks.post,
    },
  },
}));

vi.mock('@zapengine/types/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@zapengine/types/api')>();
  return {
    ...actual,
    PrivyPrepareSendCallsResponseSchema: {
      parse: (data: unknown) => data,
    },
    PrivyConfirmSendCallsResponseSchema: {
      parse: (data: unknown) => data,
    },
  };
});

const mockPrepareRequest = {
  walletId: 'privy-wallet-id',
  walletAddress: '0xf8a6b8ce3a6c8F4E5a73600a89aE9A645EAEf940',
  chainId: 8453,
  calls: [
    {
      to: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`,
      data: '0x095ea7b3' as `0x${string}`,
      value: '0x0',
    },
  ],
  idempotencyKey: 'test-idempotency-key',
};

const mockPrepareResponse = {
  status: 'passed',
  chainId: 8453,
  walletAddress: mockPrepareRequest.walletAddress,
  calls: [
    {
      index: 0,
      to: mockPrepareRequest.calls[0]!.to,
      data: mockPrepareRequest.calls[0]!.data,
      value: '0',
      method: 'approve',
      status: 'succeeded',
      gasUsed: '21000',
      error: null,
      contractVerified: true,
    },
  ],
  assetChanges: [],
  approvals: [],
  contracts: [],
  warnings: [],
  blockNumber: 123,
  callGas: '21000',
  simulationIds: ['sim-1'],
  shareUrls: [],
  simulationFingerprint: `0x${'1'.repeat(64)}`,
  riskHash: `0x${'2'.repeat(64)}`,
  previewId: 'mock-preview-id',
  batchHash: `0x${'3'.repeat(64)}`,
  typedDataPayload: { domain: {}, types: {}, message: { nonce: 0 } },
  expiresAt: Date.now() + 300_000,
  authorizationPayload: 'c2VydmVyLWZvcm1hdHRlZC1wYXlsb2Fk',
  requestExpiry: 1_800_000_000_000,
};

const mockConfirmRequest = {
  previewId: 'mock-preview-id',
  userSignature: 'mock-user-signature',
  authorizationSignature: 'base64-authorization-signature',
};

const mockConfirmResponse = {
  status: 'submitted',
  transactionId: 'privy-transaction-id',
  caip2: 'eip155:8453',
};

describe('privyWalletService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('preparePrivyAtomicBatch', () => {
    it('calls the prepare endpoint with correct parameters', async () => {
      httpMocks.post.mockResolvedValueOnce(mockPrepareResponse);

      const result = await preparePrivyAtomicBatch(
        mockPrepareRequest,
        'privy-access-token',
      );

      expect(httpMocks.post).toHaveBeenCalledWith(
        '/wallet-execution/privy/prepare-send-calls',
        mockPrepareRequest,
        {
          headers: { Authorization: 'Bearer privy-access-token' },
          retries: 0,
        },
      );
      expect(result).toEqual(mockPrepareResponse);
    });

    it('parses the response through the Zod schema', async () => {
      httpMocks.post.mockResolvedValueOnce(mockPrepareResponse);

      const result = await preparePrivyAtomicBatch(mockPrepareRequest, 'token');

      expect(result).toBeDefined();
      expect(result).toMatchObject({
        status: 'passed',
        previewId: 'mock-preview-id',
      });
    });

    it('propagates errors from the API', async () => {
      httpMocks.post.mockRejectedValueOnce(new Error('API error'));

      await expect(
        preparePrivyAtomicBatch(mockPrepareRequest, 'token'),
      ).rejects.toThrow('API error');
    });
  });

  describe('sendPrivyAtomicBatch', () => {
    it('calls the confirm endpoint with correct parameters', async () => {
      httpMocks.post.mockResolvedValueOnce(mockConfirmResponse);

      const result = await sendPrivyAtomicBatch(
        mockConfirmRequest,
        'privy-access-token',
      );

      expect(httpMocks.post).toHaveBeenCalledWith(
        '/wallet-execution/privy/confirm-send-calls',
        mockConfirmRequest,
        {
          headers: { Authorization: 'Bearer privy-access-token' },
          retries: 0,
        },
      );
      expect(result).toEqual(mockConfirmResponse);
    });

    it('parses the response through the Zod schema', async () => {
      httpMocks.post.mockResolvedValueOnce(mockConfirmResponse);

      const result = await sendPrivyAtomicBatch(mockConfirmRequest, 'token');

      expect(result).toBeDefined();
      expect(result).toMatchObject({
        status: 'submitted',
        transactionId: 'privy-transaction-id',
      });
    });

    it('propagates errors from the API', async () => {
      httpMocks.post.mockRejectedValueOnce(new Error('Confirm failed'));

      await expect(
        sendPrivyAtomicBatch(mockConfirmRequest, 'token'),
      ).rejects.toThrow('Confirm failed');
    });
  });
});
