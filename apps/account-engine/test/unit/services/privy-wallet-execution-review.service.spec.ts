import { PrivyClient } from '@privy-io/node';
import type {
  PrivyConfirmSendCallsRequest,
  PrivyPrepareSendCallsRequest,
  PrivySimulationWarning,
} from '@zapengine/types/api';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createPrivyWalletExecutionService,
  type PrivyWalletExecutionClient,
} from '../../../src/services/privy-wallet-execution.service';
import type {
  TenderlySimulationReview,
  TenderlySimulationService,
} from '../../../src/services/tenderly-simulation.service';

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

const WALLET = '0x1111111111111111111111111111111111111111';
const TARGET = '0x2222222222222222222222222222222222222222';
const FINGERPRINT = `0x${'1'.repeat(64)}` as const;
const CHANGED_FINGERPRINT = `0x${'2'.repeat(64)}` as const;
const RISK_HASH = `0x${'3'.repeat(64)}` as const;
const EMPTY_RISK_HASH = `0x${'4'.repeat(64)}` as const;

const batch: PrivyPrepareSendCallsRequest = {
  walletId: 'privy-wallet-id',
  walletAddress: WALLET,
  chainId: 8453,
  calls: [{ to: TARGET, data: '0x1234', value: '0x0' }],
  idempotencyKey: 'batch-request-id',
};

const accessToken = 'header.payload.signature';

