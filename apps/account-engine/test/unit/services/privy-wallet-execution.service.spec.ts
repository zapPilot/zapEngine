import type {
  PrivyAtomicBatchPayload,
  PrivyAtomicBatchRequest,
} from '@zapengine/types/api';

import {
  createPrivySendCallsAuthorizationPayload,
  createPrivyWalletExecutionService,
  type PrivyWalletExecutionClient,
} from '../../../src/services/privy-wallet-execution.service';

const batch: PrivyAtomicBatchPayload = {
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

const request: PrivyAtomicBatchRequest = {
  ...batch,
  authorizationSignature: 'base64-authorization-signature',
  requestExpiry: 1_800_000_000_000,
};

const accessToken = 'header.payload.signature';

function createClient(): PrivyWalletExecutionClient {
  return {
    verifyAccessToken: vi.fn().mockResolvedValue({ userId: 'privy-user-id' }),
    getUserWallets: vi
      .fn()
      .mockResolvedValue([
        { id: request.walletId, address: request.walletAddress },
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

  it('prepares a server-formatted authorization payload after verifying wallet ownership', async () => {
    const client = createClient();
    const service = createPrivyWalletExecutionService({ client });

    await expect(service.prepareSendCalls(batch, accessToken)).resolves.toEqual(
      {
        authorizationPayload: 'base64-authorization-payload',
        requestExpiry: 1_800_000_000_000,
      },
    );
    expect(client.verifyAccessToken).toHaveBeenCalledWith(accessToken);
    expect(client.getUserWallets).toHaveBeenCalledWith('privy-user-id');
    expect(client.prepareSendCalls).toHaveBeenCalledWith(
      'privy-wallet-id',
      batch,
    );
    expect(client.sendCalls).not.toHaveBeenCalled();
  });

  it('verifies the user and forwards the atomic batch to Privy', async () => {
    const client = createClient();
    const service = createPrivyWalletExecutionService({ client });

    await expect(service.sendCalls(request, accessToken)).resolves.toEqual({
      transactionId: 'privy-transaction-id',
      caip2: 'eip155:8453',
    });
    expect(client.verifyAccessToken).toHaveBeenCalledWith(accessToken);
    expect(client.getUserWallets).toHaveBeenCalledWith('privy-user-id');
    expect(client.sendCalls).toHaveBeenCalledWith('privy-wallet-id', request, {
      signatures: [request.authorizationSignature],
    });
  });

  it.each([
    {
      linkedWallet: {
        id: request.walletId,
        address: '0x3333333333333333333333333333333333333333',
      },
      mismatch: 'address',
    },
    {
      linkedWallet: {
        id: 'another-privy-wallet-id',
        address: request.walletAddress,
      },
      mismatch: 'wallet id',
    },
  ])(
    'rejects a linked wallet with a mismatched $mismatch',
    async ({ linkedWallet }) => {
      const client = createClient();
      vi.mocked(client.getUserWallets).mockResolvedValue([linkedWallet]);
      const service = createPrivyWalletExecutionService({ client });

      await expect(
        service.sendCalls(request, accessToken),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: 'Privy wallet does not belong to the authenticated user',
      });
      expect(client.sendCalls).not.toHaveBeenCalled();
    },
  );

  it('rejects a malformed access token before calling Privy', async () => {
    const client = createClient();
    const service = createPrivyWalletExecutionService({ client });

    await expect(service.sendCalls(request, 'not-a-jwt')).rejects.toMatchObject(
      {
        statusCode: 401,
        message:
          'Privy user access token is invalid or expired. Please re-login.',
      },
    );
    expect(client.verifyAccessToken).not.toHaveBeenCalled();
    expect(client.getUserWallets).not.toHaveBeenCalled();
    expect(client.sendCalls).not.toHaveBeenCalled();
  });

  it('rejects an invalid Privy access token before wallet lookup', async () => {
    const client = createClient();
    vi.mocked(client.verifyAccessToken).mockRejectedValue(
      new Error('invalid token'),
    );
    const service = createPrivyWalletExecutionService({ client });

    await expect(service.sendCalls(request, accessToken)).rejects.toMatchObject(
      {
        statusCode: 401,
        message:
          'Privy user access token is invalid or expired. Please re-login.',
      },
    );
    expect(client.getUserWallets).not.toHaveBeenCalled();
    expect(client.sendCalls).not.toHaveBeenCalled();
  });

  it('returns 401 when Privy rejects the authorization context JWT', async () => {
    const client = createClient();
    vi.mocked(client.sendCalls).mockRejectedValue(
      Object.assign(new Error('400 Invalid JWT token provided'), {
        status: 400,
        error: {
          error: 'Invalid JWT token provided',
          code: 'invalid_data',
        },
      }),
    );
    const service = createPrivyWalletExecutionService({ client });

    await expect(service.sendCalls(request, accessToken)).rejects.toMatchObject(
      {
        statusCode: 401,
        message:
          'Privy user access token is invalid or expired. Please re-login.',
      },
    );
  });

  it('keeps non-authentication Privy failures as bad gateway errors', async () => {
    const client = createClient();
    vi.mocked(client.sendCalls).mockRejectedValue(
      new Error('Privy service unavailable'),
    );
    const service = createPrivyWalletExecutionService({ client });

    await expect(service.sendCalls(request, accessToken)).rejects.toMatchObject(
      {
        statusCode: 502,
        message: 'Privy Wallets API batch failed: Privy service unavailable',
      },
    );
    expect(client.sendCalls).toHaveBeenCalledOnce();
  });
});
