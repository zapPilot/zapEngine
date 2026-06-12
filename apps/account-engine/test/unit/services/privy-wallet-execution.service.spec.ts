import type {
  PrivyConfirmSendCallsRequest,
  PrivyPrepareSendCallsRequest,
} from '@zapengine/types/api';
import { describe, expect, it, vi } from 'vitest';

import {
  createPrivySendCallsAuthorizationPayload,
  createPrivyWalletExecutionService,
  type PrivyWalletExecutionClient,
} from '../../../src/services/privy-wallet-execution.service';

vi.mock('viem', async (importOriginal) => {
  const actual = await importOriginal<typeof import('viem')>();
  return {
    ...actual,
    verifyTypedData: vi.fn().mockResolvedValue(true),
  };
});

const batch: PrivyPrepareSendCallsRequest = {
  walletId: 'privy-wallet-id',
  walletAddress: '0x1111111111111111111111111111111111111111',
  chainId: 8453,
  calls: [
    {
      to: '0x2222222222222222222222222222222222222222',
      data: '0x1234',
      value: '0x0',
    },
  ],
  idempotencyKey: 'batch-request-id',
};

const accessToken = 'header.payload.signature';

function createClient(): PrivyWalletExecutionClient {
  return {
    verifyAccessToken: vi.fn().mockResolvedValue({ userId: 'privy-user-id' }),
    getUserWallets: vi
      .fn()
      .mockResolvedValue([
        { id: batch.walletId, address: batch.walletAddress },
      ]),
    prepareSendCalls: vi.fn().mockResolvedValue({
      authorizationPayload: 'base64-authorization-payload',
      requestExpiry: 1_800_000_000_000,
    }),
    sendCalls: vi.fn().mockResolvedValue({
      transactionId: 'privy-transaction-id',
      caip2: 'eip155:8453',
    }),
  };
}

describe('PrivyWalletExecutionService', () => {
  it('formats the exact Wallets API RPC request for client-side signing', () => {
    const authorizationPayload = createPrivySendCallsAuthorizationPayload({
      appId: 'privy-app-id',
      walletId: batch.walletId,
      request: batch,
      requestExpiry: 1_800_000_000_000,
    });

    expect(
      JSON.parse(Buffer.from(authorizationPayload, 'base64').toString()),
    ).toEqual({
      version: 1,
      method: 'POST',
      url: 'https://api.privy.io/v1/wallets/privy-wallet-id/rpc',
      body: {
        caip2: 'eip155:8453',
        params: { calls: batch.calls },
        sponsor: false,
        method: 'wallet_sendCalls',
        chain_type: 'ethereum',
      },
      headers: {
        'privy-app-id': 'privy-app-id',
        'privy-idempotency-key': batch.idempotencyKey,
        'privy-request-expiry': '1800000000000',
      },
    });
  });

  it('prepares a server-formatted authorization payload and runs Tenderly preflight', async () => {
    const client = createClient();
    const service = createPrivyWalletExecutionService({ client });

    const response = await service.prepareSendCalls(batch, accessToken);

    expect(response).toMatchObject({
      authorizationPayload: 'base64-authorization-payload',
      requestExpiry: 1_800_000_000_000,
      previewId: expect.any(String),
      batchHash: expect.any(String),
      gasEstimate: expect.any(String),
      typedDataPayload: expect.any(Object),
    });

    expect(client.verifyAccessToken).toHaveBeenCalledWith(accessToken);
    expect(client.getUserWallets).toHaveBeenCalledWith('privy-user-id');
    expect(client.prepareSendCalls).toHaveBeenCalledWith(
      'privy-wallet-id',
      batch,
    );
    expect(client.sendCalls).not.toHaveBeenCalled();
  });

  it('verifies EIP-712 signature, nonces, and broadcasts the batch', async () => {
    const client = createClient();
    const service = createPrivyWalletExecutionService({ client });

    // 1. Prepare
    const prep = await service.prepareSendCalls(batch, accessToken);

    // 2. Confirm
    const confirmReq: PrivyConfirmSendCallsRequest = {
      previewId: prep.previewId,
      userSignature: 'mock-user-eip712-signature',
      authorizationSignature: 'base64-authorization-signature',
    };

    const confirmRes = await service.confirmSendCalls(confirmReq, accessToken);

    expect(confirmRes).toEqual({
      transactionId: 'privy-transaction-id',
      caip2: 'eip155:8453',
    });

    expect(client.verifyAccessToken).toHaveBeenCalledTimes(2);
    expect(client.getUserWallets).toHaveBeenCalledTimes(2);
    expect(client.sendCalls).toHaveBeenCalledWith(
      'privy-wallet-id',
      {
        ...batch,
        authorizationSignature: 'base64-authorization-signature',
        requestExpiry: prep.requestExpiry,
      },
      {
        signatures: ['base64-authorization-signature'],
      },
    );
  });

  it('rejects a duplicate consumption (replay protection)', async () => {
    const client = createClient();
    const service = createPrivyWalletExecutionService({ client });

    const prep = await service.prepareSendCalls(batch, accessToken);

    const confirmReq: PrivyConfirmSendCallsRequest = {
      previewId: prep.previewId,
      userSignature: 'mock-user-eip712-signature',
      authorizationSignature: 'base64-authorization-signature',
    };

    await service.confirmSendCalls(confirmReq, accessToken);

    // Try again
    await expect(
      service.confirmSendCalls(confirmReq, accessToken),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'Simulation preview has already been consumed',
    });
  });

  it('rejects an invalid Privy access token before wallet lookup', async () => {
    const client = createClient();
    vi.mocked(client.verifyAccessToken).mockRejectedValue(
      new Error('invalid token'),
    );
    const service = createPrivyWalletExecutionService({ client });

    await expect(
      service.prepareSendCalls(batch, 'not-a-jwt'),
    ).rejects.toMatchObject({
      statusCode: 401,
      message:
        'Privy user access token is invalid or expired. Please re-login.',
    });
    expect(client.getUserWallets).not.toHaveBeenCalled();
  });

  it('returns 401 when Privy rejects the authorization context JWT during confirm', async () => {
    const client = createClient();
    const service = createPrivyWalletExecutionService({ client });
    const prep = await service.prepareSendCalls(batch, accessToken);

    vi.mocked(client.sendCalls).mockRejectedValue(
      Object.assign(new Error('400 Invalid JWT token provided'), {
        status: 400,
        error: {
          error: 'Invalid JWT token provided',
          code: 'invalid_data',
        },
      }),
    );

    const confirmReq: PrivyConfirmSendCallsRequest = {
      previewId: prep.previewId,
      userSignature: 'mock-user-eip712-signature',
      authorizationSignature: 'base64-authorization-signature',
    };

    await expect(
      service.confirmSendCalls(confirmReq, accessToken),
    ).rejects.toMatchObject({
      statusCode: 401,
      message:
        'Privy user access token is invalid or expired. Please re-login.',
    });
  });
});
