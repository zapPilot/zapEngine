import { describe, expect, it, vi } from 'vitest';
import type { Address, Hash } from 'viem';

import { LiFiBridgeAdapter } from '../../src/adapters/lifi-bridge.adapter.js';

const USER = '0x1111111111111111111111111111111111111111' as Address;
const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address;
const ARB_USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as Address;
const OTHER = '0x2222222222222222222222222222222222222222' as Address;
const SPENDER = '0x3333333333333333333333333333333333333333' as Address;
const ROUTER = '0x4444444444444444444444444444444444444444' as Address;
const SOURCE_HASH = `0x${'1'.repeat(64)}` as Hash;
const DEST_HASH = `0x${'2'.repeat(64)}` as Hash;

function response(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as Response;
}

function request() {
  return {
    fromChainId: 8453,
    toChainId: 1,
    fromToken: BASE_USDC,
    toToken: OTHER,
    fromAmount: '1000000',
    sender: USER,
    recipient: USER,
  };
}

describe('LiFiBridgeAdapter', () => {
  it('only handles canonical Base/Arbitrum USDC when explicitly allowed', () => {
    const canonicalRequest = {
      ...request(),
      toChainId: 42161,
      toToken: ARB_USDC,
    };
    const adapter = new LiFiBridgeAdapter({} as never);
    const fallbackAdapter = new LiFiBridgeAdapter({} as never, {
      allowCanonical: true,
    });

    expect(adapter.supports(request())).toBe(true);
    expect(adapter.supports(canonicalRequest)).toBe(false);
    expect(fallbackAdapter.supports(canonicalRequest)).toBe(true);
  });

  it('normalizes a LI.FI quote with an approval', async () => {
    const getQuote = vi.fn().mockResolvedValue({
      estimate: {
        fromAmount: '1000000',
        toAmount: '999000',
        toAmountMin: '998000',
        feeCostUsd: '0.01',
        gasCostUsd: '0.02',
        executionDuration: 12,
      },
      approval: {
        tokenAddress: BASE_USDC,
        spenderAddress: SPENDER,
        amount: '1000000',
      },
      transaction: {
        to: ROUTER,
        data: '0x1234',
        value: '0',
        chainId: 8453,
        gasLimit: '100000',
        meta: { intentType: 'BRIDGE' },
      },
      route: { id: 'route-1' },
    });
    const adapter = new LiFiBridgeAdapter({ getQuote } as never);

    const quote = await adapter.quote(request());

    expect(getQuote).toHaveBeenCalledWith({
      fromChain: 8453,
      toChain: 1,
      fromToken: BASE_USDC,
      toToken: OTHER,
      fromAmount: '1000000',
      fromAddress: USER,
      toAddress: USER,
      intentType: 'BRIDGE',
    });
    expect(quote).toMatchObject({
      provider: 'lifi',
      fromAmount: '1000000',
      toAmount: '999000',
      toAmountMin: '998000',
      feeUsd: '0.01',
      gasUsd: '0.02',
      estimatedDurationSec: 12,
      providerData: { id: 'route-1' },
    });
    expect(quote.approvals).toHaveLength(1);
    expect(quote.approvals[0]?.to).toBe(BASE_USDC);
    expect(quote.calls[0]?.to).toBe(ROUTER);
  });

  it('supports quotes without approvals or route metadata', async () => {
    const rawQuote = {
      estimate: {
        fromAmount: '1000000',
        toAmount: '999000',
        toAmountMin: '998000',
        feeCostUsd: '0.01',
        gasCostUsd: '0.02',
        executionDuration: 12,
      },
      transaction: {
        to: ROUTER,
        data: '0x1234',
        value: '0',
        chainId: 8453,
        meta: { intentType: 'BRIDGE' },
      },
    };
    const getQuote = vi.fn().mockResolvedValue(rawQuote);
    const adapter = new LiFiBridgeAdapter({ getQuote } as never);

    const quote = await adapter.quote(request());

    expect(quote.approvals).toEqual([]);
    expect(quote.providerData).toBe(rawQuote);
  });

  it('tracks a completed LI.FI transfer using quote chain ids', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        response({ status: 'DONE', receiving: { txHash: DEST_HASH } }),
      );
    const adapter = new LiFiBridgeAdapter({} as never, {
      fetch: fetcher as typeof fetch,
      statusBaseUrl: 'https://lifi.test',
    });

    const settlement = await adapter.waitForCompletion({
      sourceTxHash: SOURCE_HASH,
      quote: {
        provider: 'lifi',
        fromChainId: 8453,
        toChainId: 1,
        fromToken: BASE_USDC,
        toToken: OTHER,
        fromAmount: '1000000',
        toAmount: '999000',
        toAmountMin: '998000',
        feeUsd: '0.01',
        gasUsd: '0.02',
        estimatedDurationSec: 12,
        approvals: [],
        calls: [],
        providerData: {},
      },
    });

    expect(settlement).toMatchObject({
      status: 'settled',
      sourceTxHash: SOURCE_HASH,
      destinationTxHash: DEST_HASH,
    });
    expect(String(fetcher.mock.calls[0]?.[0])).toContain(
      `txHash=${SOURCE_HASH}`,
    );
    expect(String(fetcher.mock.calls[0]?.[0])).toContain('fromChain=8453');
    expect(String(fetcher.mock.calls[0]?.[0])).toContain('toChain=1');
  });

  it('maps terminal failures using explicit chain ids', async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ status: 'FAILED' }));
    const adapter = new LiFiBridgeAdapter({} as never, {
      fetch: fetcher as typeof fetch,
    });

    await expect(
      adapter.waitForCompletion({
        sourceTxHash: SOURCE_HASH,
        fromChainId: 8453,
        toChainId: 1,
      }),
    ).resolves.toMatchObject({
      status: 'failed',
      sourceTxHash: SOURCE_HASH,
    });
  });

  it('requires chain ids and surfaces status API errors', async () => {
    const adapterWithoutIds = new LiFiBridgeAdapter({} as never);
    await expect(
      adapterWithoutIds.waitForCompletion({ sourceTxHash: SOURCE_HASH }),
    ).rejects.toThrow('requires source and destination chain IDs');

    const fetcher = vi.fn().mockResolvedValue(response({}, false, 503));
    const adapter = new LiFiBridgeAdapter({} as never, {
      fetch: fetcher as typeof fetch,
    });
    await expect(
      adapter.waitForCompletion({
        sourceTxHash: SOURCE_HASH,
        fromChainId: 8453,
        toChainId: 1,
      }),
    ).rejects.toThrow('LI.FI status failed: 503');
  });
});
