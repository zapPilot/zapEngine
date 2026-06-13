import { PrivyClient } from '@privy-io/node';
import type {
  PrivyConfirmSendCallsRequest,
  PrivyPrepareSendCallsRequest,
} from '@zapengine/types/api';
import { encodeFunctionData, erc20Abi } from 'viem';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

vi.mock('@privy-io/node', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@privy-io/node')>();
  return {
    ...actual,
    PrivyClient: vi.fn(),
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

function buildConfirmRequest(
  prep: { previewId: string },
  userSignature = 'mock-user-eip712-signature',
  authorizationSignature = 'base64-authorization-signature',
): PrivyConfirmSendCallsRequest {
  return {
    previewId: prep.previewId,
    userSignature,
    authorizationSignature,
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

    const prep = await service.prepareSendCalls(batch, accessToken);
    const confirmReq = buildConfirmRequest(prep);

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
    const confirmReq = buildConfirmRequest(prep);

    await service.confirmSendCalls(confirmReq, accessToken);

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

    const confirmReq = buildConfirmRequest(prep);

    await expect(
      service.confirmSendCalls(confirmReq, accessToken),
    ).rejects.toMatchObject({
      statusCode: 401,
      message:
        'Privy user access token is invalid or expired. Please re-login.',
    });
  });
});

