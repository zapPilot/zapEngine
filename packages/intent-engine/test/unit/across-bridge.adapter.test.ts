import { describe, expect, it, vi } from 'vitest';
import type { Address } from 'viem';

import { AcrossBridgeAdapter } from '../../src/adapters/across-bridge.adapter.js';

const USER = '0x1111111111111111111111111111111111111111' as Address;
const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address;
const ARB_USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as Address;
const APPROVER = '0x2222222222222222222222222222222222222222' as Address;
const ROUTER = '0x3333333333333333333333333333333333333333' as Address;

function response(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}

describe('AcrossBridgeAdapter', () => {
  it('maps /swap/approval into approvals[] + calls[]', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      response({
        approvalTxns: [
          { to: APPROVER, data: '0xaaaa', value: '0', chainId: 8453 },
        ],
        swapTx: { to: ROUTER, data: '0xbbbb', value: '0', chainId: 8453 },
        inputAmount: '100000000',
        expectedOutputAmount: '99990000',
        minOutputAmount: '99900000',
        expectedFillTime: 2,
        quoteExpiryTimestamp: 1_800_000_000,
        fees: {
          originGas: { amountUsd: '0.003' },
          totalFeeUsd: '0.01',
        },
      }),
    );
    const adapter = new AcrossBridgeAdapter({
      apiKey: 'secret',
      integratorId: 'zap-pilot',
      fetch: fetcher as typeof fetch,
    });

    const quote = await adapter.quote({
      fromChainId: 8453,
      toChainId: 42161,
      fromToken: BASE_USDC,
      toToken: ARB_USDC,
      fromAmount: '100000000',
      sender: USER,
      recipient: USER,
    });

    expect(quote).toMatchObject({
      provider: 'across',
      toAmount: '99990000',
      toAmountMin: '99900000',
      feeUsd: '0.01',
      gasUsd: '0.003',
      estimatedDurationSec: 2,
    });
    expect(quote.approvals).toHaveLength(1);
    expect(quote.calls).toHaveLength(1);
    expect(quote.calls[0]?.to).toBe(ROUTER);

    const [url, init] = fetcher.mock.calls[0]!;
    expect(String(url)).toContain('/swap/approval?');
    expect(String(url)).toContain('tradeType=exactInput');
    expect(String(url)).toContain('integratorId=zap-pilot');
    expect(init).toMatchObject({
      headers: expect.objectContaining({ Authorization: 'Bearer secret' }),
    });
  });

  it('only supports canonical USDC between Base and Arbitrum', () => {
    const adapter = new AcrossBridgeAdapter({ integratorId: 'zap-pilot' });
    expect(
      adapter.supports({
        fromChainId: 8453,
        toChainId: 42161,
        fromToken: BASE_USDC,
        toToken: ARB_USDC,
        fromAmount: '1',
        sender: USER,
        recipient: USER,
      }),
    ).toBe(true);
    expect(
      adapter.supports({
        fromChainId: 8453,
        toChainId: 1,
        fromToken: BASE_USDC,
        toToken: ARB_USDC,
        fromAmount: '1',
        sender: USER,
        recipient: USER,
      }),
    ).toBe(false);
  });
});
