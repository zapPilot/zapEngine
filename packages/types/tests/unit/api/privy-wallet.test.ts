import { describe, expect, it } from 'vitest';

import {
  PrivyAtomicBatchCallSchema,
  PrivyAtomicBatchPayloadSchema,
  PrivyAtomicBatchRequestSchema,
  PrivyAtomicBatchResponseSchema,
  PrivyAtomicBatchAuthorizationResponseSchema,
  PrivyPrepareSendCallsRequestSchema,
  PrivyPrepareSendCallsResponseSchema,
  PrivyConfirmSendCallsRequestSchema,
  PrivyConfirmSendCallsResponseSchema,
} from '../../../src/api/privy-wallet.js';

const USER = '0x' + 'a'.repeat(40);
const WALLET_ID = 'wallet_abc123';
const IDEMPOTENCY_KEY = 'idem_123';

const validBatchPayload = {
  walletId: WALLET_ID,
  walletAddress: USER,
  chainId: 8453,
  calls: [{ to: USER, data: '0xdeadbeef' }],
  idempotencyKey: IDEMPOTENCY_KEY,
};

const validBatchCall = {
  to: USER,
  data: '0xdeadbeef',
  value: '0x0',
};

const reviewEvidence = {
  chainId: 8453,
  walletAddress: USER,
  calls: [
    {
      index: 0,
      to: USER,
      data: '0xdeadbeef',
      value: '0',
      method: 'deposit',
      status: 'succeeded',
      gasUsed: '21000',
      error: null,
      contractVerified: true,
    },
  ],
  assetChanges: [],
  approvals: [],
  contracts: [
    {
      address: USER,
      name: 'Example',
      verified: true,
      callIndexes: [0],
    },
  ],
  warnings: [],
  blockNumber: 123,
  callGas: '21000',
  simulationIds: ['sim_abc'],
  shareUrls: ['https://www.tdly.co/shared/simulation/sim_abc'],
  simulationFingerprint: `0x${'1'.repeat(64)}`,
  riskHash: `0x${'2'.repeat(64)}`,
};

describe('PrivyAtomicBatchCallSchema', () => {
  it('accepts a call with data', () => {
    expect(PrivyAtomicBatchCallSchema.safeParse(validBatchCall).success).toBe(
      true,
    );
  });

  it('accepts a call with value only', () => {
    expect(PrivyAtomicBatchCallSchema.safeParse({ to: USER }).success).toBe(
      true,
    );
  });

  it('accepts a call with all fields', () => {
    expect(
      PrivyAtomicBatchCallSchema.safeParse({
        to: USER,
        data: '0x',
        value: '0x1',
      }).success,
    ).toBe(true);
  });

  it('rejects an invalid address', () => {
    expect(PrivyAtomicBatchCallSchema.safeParse({ to: '0x123' }).success).toBe(
      false,
    );
  });

  it('rejects odd-length hex data', () => {
    expect(
      PrivyAtomicBatchCallSchema.safeParse({ to: USER, data: '0xabc' }).success,
    ).toBe(false);
  });

  it('rejects data exceeding max length', () => {
    const longData = '0x' + 'ab'.repeat(50_001);
    expect(
      PrivyAtomicBatchCallSchema.safeParse({ to: USER, data: longData })
        .success,
    ).toBe(false);
  });
});

describe('PrivyAtomicBatchPayloadSchema', () => {
  it('accepts a valid batch payload', () => {
    expect(
      PrivyAtomicBatchPayloadSchema.safeParse(validBatchPayload).success,
    ).toBe(true);
  });

  it('accepts base chain', () => {
    expect(
      PrivyAtomicBatchPayloadSchema.safeParse({
        ...validBatchPayload,
        chainId: 8453,
      }).success,
    ).toBe(true);
  });

  it('accepts arbitrum chain', () => {
    expect(
      PrivyAtomicBatchPayloadSchema.safeParse({
        ...validBatchPayload,
        chainId: 42161,
      }).success,
    ).toBe(true);
  });

  it('rejects an empty calls array', () => {
    expect(
      PrivyAtomicBatchPayloadSchema.safeParse({
        ...validBatchPayload,
        calls: [],
      }).success,
    ).toBe(false);
  });

  it('rejects an invalid chainId', () => {
    expect(
      PrivyAtomicBatchPayloadSchema.safeParse({
        ...validBatchPayload,
        chainId: 1,
      }).success,
    ).toBe(false);
  });

  it('rejects empty walletId', () => {
    expect(
      PrivyAtomicBatchPayloadSchema.safeParse({
        ...validBatchPayload,
        walletId: '',
      }).success,
    ).toBe(false);
  });
});