function review(
  overrides: Partial<TenderlySimulationReview> = {},
): TenderlySimulationReview {
  return {
    status: 'passed',
    chainId: 8453,
    walletAddress: WALLET,
    calls: [
      {
        index: 0,
        to: TARGET,
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
      { address: TARGET, name: 'Target', verified: true, callIndexes: [0] },
    ],
    warnings: [],
    blockNumber: 123,
    callGas: '21000',
    simulationIds: ['sim-1'],
    shareUrls: ['https://www.tdly.co/shared/simulation/sim-1'],
    simulationFingerprint: FINGERPRINT,
    riskHash: EMPTY_RISK_HASH,
    ...overrides,
  } as TenderlySimulationReview;
}

function warningReview(
  overrides: Partial<TenderlySimulationReview> = {},
): TenderlySimulationReview {
  const warnings: PrivySimulationWarning[] = [
    {
      code: 'UNVERIFIED_CONTRACT',
      message: 'Target is unverified',
      callIndex: 0,
      address: TARGET,
    },
  ];
  return review({
    status: 'warning',
    warnings,
    riskHash: RISK_HASH,
    ...overrides,
  });
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

function createSimulationService(
  ...reviews: TenderlySimulationReview[]
): TenderlySimulationService {
  return {
    simulateBundle: vi.fn().mockImplementation(async () => {
      const next = reviews.shift();
      if (!next) throw new Error('Missing simulation fixture');
      return next;
    }),
  };
}

function confirmRequest(
  previewId: string,
  acknowledgedRiskHash?: string,
): PrivyConfirmSendCallsRequest {
  return {
    previewId,
    userSignature: 'mock-user-signature',
    authorizationSignature: 'mock-authorization-signature',
    ...(acknowledgedRiskHash ? { acknowledgedRiskHash } : {}),
  };
}

describe('PrivyWalletExecutionService review lifecycle', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(PrivyClient).mockReset();
  });

  it.each([
    review({ status: 'failed', failureReason: 'execution reverted' }),
    review({
      status: 'unavailable',
      unavailableReason: 'Tenderly simulation timed out',
    }),
  ])('returns a non-signable $status prepare response', async (simulation) => {
    const client = createClient();
    const service = createPrivyWalletExecutionService({
      client,
      tenderlySimulationService: createSimulationService(simulation),
    });

    const result = await service.prepareSendCalls(batch, accessToken);

    expect(result.status).toBe(simulation.status);
    expect(result).not.toHaveProperty('typedDataPayload');
    expect(result).not.toHaveProperty('authorizationPayload');
    expect(client.prepareSendCalls).not.toHaveBeenCalled();
  });

  it('signs the material simulation fingerprint and risk hash', async () => {
    const service = createPrivyWalletExecutionService({
      client: createClient(),
      tenderlySimulationService: createSimulationService(warningReview()),
    });

    const result = await service.prepareSendCalls(batch, accessToken);

    expect(result.status).toBe('warning');
    if (result.status !== 'warning')
      throw new Error('Expected warning preview');
    expect(result.typedDataPayload).toMatchObject({
      message: {
        simulationFingerprint: FINGERPRINT,
        riskHash: RISK_HASH,
      },
    });
  });

  it('requires the exact risk hash before confirming a warning preview', async () => {
    const client = createClient();
    const service = createPrivyWalletExecutionService({
      client,
      tenderlySimulationService: createSimulationService(warningReview()),
    });
    const prepared = await service.prepareSendCalls(batch, accessToken);
    if (prepared.status !== 'warning')
      throw new Error('Expected warning preview');

    await expect(
      service.confirmSendCalls(confirmRequest(prepared.previewId), accessToken),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'Warning risks must be acknowledged before signing',
    });
    expect(client.sendCalls).not.toHaveBeenCalled();
  });

  it('broadcasts when the material result is unchanged', async () => {
    const client = createClient();
    const initial = warningReview();
    const refreshed = warningReview({
      blockNumber: 999,
      callGas: '99999',
      simulationIds: ['sim-2'],
      shareUrls: [],
    });
    const service = createPrivyWalletExecutionService({
      client,
      tenderlySimulationService: createSimulationService(initial, refreshed),
    });
    const prepared = await service.prepareSendCalls(batch, accessToken);
    if (prepared.status !== 'warning')
      throw new Error('Expected warning preview');

    const result = await service.confirmSendCalls(
      confirmRequest(prepared.previewId, prepared.riskHash),
      accessToken,
    );

    expect(result).toEqual({
      status: 'submitted',
      transactionId: 'privy-transaction-id',
      caip2: 'eip155:8453',
    });
    expect(client.sendCalls).toHaveBeenCalledTimes(1);
  });

  it('returns a replacement review and consumes the old preview when material state changes', async () => {
    const client = createClient();
    const changed = warningReview({
      simulationFingerprint: CHANGED_FINGERPRINT,
      warnings: [
        {
          code: 'UNLIMITED_APPROVAL',
          message: 'Approval changed',
          callIndex: 0,
          address: TARGET,
        },
      ],
    });
    const service = createPrivyWalletExecutionService({
      client,
      tenderlySimulationService: createSimulationService(review(), changed),
    });
    const prepared = await service.prepareSendCalls(batch, accessToken);
    if (prepared.status !== 'passed')
      throw new Error('Expected passed preview');

    const result = await service.confirmSendCalls(
      confirmRequest(prepared.previewId),
      accessToken,
    );

    expect(result.status).toBe('review');
    if (result.status !== 'review') throw new Error('Expected review response');
    expect(result.preview).toMatchObject({
      status: 'warning',
      simulationFingerprint: CHANGED_FINGERPRINT,
      previewId: expect.not.stringMatching(prepared.previewId),
    });
    expect(client.sendCalls).not.toHaveBeenCalled();
    await expect(
      service.confirmSendCalls(confirmRequest(prepared.previewId), accessToken),
    ).rejects.toMatchObject({
      message: 'Simulation preview has already been consumed',
    });
  });

  it.each([
    review({ status: 'failed', failureReason: 'oracle moved' }),
    review({
      status: 'unavailable',
      unavailableReason: 'Tenderly simulation timed out',
    }),
  ])('never broadcasts when re-simulation is $status', async (refreshed) => {
    const client = createClient();
    const service = createPrivyWalletExecutionService({
      client,
      tenderlySimulationService: createSimulationService(review(), refreshed),
    });
    const prepared = await service.prepareSendCalls(batch, accessToken);
    if (prepared.status !== 'passed')
      throw new Error('Expected passed preview');

    const result = await service.confirmSendCalls(
      confirmRequest(prepared.previewId),
      accessToken,
    );

    expect(result).toEqual({ status: 'review', preview: refreshed });
    expect(client.sendCalls).not.toHaveBeenCalled();
  });

  it('does not advance the wallet nonce when submission fails', async () => {
    const client = createClient();
    vi.mocked(client.sendCalls)
      .mockRejectedValueOnce(new Error('relay unavailable'))
      .mockResolvedValueOnce({
        transactionId: 'second-transaction-id',
        caip2: 'eip155:8453',
      });
    const service = createPrivyWalletExecutionService({
      client,
      tenderlySimulationService: createSimulationService(
        review(),
        review(),
        review(),
        review(),
      ),
    });
    const first = await service.prepareSendCalls(batch, accessToken);
    const second = await service.prepareSendCalls(batch, accessToken);
    if (first.status !== 'passed' || second.status !== 'passed') {
      throw new Error('Expected passed previews');
    }

    await expect(
      service.confirmSendCalls(confirmRequest(first.previewId), accessToken),
    ).rejects.toMatchObject({ statusCode: 502 });
    await expect(
      service.confirmSendCalls(confirmRequest(second.previewId), accessToken),
    ).resolves.toMatchObject({
      status: 'submitted',
      transactionId: 'second-transaction-id',
    });
  });

  it('consumes a stale nonce preview without advancing the nonce again', async () => {
    const service = createPrivyWalletExecutionService({
      client: createClient(),
      tenderlySimulationService: createSimulationService(
        review(),
        review(),
        review(),
      ),
    });
    const first = await service.prepareSendCalls(batch, accessToken);
    const stale = await service.prepareSendCalls(batch, accessToken);
    if (first.status !== 'passed' || stale.status !== 'passed') {
      throw new Error('Expected passed previews');
    }
    await service.confirmSendCalls(
      confirmRequest(first.previewId),
      accessToken,
    );

    await expect(
      service.confirmSendCalls(confirmRequest(stale.previewId), accessToken),
    ).rejects.toMatchObject({
      message: 'Signature nonce does not match current wallet nonce',
    });
    await expect(
      service.confirmSendCalls(confirmRequest(stale.previewId), accessToken),
    ).rejects.toMatchObject({
      message: 'Simulation preview has already been consumed',
    });
  });
});
