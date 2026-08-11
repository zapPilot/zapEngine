import { describe, expect, it, vi } from 'vitest';
import type { Address, Hash } from 'viem';

import {
  bridgeSettlement,
  isCanonicalBaseArbitrumUsdc,
  normalizeBridgeStatus,
  pollBridgeStatus,
  quoteIdentity,
  signalOptions,
} from '../../src/bridges/bridge-runtime.js';

const USER = '0x1111111111111111111111111111111111111111' as Address;
const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address;
const ARB_USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as Address;
const OTHER = '0x2222222222222222222222222222222222222222' as Address;
const SOURCE_HASH = `0x${'1'.repeat(64)}` as Hash;
const DEST_HASH = `0x${'2'.repeat(64)}` as Hash;

function request(
  overrides: Partial<{
    fromChainId: number;
    toChainId: number;
    fromToken: Address;
    toToken: Address;
  }> = {},
) {
  return {
    fromChainId: overrides.fromChainId ?? 8453,
    toChainId: overrides.toChainId ?? 42161,
    fromToken: overrides.fromToken ?? BASE_USDC,
    toToken: overrides.toToken ?? ARB_USDC,
    fromAmount: '1000000',
    sender: USER,
    recipient: USER,
  };
}

describe('bridge runtime helpers', () => {
  it('recognizes canonical Base/Arbitrum USDC in both directions only', () => {
    expect(isCanonicalBaseArbitrumUsdc(request())).toBe(true);
    expect(
      isCanonicalBaseArbitrumUsdc(
        request({
          fromChainId: 42161,
          toChainId: 8453,
          fromToken: ARB_USDC,
          toToken: BASE_USDC,
        }),
      ),
    ).toBe(true);
    expect(
      isCanonicalBaseArbitrumUsdc(request({ toChainId: 1 })),
    ).toBe(false);
    expect(
      isCanonicalBaseArbitrumUsdc(request({ fromToken: OTHER })),
    ).toBe(false);
    expect(
      isCanonicalBaseArbitrumUsdc(request({ toToken: OTHER })),
    ).toBe(false);
  });

  it('normalizes provider statuses across every settlement group', () => {
    const groups = {
      filled: ['filled'],
      settled: ['settled'],
      failed: ['failed'],
    } as const;

    expect(normalizeBridgeStatus('FILLED', groups)).toBe('filled');
    expect(normalizeBridgeStatus('SETTLED', groups)).toBe('settled');
    expect(normalizeBridgeStatus('FAILED', groups)).toBe('failed');
    expect(normalizeBridgeStatus('unknown', groups)).toBe('pending');
    expect(normalizeBridgeStatus(undefined, groups)).toBe('pending');
    expect(
      normalizeBridgeStatus('filled', {
        settled: ['settled'],
        failed: ['failed'],
      }),
    ).toBe('pending');
  });

  it('builds quote identity and settlement shapes with optional fields', () => {
    expect(quoteIdentity(request())).toEqual({
      fromChainId: 8453,
      toChainId: 42161,
      fromToken: BASE_USDC,
      toToken: ARB_USDC,
    });

    expect(
      bridgeSettlement({
        status: 'settled',
        sourceTxHash: SOURCE_HASH,
        destinationTxHash: DEST_HASH,
        providerData: { provider: 'test' },
      }),
    ).toEqual({
      status: 'settled',
      sourceTxHash: SOURCE_HASH,
      destinationTxHash: DEST_HASH,
      providerData: { provider: 'test' },
    });
    expect(
      bridgeSettlement({
        status: 'pending',
        sourceTxHash: SOURCE_HASH,
        providerData: null,
      }),
    ).toEqual({
      status: 'pending',
      sourceTxHash: SOURCE_HASH,
      providerData: null,
    });
  });

  it('only forwards a defined abort signal', () => {
    const controller = new AbortController();
    expect(signalOptions(controller.signal)).toEqual({
      signal: controller.signal,
    });
    expect(signalOptions(undefined)).toEqual({});
  });
});

describe('pollBridgeStatus', () => {
  it('returns immediately for a terminal first response', async () => {
    const fetchStatus = vi.fn().mockResolvedValue('settled');
    await expect(
      pollBridgeStatus({
        fetchStatus,
        isTerminal: (status) => status === 'settled',
        intervalMs: 0,
      }),
    ).resolves.toBe('settled');
    expect(fetchStatus).toHaveBeenCalledTimes(1);
  });

  it('polls again after a pending response', async () => {
    const fetchStatus = vi
      .fn()
      .mockResolvedValueOnce('pending')
      .mockResolvedValueOnce('settled');

    await expect(
      pollBridgeStatus({
        fetchStatus,
        isTerminal: (status) => status === 'settled',
        intervalMs: 0,
      }),
    ).resolves.toBe('settled');
    expect(fetchStatus).toHaveBeenCalledTimes(2);
  });

  it('rejects before polling when already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchStatus = vi.fn();

    await expect(
      pollBridgeStatus({
        fetchStatus,
        isTerminal: () => false,
        signal: controller.signal,
        intervalMs: 0,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchStatus).not.toHaveBeenCalled();
  });

  it('rejects when aborted while waiting for the next poll', async () => {
    const controller = new AbortController();
    const promise = pollBridgeStatus({
      fetchStatus: vi.fn().mockResolvedValue('pending'),
      isTerminal: () => false,
      signal: controller.signal,
      intervalMs: 100,
    });

    setTimeout(() => controller.abort(), 0);
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
  });
});