describe('PrivyAtomicBatchAuthorizationResponseSchema', () => {
  it('accepts a valid authorization response', () => {
    expect(
      PrivyAtomicBatchAuthorizationResponseSchema.safeParse({
        authorizationPayload: 'sig_payload',
        requestExpiry: Math.floor(Date.now() / 1000) + 60,
      }).success,
    ).toBe(true);
  });

  it('rejects negative requestExpiry', () => {
    expect(
      PrivyAtomicBatchAuthorizationResponseSchema.safeParse({
        authorizationPayload: 'sig_payload',
        requestExpiry: -1,
      }).success,
    ).toBe(false);
  });

  it('rejects non-integer requestExpiry', () => {
    expect(
      PrivyAtomicBatchAuthorizationResponseSchema.safeParse({
        authorizationPayload: 'sig_payload',
        requestExpiry: 1.5,
      }).success,
    ).toBe(false);
  });
});

describe('PrivyAtomicBatchRequestSchema', () => {
  it('accepts a valid batch request with signature', () => {
    expect(
      PrivyAtomicBatchRequestSchema.safeParse({
        ...validBatchPayload,
        authorizationSignature: 'sig_abc',
        requestExpiry: Math.floor(Date.now() / 1000) + 60,
      }).success,
    ).toBe(true);
  });

  it('rejects a payload without authorizationSignature', () => {
    expect(
      PrivyAtomicBatchRequestSchema.safeParse(validBatchPayload).success,
    ).toBe(false);
  });

  it('rejects requestExpiry in the payload (not in request schema)', () => {
    expect(
      PrivyAtomicBatchRequestSchema.safeParse({
        ...validBatchPayload,
        authorizationSignature: 'sig_abc',
        requestExpiry: Math.floor(Date.now() / 1000) + 60,
      }).success,
    ).toBe(true);
  });

  it('rejects signature exceeding max length', () => {
    const longSig = 'sig_' + 'a'.repeat(4096);
    expect(
      PrivyAtomicBatchRequestSchema.safeParse({
        ...validBatchPayload,
        authorizationSignature: longSig,
        requestExpiry: Math.floor(Date.now() / 1000) + 60,
      }).success,
    ).toBe(false);
  });
});

describe('PrivyAtomicBatchResponseSchema', () => {
  it('accepts a valid response', () => {
    expect(
      PrivyAtomicBatchResponseSchema.safeParse({
        transactionId: 'tx_abc123',
        caip2: 'eip155:8453',
        transactionHash: `0x${'a'.repeat(64)}`,
      }).success,
    ).toBe(true);
  });

  it('rejects a malformed transaction hash', () => {
    expect(
      PrivyAtomicBatchResponseSchema.safeParse({
        transactionId: 'tx_abc123',
        caip2: 'eip155:8453',
        transactionHash: '0xtxhash',
      }).success,
    ).toBe(false);
  });

  it('rejects an invalid caip2 format', () => {
    expect(
      PrivyAtomicBatchResponseSchema.safeParse({
        transactionId: 'tx_abc123',
        caip2: 'eip155:', // missing chain ID
      }).success,
    ).toBe(false);
  });

  it('rejects a non-eip155 caip2', () => {
    expect(
      PrivyAtomicBatchResponseSchema.safeParse({
        transactionId: 'tx_abc123',
        caip2: 'cosmos:cosmoshub-4',
      }).success,
    ).toBe(false);
  });
});

describe('PrivyPrepareSendCallsRequestSchema', () => {
  it('accepts a valid prepare send calls request', () => {
    expect(
      PrivyPrepareSendCallsRequestSchema.safeParse(validBatchPayload).success,
    ).toBe(true);
  });
});

