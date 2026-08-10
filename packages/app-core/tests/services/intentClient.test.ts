import {
  BridgeFailedError,
  waitForBridgeCompletion,
} from '@core/services/intentClient';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const TX_HASH =
  '0xabc0000000000000000000000000000000000000000000000000000000000001';
const DEST_HASH =
  '0xdef0000000000000000000000000000000000000000000000000000000000002';

const mocks = vi.hoisted(() => ({
  waitForBridgeCompletion: vi.fn(),
}));

vi.mock('@zapengine/intent-engine', () => ({
  createIntentEngine: () => ({
    waitForBridgeCompletion: mocks.waitForBridgeCompletion,
  }),
}));

describe('waitForBridgeCompletion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delegates tracking to the selected bridge provider', async () => {
    mocks.waitForBridgeCompletion.mockResolvedValue({
      status: 'settled',
      sourceTxHash: TX_HASH,
      destinationTxHash: DEST_HASH,
    });

    await expect(
      waitForBridgeCompletion({
        provider: 'eco',
        txHash: TX_HASH,
        fromChain: 8453,
        toChain: 42161,
      }),
    ).resolves.toEqual({
      status: 'settled',
      sourceTxHash: TX_HASH,
      destinationTxHash: DEST_HASH,
    });

    expect(mocks.waitForBridgeCompletion).toHaveBeenCalledWith({
      provider: 'eco',
      sourceTxHash: TX_HASH,
      fromChainId: 8453,
      toChainId: 42161,
    });
  });

  it('normalizes a provider failure into BridgeFailedError', async () => {
    mocks.waitForBridgeCompletion.mockResolvedValue({
      status: 'failed',
      sourceTxHash: TX_HASH,
    });

    await expect(
      waitForBridgeCompletion({
        provider: 'across',
        txHash: TX_HASH,
        fromChain: 8453,
        toChain: 42161,
      }),
    ).rejects.toBeInstanceOf(BridgeFailedError);
  });

  it('forwards quote and abort signal to provider tracking', async () => {
    const controller = new AbortController();
    const quote = {
      provider: 'lifi' as const,
      fromChainId: 8453,
      toChainId: 1337,
      fromToken: '0x1111111111111111111111111111111111111111' as const,
      toToken: '0x2222222222222222222222222222222222222222' as const,
      fromAmount: '1000000',
      toAmount: '999000',
      toAmountMin: '990000',
      feeUsd: '0.001',
      gasUsd: '0.01',
      estimatedDurationSec: 3,
      approvals: [],
      calls: [],
      providerData: {},
    };
    mocks.waitForBridgeCompletion.mockResolvedValue({
      status: 'settled',
      sourceTxHash: TX_HASH,
    });

    await waitForBridgeCompletion({
      provider: 'lifi',
      txHash: TX_HASH,
      fromChain: 8453,
      toChain: 1337,
      quote,
      signal: controller.signal,
    });

    expect(mocks.waitForBridgeCompletion).toHaveBeenCalledWith({
      provider: 'lifi',
      sourceTxHash: TX_HASH,
      fromChainId: 8453,
      toChainId: 1337,
      quote,
      signal: controller.signal,
    });
  });
});
