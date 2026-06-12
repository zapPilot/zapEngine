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
      }).success,
    ).toBe(true);
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
  const validPrepareResponse = {
    previewId: 'preview_abc',
    batchHash: 'hash_abc',
    decodedCalls: [],
    tenderlyResult: {},
    assetChanges: [],
    gasEstimate: '0x0',
    typedDataPayload: {},
    expiresAt: Math.floor(Date.now() / 1000) + 60,
    authorizationPayload: 'auth_payload',
    requestExpiry: Math.floor(Date.now() / 1000) + 120,
  };

  it('accepts a valid prepare response', () => {
    expect(
      PrivyPrepareSendCallsResponseSchema.safeParse(validPrepareResponse)
        .success,
    ).toBe(true);
  });

  it('rejects empty previewId', () => {
    expect(
      PrivyPrepareSendCallsResponseSchema.safeParse({
        ...validPrepareResponse,
        previewId: '',
      }).success,
    ).toBe(false);
  });

  it('rejects negative expiresAt', () => {
    expect(
      PrivyPrepareSendCallsResponseSchema.safeParse({
        ...validPrepareResponse,
        expiresAt: -1,
      }).success,
    ).toBe(false);
  });

  it('rejects empty gasEstimate', () => {
    expect(
      PrivyPrepareSendCallsResponseSchema.safeParse({
        ...validPrepareResponse,
        gasEstimate: '',
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
  it('extends PrivyAtomicBatchResponseSchema', () => {
    expect(
      PrivyConfirmSendCallsResponseSchema.safeParse({
        transactionId: 'tx_abc123',
        caip2: 'eip155:42161',
      }).success,
    ).toBe(true);
  });

  it('rejects invalid caip2 in extended schema', () => {
    expect(
      PrivyConfirmSendCallsResponseSchema.safeParse({
        transactionId: 'tx_abc123',
        caip2: 'invalid',
      }).success,
    ).toBe(false);
  });
});
