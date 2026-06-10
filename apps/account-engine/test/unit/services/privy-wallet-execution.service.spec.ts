import type { PrivyAtomicBatchRequest } from '@zapengine/types/api';

import {
  createPrivyWalletExecutionService,
  type PrivyWalletExecutionClient,
} from '../../../src/services/privy-wallet-execution.service';

const request: PrivyAtomicBatchRequest = {
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

function createClient(): PrivyWalletExecutionClient {
  return {
    verifyAccessToken: vi.fn().mockResolvedValue({ userId: 'privy-user-id' }),
    getWallet: vi.fn().mockResolvedValue({ address: request.walletAddress }),
    sendCalls: vi.fn().mockResolvedValue({
      transactionId: 'privy-transaction-id',
      caip2: 'eip155:8453',
    }),
  };
}

describe('PrivyWalletExecutionService', () => {
  it('verifies the user and forwards the atomic batch to Privy', async () => {
    const client = createClient();
    const service = createPrivyWalletExecutionService({ client });

    await expect(
      service.sendCalls(request, 'privy-access-token'),
    ).resolves.toEqual({
      transactionId: 'privy-transaction-id',
      caip2: 'eip155:8453',
    });
    expect(client.verifyAccessToken).toHaveBeenCalledWith('privy-access-token');
    expect(client.getWallet).toHaveBeenCalledWith('privy-wallet-id');
    expect(client.sendCalls).toHaveBeenCalledWith(
      'privy-wallet-id',
      request,
      'privy-access-token',
    );
  });

  it('rejects a wallet id that resolves to another address', async () => {
    const client = createClient();
    vi.mocked(client.getWallet).mockResolvedValue({
      address: '0x3333333333333333333333333333333333333333',
    });
    const service = createPrivyWalletExecutionService({ client });

    await expect(
      service.sendCalls(request, 'privy-access-token'),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'Privy wallet id does not match the connected wallet address',
    });
    expect(client.sendCalls).not.toHaveBeenCalled();
  });

  it('rejects an invalid Privy access token before wallet lookup', async () => {
    const client = createClient();
    vi.mocked(client.verifyAccessToken).mockRejectedValue(
      new Error('invalid token'),
    );
    const service = createPrivyWalletExecutionService({ client });

    await expect(
      service.sendCalls(request, 'invalid-access-token'),
    ).rejects.toMatchObject({
      statusCode: 401,
      message: 'Invalid Privy access token',
    });
    expect(client.getWallet).not.toHaveBeenCalled();
    expect(client.sendCalls).not.toHaveBeenCalled();
  });
});