describe('PrivyWalletExecutionService — coverage paths', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('verifyWalletOwnership', () => {
    it('returns 503 when Privy client is not configured', async () => {
      const service = createPrivyWalletExecutionService({});

      await expect(
        service.prepareSendCalls(batch, accessToken),
      ).rejects.toMatchObject({
        statusCode: 503,
        message: 'Privy Wallets API is not configured on account-engine',
      });
    });

    it('rejects when access token is not a JWT (3 segments)', async () => {
      const service = createPrivyWalletExecutionService({
        client: createClient(),
      });

      await expect(
        service.prepareSendCalls(batch, 'opaque-session-token'),
      ).rejects.toMatchObject({
        statusCode: 401,
        message:
          'Privy user access token is invalid or expired. Please re-login.',
      });
    });

    it('rejects when the wallet does not belong to the authenticated user', async () => {
      const client = createClient();
      vi.mocked(client.getUserWallets).mockResolvedValue([
        {
          id: 'attacker-wallet-id',
          address: '0x9999999999999999999999999999999999999999',
        },
      ]);
      const service = createPrivyWalletExecutionService({ client });

      await expect(
        service.prepareSendCalls(batch, accessToken),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: 'Privy wallet does not belong to the authenticated user',
      });
    });

    it('rejects with 401 (and no cause) when verifyAccessToken throws a non-Error value', async () => {
      const client = createClient();
      vi.mocked(client.verifyAccessToken).mockRejectedValue(
        'string-thrown-from-privy',
      );
      const service = createPrivyWalletExecutionService({ client });

      await expect(
        service.prepareSendCalls(batch, accessToken),
      ).rejects.toMatchObject({
        statusCode: 401,
        message:
          'Privy user access token is invalid or expired. Please re-login.',
      });
    });
  });

  describe('decodeBatchCalls (called via prepareSendCalls)', () => {
    it('decodes an approve call (0x095ea7b3) and extracts token/spender/amount', async () => {
      const tokenAddr = '0x2222222222222222222222222222222222222222';
      const spender = '0x3333333333333333333333333333333333333333';
      const amount = 1_000_000n;
      const approveData = encodeFunctionData({
        abi: erc20Abi,
        functionName: 'approve',
        args: [spender, amount],
      });

      const approveBatch: PrivyPrepareSendCallsRequest = {
        ...batch,
        calls: [{ to: tokenAddr, data: approveData, value: '0x0' }],
      };

      const service = createPrivyWalletExecutionService({
        client: createClient(),
      });

      const result = await service.prepareSendCalls(approveBatch, accessToken);

      expect(result.decodedCalls).toEqual([
        {
          type: 'approve',
          to: tokenAddr,
          token: tokenAddr,
          spender,
          amount: amount.toString(),
        },
      ]);
      expect(result.assetChanges).toEqual([
        {
          type: 'transfer',
          token: 'USDC',
          tokenAddress: tokenAddr,
          from: batch.walletAddress,
          to: spender,
          amount: amount.toString(),
        },
      ]);
    });

    it('falls back to unknown for the 0x6e553573 supply selector with malformed calldata', async () => {
      const service = createPrivyWalletExecutionService({
        client: createClient(),
      });

      const supplyBatch: PrivyPrepareSendCallsRequest = {
        ...batch,
        calls: [
          {
            to: '0x4444444444444444444444444444444444444444',
            data: '0x6e553573deadbeefcafebabe',
            value: '0x0',
          },
        ],
      };

      const result = await service.prepareSendCalls(supplyBatch, accessToken);

      expect(result.decodedCalls).toEqual([
        {
          type: 'unknown',
          to: '0x4444444444444444444444444444444444444444',
          data: '0x6e553573deadbeefcafebabe',
          value: '0x0',
        },
      ]);
    });

    it('falls back to unknown for the 0x94b918de supply selector with malformed calldata', async () => {
      const service = createPrivyWalletExecutionService({
        client: createClient(),
      });

      const supplyBatch: PrivyPrepareSendCallsRequest = {
        ...batch,
        calls: [
          {
            to: '0x5555555555555555555555555555555555555555',
            data: '0x94b918defeedface',
            value: '0x0',
          },
        ],
      };

      const result = await service.prepareSendCalls(supplyBatch, accessToken);

      expect(result.decodedCalls[0]?.type).toBe('unknown');
    });

    it('falls back to unknown for the 0x095ea7b3 selector with malformed calldata', async () => {
      const service = createPrivyWalletExecutionService({
        client: createClient(),
      });

      const malformedBatch: PrivyPrepareSendCallsRequest = {
        ...batch,
        calls: [
          {
            to: '0x2222222222222222222222222222222222222222',
            data: '0x095ea7b3deadbeef',
            value: '0x0',
          },
        ],
      };

      const result = await service.prepareSendCalls(
        malformedBatch,
        accessToken,
      );

      expect(result.decodedCalls).toEqual([
        {
          type: 'unknown',
          to: '0x2222222222222222222222222222222222222222',
          data: '0x095ea7b3deadbeef',
          value: '0x0',
        },
      ]);
    });

    it('falls back to unknown for an unrecognized function selector', async () => {
      const service = createPrivyWalletExecutionService({
        client: createClient(),
      });

      const result = await service.prepareSendCalls(batch, accessToken);

      expect(result.decodedCalls).toEqual([
        {
          type: 'unknown',
          to: '0x2222222222222222222222222222222222222222',
          data: '0x1234',
          value: '0x0',
        },
      ]);
    });
  });

  describe('Tenderly simulation', () => {
    it('throws BadRequest when the preflight simulation reports a failure', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          bundle_id: 'failed-bundle-1',
          simulation_results: [
            {
              status: false,
              error_message: 'execution reverted: insufficient balance',
              gas_used: 21000,
            },
          ],
        }),
      });

      const service = createPrivyWalletExecutionService({
        client: createClient(),
        tenderlyAccount: 'acct',
        tenderlyProject: 'proj',
        tenderlyAccessKey: 'key',
      });

      await expect(
        service.prepareSendCalls(batch, accessToken),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining(
          'Preflight simulation failed: execution reverted: insufficient balance',
        ),
      });
    });

    it('falls back to mock when Tenderly returns a non-ok HTTP status', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({}),
      });
      globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

      const service = createPrivyWalletExecutionService({
        client: createClient(),
        tenderlyAccount: 'acct',
        tenderlyProject: 'proj',
        tenderlyAccessKey: 'key',
      });

      const result = await service.prepareSendCalls(batch, accessToken);

      expect(result.gasEstimate).toBe('350000');
      expect(result.tenderlyResult).toMatchObject({ mock: true });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('falls back to mock when the Tenderly fetch itself throws', async () => {
      const fetchSpy = vi.fn().mockRejectedValue(new Error('ECONNRESET'));
      globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

      const service = createPrivyWalletExecutionService({
        client: createClient(),
        tenderlyAccount: 'acct',
        tenderlyProject: 'proj',
        tenderlyAccessKey: 'key',
      });

      const result = await service.prepareSendCalls(batch, accessToken);

      expect(result.gasEstimate).toBe('350000');
      expect(result.tenderlyResult).toMatchObject({ mock: true });
    });

    it('returns the real Tenderly gas estimate on a successful preflight', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          bundle_id: 'real-bundle',
          simulation_results: [
            { status: true, gas_used: 120000 },
            { status: true, gas_used: 80000 },
          ],
        }),
      });

      const service = createPrivyWalletExecutionService({
        client: createClient(),
        tenderlyAccount: 'acct',
        tenderlyProject: 'proj',
        tenderlyAccessKey: 'key',
      });

      const result = await service.prepareSendCalls(batch, accessToken);

      expect(result.gasEstimate).toBe('200000');
      expect(result.tenderlyResult).toMatchObject({
        bundle_id: 'real-bundle',
      });
    });

    it('throws BadRequest when the pre-broadcast Tenderly re-simulation fails', async () => {
      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(async () => {
        callCount += 1;
        if (callCount === 1) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              bundle_id: 'preflight-bundle',
              simulation_results: [{ status: true, gas_used: 100000 }],
            }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            bundle_id: 'rebroadcast-bundle',
            simulation_results: [
              {
                status: false,
                error_message: 'state changed: oracle price moved',
                gas_used: 80000,
              },
            ],
          }),
        };
      });

      const service = createPrivyWalletExecutionService({
        client: createClient(),
        tenderlyAccount: 'acct',
        tenderlyProject: 'proj',
        tenderlyAccessKey: 'key',
      });

      const prep = await service.prepareSendCalls(batch, accessToken);
      const confirmReq = buildConfirmRequest(prep);

      await expect(
        service.confirmSendCalls(confirmReq, accessToken),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining(
          'Pre-broadcast simulation failed: state changed: oracle price moved',
        ),
      });
      expect(callCount).toBe(2);
    });
  });

  describe('confirmSendCalls', () => {
    it('rejects an unknown previewId with 400', async () => {
      const service = createPrivyWalletExecutionService({
        client: createClient(),
      });

      const confirmReq: PrivyConfirmSendCallsRequest = {
        previewId: 'nonexistent-preview-id',
        userSignature: '0x',
        authorizationSignature: '0x',
      };

      await expect(
        service.confirmSendCalls(confirmReq, accessToken),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: 'Simulation preview not found',
      });
    });

    it('rejects confirm when the EIP-712 signature does not recover the wallet address', async () => {
      const viem = await import('viem');
      vi.mocked(viem.verifyTypedData).mockResolvedValueOnce(false);

      const client = createClient();
      const service = createPrivyWalletExecutionService({ client });
      const prep = await service.prepareSendCalls(batch, accessToken);

      await expect(
        service.confirmSendCalls(buildConfirmRequest(prep), accessToken),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: 'Invalid signature or signer mismatch',
      });
      expect(client.sendCalls).not.toHaveBeenCalled();
    });

    it('treats a thrown verifyTypedData as an invalid signature', async () => {
      const viem = await import('viem');
      vi.mocked(viem.verifyTypedData).mockRejectedValueOnce(
        new Error('bad signature encoding'),
      );

      const client = createClient();
      const service = createPrivyWalletExecutionService({ client });
      const prep = await service.prepareSendCalls(batch, accessToken);

      await expect(
        service.confirmSendCalls(buildConfirmRequest(prep), accessToken),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: 'Invalid signature or signer mismatch',
      });
    });

    it('rejects confirm when the typed-data nonce has already been advanced by an earlier confirm', async () => {
      const client = createClient();
      const service = createPrivyWalletExecutionService({ client });

      const prepA = await service.prepareSendCalls(batch, accessToken);
      const prepB = await service.prepareSendCalls(batch, accessToken);

      await service.confirmSendCalls(buildConfirmRequest(prepA), accessToken);

      await expect(
        service.confirmSendCalls(buildConfirmRequest(prepB), accessToken),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: 'Signature nonce does not match current wallet nonce',
      });
    });

    it('returns 502 with a wrapped Privy Wallets API error on a non-JWT sendCalls failure', async () => {
      const client = createClient();
      const service = createPrivyWalletExecutionService({ client });
      const prep = await service.prepareSendCalls(batch, accessToken);

      vi.mocked(client.sendCalls).mockRejectedValue(
        new Error('upstream relay rejected: fee too low'),
      );

      await expect(
        service.confirmSendCalls(buildConfirmRequest(prep), accessToken),
      ).rejects.toMatchObject({
        statusCode: 502,
        message: expect.stringContaining(
          'Privy Wallets API batch failed: upstream relay rejected: fee too low',
        ),
      });
    });
  });

  describe('isPrivyUserJwtError shapes', () => {
    it('detects an "expired jwt" error message in a plain Error', async () => {
      const client = createClient();
      const service = createPrivyWalletExecutionService({ client });
      const prep = await service.prepareSendCalls(batch, accessToken);

      vi.mocked(client.sendCalls).mockRejectedValue(
        Object.assign(new Error('privy upstream failed'), {
          error: { message: 'expired jwt token' },
        }),
      );

      await expect(
        service.confirmSendCalls(buildConfirmRequest(prep), accessToken),
      ).rejects.toMatchObject({ statusCode: 401 });
    });

    it('detects "invalid auth token" inside a string error body', async () => {
      const client = createClient();
      const service = createPrivyWalletExecutionService({ client });
      const prep = await service.prepareSendCalls(batch, accessToken);

      vi.mocked(client.sendCalls).mockRejectedValue(
        Object.assign(new Error('privy upstream failed'), {
          error: 'invalid auth token in request',
        }),
      );

      await expect(
        service.confirmSendCalls(buildConfirmRequest(prep), accessToken),
      ).rejects.toMatchObject({ statusCode: 401 });
    });

    it('detects "invalid jwt" inside an object error body with only a `code` field', async () => {
      const client = createClient();
      const service = createPrivyWalletExecutionService({ client });
      const prep = await service.prepareSendCalls(batch, accessToken);

      vi.mocked(client.sendCalls).mockRejectedValue(
        Object.assign(new Error('privy upstream failed'), {
          error: { code: 'invalid jwt' },
        }),
      );

      await expect(
        service.confirmSendCalls(buildConfirmRequest(prep), accessToken),
      ).rejects.toMatchObject({ statusCode: 401 });
    });
  });

  describe('createPrivyClientAdapter (appId/appSecret path)', () => {
    function installMockPrivyClient(overrides?: {
      linked_accounts?: unknown[];
      getRequestExpiry?: () => number;
      verifyAccessToken?: ReturnType<typeof vi.fn>;
      sendCalls?: ReturnType<typeof vi.fn>;
    }) {
      const linkedAccount = {
        id: batch.walletId,
        address: batch.walletAddress,
        type: 'wallet',
        wallet_client_type: 'privy',
        connector_type: 'embedded',
      };
      const verifyAccessToken =
        overrides?.verifyAccessToken ??
        vi.fn().mockResolvedValue({ user_id: 'real-privy-user' });
      const _get = vi.fn().mockResolvedValue({
        linked_accounts: overrides?.linked_accounts ?? [linkedAccount],
      });
      const getRequestExpiry =
        overrides?.getRequestExpiry ??
        vi.fn().mockReturnValue(1_800_000_000_000);
      const sendCalls =
        overrides?.sendCalls ??
        vi.fn().mockResolvedValue({
          transaction_id: 'real-privy-tx-id',
          caip2: 'eip155:8453',
        });

      function MockPrivyClient(this: Record<string, unknown>) {
        this['utils'] = () => ({ auth: () => ({ verifyAccessToken }) });
        this['users'] = () => ({ _get });
        this['wallets'] = () => ({ ethereum: () => ({ sendCalls }) });
        this['getRequestExpiry'] = getRequestExpiry;
      }

      vi.mocked(PrivyClient).mockImplementation(
        MockPrivyClient as unknown as typeof PrivyClient,
      );

      return { _get, sendCalls, verifyAccessToken, getRequestExpiry };
    }

    it('builds an adapter from appId/appSecret when no client is provided', async () => {
      const { _get, sendCalls } = installMockPrivyClient();

      const service = createPrivyWalletExecutionService({
        appId: 'real-app-id',
        appSecret: 'real-app-secret',
      });

      const prep = await service.prepareSendCalls(batch, accessToken);
      const confirmReq = buildConfirmRequest(prep);

      const result = await service.confirmSendCalls(confirmReq, accessToken);

      expect(vi.mocked(PrivyClient)).toHaveBeenCalledWith({
        appId: 'real-app-id',
        appSecret: 'real-app-secret',
        apiUrl: 'https://api.privy.io',
      });
      expect(_get).toHaveBeenCalledWith('real-privy-user');
      expect(sendCalls).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        transactionId: 'real-privy-tx-id',
        caip2: 'eip155:8453',
      });
    });

    it('drops linked accounts that fail isEmbeddedWalletLinkedAccount (e.g. external wallets)', async () => {
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
      installMockPrivyClient({ linked_accounts: [external, embedded] });

      const service = createPrivyWalletExecutionService({
        appId: 'real-app-id',
        appSecret: 'real-app-secret',
      });

      const result = await service.prepareSendCalls(batch, accessToken);

      expect(result.previewId).toEqual(expect.any(String));
    });

    it('throws when getRequestExpiry is disabled (returns falsy)', async () => {
      installMockPrivyClient({
        getRequestExpiry: vi.fn().mockReturnValue(0),
      });

      const service = createPrivyWalletExecutionService({
        appId: 'real-app-id',
        appSecret: 'real-app-secret',
      });

      await expect(
        service.prepareSendCalls(batch, accessToken),
      ).rejects.toThrow('Privy request expiry is unexpectedly disabled');
    });

    it("throws BadRequest when none of the user's linked wallets match the requested walletId", async () => {
      const foreignEmbedded = {
        id: 'some-other-wallet',
        address: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        type: 'wallet',
        wallet_client_type: 'privy',
        connector_type: 'embedded',
      };
      installMockPrivyClient({ linked_accounts: [foreignEmbedded] });

      const service = createPrivyWalletExecutionService({
        appId: 'real-app-id',
        appSecret: 'real-app-secret',
      });

      await expect(
        service.prepareSendCalls(batch, accessToken),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: 'Privy wallet does not belong to the authenticated user',
      });
    });

    it('skips linked accounts that have no id (flatMap fallback to [])', async () => {
      const noIdEmbedded = {
        id: null,
        address: '0xcccccccccccccccccccccccccccccccccccccccc',
        type: 'wallet',
        wallet_client_type: 'privy',
        connector_type: 'embedded',
      };
      installMockPrivyClient({ linked_accounts: [noIdEmbedded] });

      const service = createPrivyWalletExecutionService({
        appId: 'real-app-id',
        appSecret: 'real-app-secret',
      });

      await expect(
        service.prepareSendCalls(batch, accessToken),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: 'Privy wallet does not belong to the authenticated user',
      });
    });
  });
});