describe('PrivyPrepareSendCallsResponseSchema', () => {
  const signingFields = {
    previewId: 'preview_abc',
    batchHash: `0x${'3'.repeat(64)}`,
    typedDataPayload: {},
    expiresAt: Math.floor(Date.now() / 1000) + 60,
    authorizationPayload: 'auth_payload',
    requestExpiry: Math.floor(Date.now() / 1000) + 120,
  };

  it.each(['passed', 'warning'] as const)(
    'accepts a valid %s response with signing fields',
    (status) => {
      const warnings =
        status === 'warning'
          ? [
              {
                code: 'UNVERIFIED_CONTRACT',
                message: 'Contract is not verified',
                callIndex: 0,
                address: USER,
              },
            ]
          : [];

      expect(
        PrivyPrepareSendCallsResponseSchema.safeParse({
          status,
          ...reviewEvidence,
          warnings,
          ...signingFields,
        }).success,
      ).toBe(true);
    },
  );

  it.each([
    { status: 'failed', failureReason: 'execution reverted' },
    { status: 'unavailable', unavailableReason: 'Tenderly timed out' },
  ])('accepts a non-signable $status response', (variant) => {
    expect(
      PrivyPrepareSendCallsResponseSchema.safeParse({
        ...reviewEvidence,
        ...variant,
      }).success,
    ).toBe(true);
  });

  it('rejects signing fields on a failed response', () => {
    expect(
      PrivyPrepareSendCallsResponseSchema.safeParse({
        status: 'failed',
        failureReason: 'execution reverted',
        ...reviewEvidence,
        ...signingFields,
      }).success,
    ).toBe(false);
  });

  it('rejects a warning response without warnings', () => {
    expect(
      PrivyPrepareSendCallsResponseSchema.safeParse({
        status: 'warning',
        ...reviewEvidence,
        ...signingFields,
      }).success,
    ).toBe(false);
  });

  it('rejects malformed normalized evidence', () => {
    expect(
      PrivyPrepareSendCallsResponseSchema.safeParse({
        status: 'passed',
        ...reviewEvidence,
        calls: [{ ...reviewEvidence.calls[0], value: '0x1' }],
        ...signingFields,
      }).success,
    ).toBe(false);
  });
});

describe('PrivyConfirmSendCallsRequestSchema', () => {
  it('accepts a valid confirm request', () => {
    expect(
      PrivyConfirmSendCallsRequestSchema.safeParse({
        previewId: 'preview_abc',
        userSignature: 'sig_abc',
        authorizationSignature: 'auth_sig',
        acknowledgedRiskHash: `0x${'2'.repeat(64)}`,
      }).success,
    ).toBe(true);
  });

  it('rejects empty previewId', () => {
    expect(
      PrivyConfirmSendCallsRequestSchema.safeParse({
        previewId: '',
        userSignature: 'sig_abc',
        authorizationSignature: 'auth_sig',
      }).success,
    ).toBe(false);
  });

  it('rejects empty userSignature', () => {
    expect(
      PrivyConfirmSendCallsRequestSchema.safeParse({
        previewId: 'preview_abc',
        userSignature: '',
        authorizationSignature: 'auth_sig',
      }).success,
    ).toBe(false);
  });
});

describe('PrivyConfirmSendCallsResponseSchema', () => {
  it('accepts a submitted response', () => {
    expect(
      PrivyConfirmSendCallsResponseSchema.safeParse({
        status: 'submitted',
        transactionId: 'tx_abc123',
        caip2: 'eip155:42161',
        transactionHash: `0x${'b'.repeat(64)}`,
      }).success,
    ).toBe(true);
  });

  it('accepts a replacement review response', () => {
    expect(
      PrivyConfirmSendCallsResponseSchema.safeParse({
        status: 'review',
        preview: {
          status: 'failed',
          failureReason: 'state changed',
          ...reviewEvidence,
        },
      }).success,
    ).toBe(true);
  });

  it('rejects a submitted response with invalid caip2', () => {
    expect(
      PrivyConfirmSendCallsResponseSchema.safeParse({
        status: 'submitted',
        transactionId: 'tx_abc123',
        caip2: 'invalid',
      }).success,
    ).toBe(false);
  });
});
