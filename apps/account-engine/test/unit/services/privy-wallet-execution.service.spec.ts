import { PrivyClient } from '@privy-io/node';
import type {
  PrivyConfirmSendCallsRequest,
  PrivyPrepareSendCallsRequest,
} from '@zapengine/types/api';
import { verifyTypedData } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
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
const TX_HASH = `0x${'4'.repeat(64)}`;

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
        },
      ],
      assetChanges: [],
      approvals: [],
      contracts: [
        {
          address: batch.calls[0]!.to,
          name: 'Target',
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
      transactionHash: TX_HASH,
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

  it('consumes one preview once when confirmations start together', async () => {
    const client = createClient();
    const service = createService(client);
    const preview = await service.prepareSendCalls(batch, accessToken);
    if (preview.status !== 'passed') throw new Error('Expected passed preview');
    const results = await Promise.allSettled([
      service.confirmSendCalls(confirmRequest(preview.previewId), accessToken),
      service.confirmSendCalls(confirmRequest(preview.previewId), accessToken),
    ]);
    expect(results.map((result) => result.status)).toEqual([
      'fulfilled',
      'rejected',
    ]);
    expect(client.sendCalls).toHaveBeenCalledOnce();
    expect(results[1]).toMatchObject({
      reason: { message: 'Simulation preview not found' },
    });
  });

  it('blocks another preview for the same wallet while submission is pending', async () => {
    const client = createClient();
    const service = createService(client);
    const first = await service.prepareSendCalls(batch, accessToken);
    const second = await service.prepareSendCalls(
      { ...batch, idempotencyKey: 'second-request' },
      accessToken,
    );
    if (first.status !== 'passed' || second.status !== 'passed')
      throw new Error('Expected passed previews');
    let release!: (value: {
      transactionId: string;
      caip2: string;
      transactionHash: string;
    }) => void;
    vi.mocked(client.sendCalls).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const pending = service.confirmSendCalls(
      confirmRequest(first.previewId),
      accessToken,
    );
    await vi.waitFor(() => expect(client.sendCalls).toHaveBeenCalledOnce());
    await expect(
      service.confirmSendCalls(confirmRequest(second.previewId), accessToken),
    ).rejects.toThrow('Wallet execution already in progress');
    expect(client.sendCalls).toHaveBeenCalledOnce();
    release({
      transactionId: 'one',
      caip2: 'eip155:8453',
      transactionHash: TX_HASH,
    });
    await pending;
    await expect(
      service.confirmSendCalls(confirmRequest(second.previewId), accessToken),
    ).rejects.toThrow('Signature nonce does not match current wallet nonce');
  });

  it('releases the wallet lock after a failed submission', async () => {
    const client = createClient();
    const service = createService(client);
    const first = await service.prepareSendCalls(batch, accessToken);
    const second = await service.prepareSendCalls(
      { ...batch, idempotencyKey: 'retry-request' },
      accessToken,
    );
    if (first.status !== 'passed' || second.status !== 'passed')
      throw new Error('Expected passed previews');
    vi.mocked(client.sendCalls).mockRejectedValueOnce(
      new Error('provider unavailable'),
    );
    await expect(
      service.confirmSendCalls(confirmRequest(first.previewId), accessToken),
    ).rejects.toThrow('provider unavailable');
    await expect(
      service.confirmSendCalls(confirmRequest(second.previewId), accessToken),
    ).resolves.toMatchObject({ status: 'submitted' });
    expect(client.sendCalls).toHaveBeenCalledTimes(2);
  });

  it('rejects a preview that expires while ownership verification is pending', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000);
    const client = createClient();
    const service = createService(client);
    const prepared = await service.prepareSendCalls(batch, accessToken);
    if (prepared.status !== 'passed')
      throw new Error('Expected passed preview');
    let release!: (wallets: { id: string; address: string }[]) => void;
    vi.mocked(client.getUserWallets).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const confirmation = service.confirmSendCalls(
      confirmRequest(prepared.previewId),
      accessToken,
    );
    const assertion = expect(confirmation).rejects.toThrow(
      'Simulation preview has expired',
    );
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    now.mockReturnValue(prepared.expiresAt + 1);
    release([{ id: batch.walletId, address: batch.walletAddress }]);
    await assertion;
    expect(client.sendCalls).not.toHaveBeenCalled();
  });

  it.each(['valid', 'wrong signer', 'changed risk hash', 'changed calls hash'])(
    'checks a real EIP-712 signature (%s)',
    async (scenario) => {
      const owner = privateKeyToAccount(`0x${'1'.repeat(64)}`);
      const other = privateKeyToAccount(`0x${'2'.repeat(64)}`);
      const client = createClient();
      vi.mocked(client.getUserWallets).mockResolvedValue([
        { id: batch.walletId, address: owner.address },
      ]);
      const service = createService(client);
      const prepared = await service.prepareSendCalls(
        { ...batch, walletAddress: owner.address },
        accessToken,
      );
      if (prepared.status !== 'passed')
        throw new Error('Expected passed preview');
      const typedData = structuredClone(prepared.typedDataPayload);
      const message = typedData['message'] as Record<string, unknown>;
      if (scenario === 'changed risk hash')
        message['riskHash'] = `0x${'f'.repeat(64)}`;
      if (scenario === 'changed calls hash')
        message['callsHash'] = `0x${'f'.repeat(64)}`;
      const signer = scenario === 'wrong signer' ? other : owner;
      const signature = await signer.signTypedData(
        typedData as Parameters<typeof signer.signTypedData>[0],
      );
      const realViem = await vi.importActual<typeof import('viem')>('viem');
      vi.mocked(verifyTypedData).mockImplementationOnce(
        realViem.verifyTypedData,
      );
      const confirmation = service.confirmSendCalls(
        {
          ...confirmRequest(prepared.previewId),
          userSignature: signature,
        },
        accessToken,
      );
      if (scenario === 'valid') {
        await expect(confirmation).resolves.toMatchObject({
          status: 'submitted',
        });
        expect(client.sendCalls).toHaveBeenCalledExactlyOnceWith(
          batch.walletId,
          {
            ...batch,
            walletAddress: owner.address,
            authorizationSignature: 'mock-authorization-signature',
            requestExpiry: 1_800_000_000_000,
          },
          { signatures: ['mock-authorization-signature'] },
        );
      } else {
        await expect(confirmation).rejects.toMatchObject({
          statusCode: 400,
          message: 'Invalid signature or signer mismatch',
        });
        expect(client.sendCalls).not.toHaveBeenCalled();
      }
    },
  );

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

  it('rejects a confirm request for a non-existent preview', async () => {
    const service = createService();
    await expect(
      service.confirmSendCalls(confirmRequest('non-existent-id'), accessToken),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'Simulation preview not found',
    });
  });

  it('removes a preview after it is consumed', async () => {
    const service = createService();
    const prepared = await service.prepareSendCalls(batch, accessToken);
    if (prepared.status !== 'passed')
      throw new Error('Expected passed preview');

    await service.confirmSendCalls(
      confirmRequest(prepared.previewId),
      accessToken,
    );
    await expect(
      service.confirmSendCalls(confirmRequest(prepared.previewId), accessToken),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'Simulation preview not found',
    });
  });

  it('rejects a confirm request for an expired preview', async () => {
    vi.useFakeTimers();
    try {
      const service = createService();
      const prepared = await service.prepareSendCalls(batch, accessToken);
      if (prepared.status !== 'passed')
        throw new Error('Expected passed preview');

      vi.advanceTimersByTime(5 * 60 * 1000 + 1);

      await expect(
        service.confirmSendCalls(
          confirmRequest(prepared.previewId),
          accessToken,
        ),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: 'Simulation preview has expired',
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('starts the preview lifetime after Privy preparation completes', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-12T00:00:00.000Z'));
    try {
      const client = createClient();
      vi.mocked(client.prepareSendCalls).mockImplementationOnce(async () => {
        vi.advanceTimersByTime(60_000);
        return {
          authorizationPayload: 'base64-authorization-payload',
          requestExpiry: 1_800_000_000_000,
        };
      });

      const prepared = await createService(client).prepareSendCalls(
        batch,
        accessToken,
      );
      if (prepared.status !== 'passed') {
        throw new Error('Expected passed preview');
      }

      expect(prepared.expiresAt).toBe(
        new Date('2026-08-12T00:06:00.000Z').getTime(),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('sweeps expired previews when preparing a new preview', async () => {
    vi.useFakeTimers();
    try {
      const service = createService();
      const expired = await service.prepareSendCalls(batch, accessToken);
      if (expired.status !== 'passed') {
        throw new Error('Expected passed preview');
      }

      vi.advanceTimersByTime(5 * 60 * 1000 + 1);
      await service.prepareSendCalls(batch, accessToken);

      await expect(
        service.confirmSendCalls(
          confirmRequest(expired.previewId),
          accessToken,
        ),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: 'Simulation preview not found',
      });
    } finally {
      vi.useRealTimers();
    }
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

  it('wraps a primitive Privy error body as 502 instead of 401', async () => {
    const client = createClient();
    vi.mocked(client.sendCalls).mockRejectedValue({ error: 12345 });
    const service = createService(client);
    const prepared = await service.prepareSendCalls(batch, accessToken);
    if (prepared.status !== 'passed')
      throw new Error('Expected passed preview');

    await expect(
      service.confirmSendCalls(confirmRequest(prepared.previewId), accessToken),
    ).rejects.toMatchObject({
      statusCode: 502,
      message: expect.stringContaining('Privy Wallets API batch failed'),
    });
  });

  it('hashes calls that omit data and value with protocol defaults', async () => {
    const sparseBatch: PrivyPrepareSendCallsRequest = {
      ...batch,
      calls: [{ to: batch.calls[0]!.to }],
    };
    const prepared = await createService().prepareSendCalls(
      sparseBatch,
      accessToken,
    );

    expect(prepared.status).toBe('passed');
    if (prepared.status !== 'passed')
      throw new Error('Expected passed preview');
    expect(prepared.batchHash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('rejects with 401 when access-token verification throws a non-Error', async () => {
    const client = createClient();
    vi.mocked(client.verifyAccessToken).mockRejectedValue('token-bad-string');

    await expect(
      createService(client).prepareSendCalls(batch, accessToken),
    ).rejects.toMatchObject({ statusCode: 401 });
    expect(client.getUserWallets).not.toHaveBeenCalled();
  });

  it('executes the reviewed snapshot even if the caller mutates its request and preview', async () => {
    const client = createClient();
    const service = createService(client);
    const request = structuredClone(batch);
    const prepared = await service.prepareSendCalls(request, accessToken);
    if (prepared.status !== 'passed')
      throw new Error('Expected passed preview');

    request.walletAddress = '0x3333333333333333333333333333333333333333';
    request.chainId = 1;
    request.calls[0]!.to = request.walletAddress;
    request.calls[0]!.value = '0xff';
    prepared.requestExpiry = 1;
    prepared.typedDataPayload['message'] = {};

    await expect(
      service.confirmSendCalls(confirmRequest(prepared.previewId), accessToken),
    ).resolves.toMatchObject({ status: 'submitted' });
    expect(client.sendCalls).toHaveBeenCalledExactlyOnceWith(
      batch.walletId,
      {
        ...batch,
        authorizationSignature: 'mock-authorization-signature',
        requestExpiry: 1_800_000_000_000,
      },
      { signatures: ['mock-authorization-signature'] },
    );
  });

  it('maps a non-Error Privy JWT failure to 401', async () => {
    const client = createClient();
    vi.mocked(client.sendCalls).mockRejectedValue({
      error: { message: 'invalid jwt' },
    });
    const service = createService(client);
    const prepared = await service.prepareSendCalls(batch, accessToken);
    if (prepared.status !== 'passed')
      throw new Error('Expected passed preview');

    await expect(
      service.confirmSendCalls(confirmRequest(prepared.previewId), accessToken),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('wraps a non-Error Privy submission failure as 502', async () => {
    const client = createClient();
    vi.mocked(client.sendCalls).mockRejectedValue('network-boom-string');
    const service = createService(client);
    const prepared = await service.prepareSendCalls(batch, accessToken);
    if (prepared.status !== 'passed')
      throw new Error('Expected passed preview');

    await expect(
      service.confirmSendCalls(confirmRequest(prepared.previewId), accessToken),
    ).rejects.toMatchObject({
      statusCode: 502,
      message: expect.stringContaining('network-boom-string'),
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
      const getTransaction = vi.fn().mockResolvedValue({
        id: 'real-privy-tx-id',
        caip2: 'eip155:8453',
        created_at: Date.now(),
        status: 'broadcasted',
        transaction_hash: TX_HASH,
        wallet_id: batch.walletId,
      });

      function MockPrivyClient(this: Record<string, unknown>) {
        this['utils'] = () => ({ auth: () => ({ verifyAccessToken }) });
        this['users'] = () => ({ _get: getUser });
        this['wallets'] = () => ({ ethereum: () => ({ sendCalls }) });
        this['transactions'] = () => ({ get: getTransaction });
        this['getRequestExpiry'] = vi
          .fn()
          .mockReturnValue(options?.requestExpiry ?? 1_800_000_000_000);
      }
      vi.mocked(PrivyClient).mockImplementation(
        MockPrivyClient as unknown as typeof PrivyClient,
      );
      return { getUser, sendCalls, getTransaction };
    }

    it('prepares and submits through the Privy SDK adapter', async () => {
      const { sendCalls, getTransaction } = installMockPrivyClient();
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
        transactionHash: TX_HASH,
      });
      expect(sendCalls).toHaveBeenCalledExactlyOnceWith(batch.walletId, {
        caip2: 'eip155:8453',
        params: { calls: batch.calls },
        sponsor: false,
        idempotency_key: batch.idempotencyKey,
        request_expiry: 1_800_000_000_000,
        authorization_context: { signatures: ['mock-authorization-signature'] },
      });
      expect(getTransaction).toHaveBeenCalledWith('real-privy-tx-id');
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

    it('throws when Privy reports a terminal-failure transaction status', async () => {
      const { getTransaction } = installMockPrivyClient();
      vi.mocked(getTransaction).mockResolvedValue({
        id: 'real-privy-tx-id',
        caip2: 'eip155:8453',
        created_at: Date.now(),
        status: 'execution_reverted',
        wallet_id: batch.walletId,
      });
      const service = createPrivyWalletExecutionService({
        appId: 'real-app-id',
        appSecret: 'real-app-secret',
        tenderlySimulationService: simulationService(),
      });
      const prepared = await service.prepareSendCalls(batch, accessToken);
      if (prepared.status !== 'passed')
        throw new Error('Expected passed preview');

      await expect(
        service.confirmSendCalls(
          confirmRequest(prepared.previewId),
          accessToken,
        ),
      ).rejects.toThrow(
        'Privy transaction real-privy-tx-id reached execution_reverted without a transaction hash',
      );
    });

    it('resolves without a hash and warns when Privy never returns one before the polling timeout', async () => {
      vi.useFakeTimers();
      try {
        const { getTransaction } = installMockPrivyClient();
        vi.mocked(getTransaction).mockImplementation(async () => {
          await Promise.resolve();
          return {
            id: 'real-privy-tx-id',
            caip2: 'eip155:8453',
            created_at: Date.now(),
            status: 'broadcasted',
            wallet_id: batch.walletId,
          };
        });
        const warnSpy = vi
          .spyOn(console, 'warn')
          .mockImplementation(() => undefined);
        const service = createPrivyWalletExecutionService({
          appId: 'real-app-id',
          appSecret: 'real-app-secret',
          tenderlySimulationService: simulationService(),
        });
        const prepared = await service.prepareSendCalls(batch, accessToken);
        if (prepared.status !== 'passed')
          throw new Error('Expected passed preview');

        const confirmPromise = service.confirmSendCalls(
          confirmRequest(prepared.previewId),
          accessToken,
        );

        await vi.advanceTimersByTimeAsync(35_000);

        const result = await confirmPromise;

        expect(result).toMatchObject({
          status: 'submitted',
          transactionId: 'real-privy-tx-id',
        });
        expect(result).not.toHaveProperty('transactionHash');
        expect(warnSpy).toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it('attaches the last poll error to the timeout warning when getTransaction rejects', async () => {
      vi.useFakeTimers();
      try {
        const { getTransaction } = installMockPrivyClient();
        vi.mocked(getTransaction).mockRejectedValue(
          new Error('transient tenderly-api hiccup'),
        );
        const warnSpy = vi
          .spyOn(console, 'warn')
          .mockImplementation(() => undefined);
        const service = createPrivyWalletExecutionService({
          appId: 'real-app-id',
          appSecret: 'real-app-secret',
          tenderlySimulationService: simulationService(),
        });
        const prepared = await service.prepareSendCalls(batch, accessToken);
        if (prepared.status !== 'passed')
          throw new Error('Expected passed preview');

        const confirmPromise = service.confirmSendCalls(
          confirmRequest(prepared.previewId),
          accessToken,
        );

        await vi.advanceTimersByTimeAsync(35_000);

        const result = await confirmPromise;

        expect(result).toMatchObject({
          status: 'submitted',
          transactionId: 'real-privy-tx-id',
        });
        expect(result).not.toHaveProperty('transactionHash');
        expect(warnSpy).toHaveBeenCalled();
        const warningLine = warnSpy.mock.calls[0]?.[0] as string | undefined;
        expect(warningLine).toContain('transient tenderly-api hiccup');
      } finally {
        vi.useRealTimers();
      }
    });

    it('instantiates the default Tenderly service when individual Tenderly credentials are provided', () => {
      const service = createPrivyWalletExecutionService({
        appId: 'real-app-id',
        appSecret: 'real-app-secret',
        tenderlyAccountSlug: 'tenderly-account',
        tenderlyProjectSlug: 'tenderly-project',
        tenderlyAccessToken: 'tenderly-token',
      });

      expect(service).toBeDefined();
    });

    it('ignores embedded linked accounts without an id', async () => {
      installMockPrivyClient({
        linkedAccounts: [
          {
            type: 'wallet',
            wallet_client_type: 'privy',
            connector_type: 'embedded',
            address: batch.walletAddress,
          },
        ],
      });
      const service = createPrivyWalletExecutionService({
        appId: 'real-app-id',
        appSecret: 'real-app-secret',
        tenderlySimulationService: simulationService(),
      });

      await expect(
        service.prepareSendCalls(batch, accessToken),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: 'Privy wallet does not belong to the authenticated user',
      });
    });

    it('instantiates the default Tenderly service without Tenderly slugs', () => {
      const service = createPrivyWalletExecutionService({
        client: createClient(),
      });

      expect(service).toBeDefined();
    });
  });
});
