import { describe, expect, it, vi } from 'vitest';
import type { Address } from 'viem';

import type { LiFiAdapter } from '../../src/adapters/lifi.adapter.js';
import { composeDeposit } from '../../src/strategies/composeDeposit.js';

const USER = '0x1111111111111111111111111111111111111111' as Address;
const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address;
const ETHEREUM_USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' as Address;
const LIFI_DIAMOND = '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE' as Address;

describe('composeDeposit zero-approval coverage', () => {
  it('ignores a zero-amount bridge approval requirement', async () => {
    const getQuote = vi.fn().mockResolvedValue({
      transaction: {
        to: LIFI_DIAMOND,
        data: '0x1234',
        value: '0',
        chainId: 8453,
        gasLimit: '450000',
        meta: { intentType: 'BRIDGE' },
      },
      estimate: {
        fromAmount: '10000',
        toAmount: '10000',
        toAmountMin: '9900',
        gasCostUsd: '0.20',
        feeCostUsd: '0',
        executionDuration: 30,
        tool: 'across',
      },
      approval: {
        tokenAddress: BASE_USDC,
        spenderAddress: LIFI_DIAMOND,
        amount: '0',
      },
      route: { tool: 'across' },
    });
    const adapter = { getQuote } as unknown as LiFiAdapter;
    const readContract = vi.fn();
    const publicClients = {
      8453: {
        chain: { id: 8453 },
        readContract,
      },
    };

    const plan = await composeDeposit(
      {
        fromToken: BASE_USDC,
        fromAmount: '10000',
        sourceChainId: 8453,
        userAddress: USER,
        split: { 1: 1 },
      },
      {
        adapter,
        publicClients: publicClients as never,
      },
    );

    expect(getQuote).toHaveBeenCalledWith(
      expect.objectContaining({
        fromChain: 8453,
        toChain: 1,
        fromToken: BASE_USDC,
        toToken: ETHEREUM_USDC,
        fromAmount: '10000',
        fromAddress: USER,
        toAddress: USER,
      }),
    );
    expect(plan.legs).toHaveLength(1);
    expect(plan.calls).toHaveLength(1);
    expect(plan.approvals).toEqual([]);
    expect(readContract).not.toHaveBeenCalled();
  });
});
