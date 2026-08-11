import { describe, expect, it, vi } from 'vitest';
import type { Address } from 'viem';

import { composeDeposit } from '../../src/strategies/composeDeposit.js';

const USER = '0x1111111111111111111111111111111111111111' as Address;
const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address;
const ARB_USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as Address;
const ROUTER = '0x2222222222222222222222222222222222222222' as Address;

describe('composeDeposit LI.FI fallback', () => {
  it('keeps canonical Base to Arbitrum deposits working without an injected router', async () => {
    const getQuote = vi.fn().mockResolvedValue({
      estimate: {
        fromAmount: '1000000',
        toAmount: '999000',
        toAmountMin: '998000',
        feeCostUsd: '0.001',
        gasCostUsd: '0.002',
        executionDuration: 15,
      },
      transaction: {
        to: ROUTER,
        data: '0x1234',
        value: '0',
        chainId: 8453,
        gasLimit: '100000',
        meta: { intentType: 'BRIDGE' },
      },
      route: { id: 'legacy-lifi' },
    });

    const plan = await composeDeposit(
      {
        fromToken: BASE_USDC,
        fromAmount: '1000000',
        sourceChainId: 8453,
        userAddress: USER,
        split: { 42161: 1 },
      },
      {
        adapter: { getQuote } as never,
        publicClients: { 8453: {} as never },
      },
    );

    expect(getQuote).toHaveBeenCalledWith({
      fromChain: 8453,
      toChain: 42161,
      fromToken: BASE_USDC,
      toToken: ARB_USDC,
      fromAmount: '1000000',
      fromAddress: USER,
      toAddress: USER,
      intentType: 'BRIDGE',
    });
    expect(plan.legs).toEqual([
      expect.objectContaining({
        chainId: 42161,
        kind: 'bridge',
        bridge: 'lifi',
        toToken: ARB_USDC,
        toAmountMin: '998000',
      }),
    ]);
    expect(plan.calls).toHaveLength(1);
    expect(plan.totalGasUsd).toBe('0.002');
  });
});
