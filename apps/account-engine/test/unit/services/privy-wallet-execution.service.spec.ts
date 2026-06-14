import { PrivyClient } from '@privy-io/node';
import type {
  PrivyConfirmSendCallsRequest,
  PrivyPrepareSendCallsRequest,
} from '@zapengine/types/api';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createPrivySendCallsAuthorizationPayload,
  createPrivyWalletExecutionService,
  type PrivyWalletExecutionClient,
} from '../../../src/services/privy-wallet-execution.service';
import type { TenderlySimulationService } from '../../../src/services/tenderly-simulation.service';

vi.mock('viem', async (importOriginal) => {
  const actual = await importOriginal<typeof import('viem')>();
  return {
    ...actual,
    verifyTypedData: vi.fn().mockResolvedValue(true),
  };
});

vi.mock('@privy-io/node', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@privy-io/node')>();
  return { ...actual, PrivyClient: vi.fn() };
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

function simulationService(): TenderlySimulationService {
  return {
    simulateBundle: vi.fn().mockResolvedValue({
      status: 'passed',
      chainId: 8453,
      walletAddress: batch.walletAddress,
      calls: [
        {
          index: 0,
          to: batch.calls[0]!.to,
          data: '0x1234',
          value: '0',
          method: 'execute',
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
          address: batch.calls[0]!.to,
          name: 'Target',
          verified: true,
          callIndexes: [0],
        },
      ],
      warnings: [],
      blockNumber: 123,
      callGas: '21000',
      simulationIds: ['sim-1'],
      shareUrls: [],
      simulationFingerprint: `0x${'1'.repeat(64)}`,
      riskHash: `0x${'2'.repeat(64)}`,
    }),
  };
}

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

function createService(client = createClient()) {
  return createPrivyWalletExecutionService({
    client,
    tenderlySimulationService: simulationService(),
  });
}

function confirmRequest(previewId: string): PrivyConfirmSendCallsRequest {
  return {
    previewId,
    userSignature: 'mock-user-signature',
    authorizationSignature: 'mock-authorization-signature',
  };
}

describe('PrivyWalletExecutionService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(PrivyClient).mockReset();
  });

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

  it('rejects an invalid Privy access token before wallet lookup', async () => {
    const client = createClient();
    vi.mocked(client.verifyAccessToken).mockRejectedValue(
      new Error('invalid jwt'),
    );

    await expect(
      createService(client).prepareSendCalls(batch, accessToken),
    ).rejects.toMatchObject({ statusCode: 401 });
    expect(client.getUserWallets).not.toHaveBeenCalled();
  });

  it('rejects a non-JWT bearer token', async () => {
    await expect(
      createService().prepareSendCalls(batch, 'opaque-token'),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('rejects a wallet not owned by the authenticated user', async () => {
    const client = createClient();
    vi.mocked(client.getUserWallets).mockResolvedValue([]);

    await expect(
      createService(client).prepareSendCalls(batch, accessToken),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'Privy wallet does not belong to the authenticated user',
    });
  });

  it('returns 503 when Privy is not configured', async () => {
    const service = createPrivyWalletExecutionService({
      tenderlySimulationService: simulationService(),
    });

    await expect(
      service.prepareSendCalls(batch, accessToken),
    ).rejects.toMatchObject({ statusCode: 503 });
  });

  it('rejects a signature that does not recover the wallet address', async () => {
    const viem = await import('viem');
    vi.mocked(viem.verifyTypedData).mockResolvedValueOnce(false);
    const client = createClient();
    const service = createService(client);
    const prepared = await service.prepareSendCalls(batch, accessToken);
    if (prepared.status !== 'passed')
      throw new Error('Expected passed preview');

    await expect(
      service.confirmSendCalls(confirmRequest(prepared.previewId), accessToken),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'Invalid signature or signer mismatch',
    });
    expect(client.sendCalls).not.toHaveBeenCalled();
  });

  it('treats signature verification errors as invalid signatures', async () => {
    const viem = await import('viem');
    vi.mocked(viem.verifyTypedData).mockRejectedValueOnce(
      new Error('bad signature encoding'),
    );
    const service = createService();
    const prepared = await service.prepareSendCalls(batch, accessToken);
    if (prepared.status !== 'passed')
      throw new Error('Expected passed preview');

    await expect(
      service.confirmSendCalls(confirmRequest(prepared.previewId), accessToken),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it.each([
    new Error('expired jwt token'),
    Object.assign(new Error('upstream failed'), {
      error: 'invalid auth token in request',
    }),
    Object.assign(new Error('upstream failed'), {
      error: { code: 'invalid jwt' },
    }),
  ])('maps Privy user JWT failures to 401', async (upstreamError) => {
    const client = createClient();
    vi.mocked(client.sendCalls).mockRejectedValue(upstreamError);
    const service = createService(client);
    const prepared = await service.prepareSendCalls(batch, accessToken);
    if (prepared.status !== 'passed')
      throw new Error('Expected passed preview');

    await expect(
      service.confirmSendCalls(confirmRequest(prepared.previewId), accessToken),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('wraps non-auth Privy submission failures as 502', async () => {
    const client = createClient();
    vi.mocked(client.sendCalls).mockRejectedValue(
      new Error('upstream relay rejected'),
    );
    const service = createService(client);
    const prepared = await service.prepareSendCalls(batch, accessToken);
    if (prepared.status !== 'passed')
      throw new Error('Expected passed preview');

    await expect(
      service.confirmSendCalls(confirmRequest(prepared.previewId), accessToken),
    ).rejects.toMatchObject({
      statusCode: 502,
      message: expect.stringContaining('upstream relay rejected'),
    });
  });

  describe('real Privy client adapter', () => {
    function installMockPrivyClient(options?: {
      linkedAccounts?: unknown[];
      requestExpiry?: number;
    }) {
      const verifyAccessToken = vi
        .fn()
        .mockResolvedValue({ user_id: 'real-privy-user' });
      const getUser = vi.fn().mockResolvedValue({
        linked_accounts: options?.linkedAccounts ?? [
          {
            id: batch.walletId,
            address: batch.walletAddress,
            type: 'wallet',
            wallet_client_type: 'privy',
            connector_type: 'embedded',
          },
        ],
      });
      const sendCalls = vi.fn().mockResolvedValue({
        transaction_id: 'real-privy-tx-id',
        caip2: 'eip155:8453',
      });

      function MockPrivyClient(this: Record<string, unknown>) {
        this['utils'] = () => ({ auth: () => ({ verifyAccessToken }) });
        this['users'] = () => ({ _get: getUser });
        this['wallets'] = () => ({ ethereum: () => ({ sendCalls }) });
        this['getRequestExpiry'] = vi
          .fn()
          .mockReturnValue(options?.requestExpiry ?? 1_800_000_000_000);
      }
      vi.mocked(PrivyClient).mockImplementation(
        MockPrivyClient as unknown as typeof PrivyClient,
      );
      return { getUser, sendCalls };
    }

    it('prepares and submits through the Privy SDK adapter', async () => {
      const { sendCalls } = installMockPrivyClient();
      const service = createPrivyWalletExecutionService({
        appId: 'real-app-id',
        appSecret: 'real-app-secret',
        tenderlySimulationService: simulationService(),
      });
      const prepared = await service.prepareSendCalls(batch, accessToken);
      if (prepared.status !== 'passed')
        throw new Error('Expected passed preview');

      const result = await service.confirmSendCalls(
        confirmRequest(prepared.previewId),
        accessToken,
      );

      expect(result).toMatchObject({
        status: 'submitted',
        transactionId: 'real-privy-tx-id',
      });
      expect(sendCalls).toHaveBeenCalledTimes(1);
    });

    it('filters out external linked wallets', async () => {
      const embedded = {
        id: batch.walletId,
        address: batch.walletAddress,
        type: 'wallet',
        wallet_client_type: 'privy',
        connector_type: 'embedded',
      };
      const external = {
        id: 'external-wallet-id',
        address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        type: 'wallet',
        wallet_client_type: 'metamask',
        connector_type: 'injected',
      };
      installMockPrivyClient({ linkedAccounts: [external, embedded] });
      const service = createPrivyWalletExecutionService({
        appId: 'real-app-id',
        appSecret: 'real-app-secret',
        tenderlySimulationService: simulationService(),
      });

      await expect(
        service.prepareSendCalls(batch, accessToken),
      ).resolves.toMatchObject({ status: 'passed' });
    });

    it('throws when Privy request expiry is disabled', async () => {
      installMockPrivyClient({ requestExpiry: 0 });
      const service = createPrivyWalletExecutionService({
        appId: 'real-app-id',
        appSecret: 'real-app-secret',
        tenderlySimulationService: simulationService(),
      });

      await expect(
        service.prepareSendCalls(batch, accessToken),
      ).rejects.toThrow('Privy request expiry is unexpectedly disabled');
    });
  });
});
