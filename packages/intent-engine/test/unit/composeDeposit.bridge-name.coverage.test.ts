import { describe, expect, it, vi } from 'vitest';
import type { Address } from 'viem';

import type { LiFiAdapter } from '../../src/adapters/lifi.adapter.js';
import {
  SUPPORTED_CHAINS,
  USDC_ADDRESS,
} from '../../src/registry/chains.js';
import { composeDeposit } from '../../src/strategies/composeDeposit.js';
import type { TransactionQuote } from '../../src/types/transaction.types.js';

const USER = '0x1111111111111111111111111111111111111111' as Address;
const LIFI_DIAMOND = '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE' as Address;

describe('composeDeposit bridge metadata coverage', () => {
  it('omits bridge metadata when the quote route tool is not a string', async () => {
    const quote: TransactionQuote = {
      transaction: {
        to: LIFI_DIAMOND,
        data: '0x1234',
        value: '0',
        chainId: SUPPORTED_CHAINS.BASE,
        gasLimit: '450000',
        meta: { intentType: 'BRIDGE' },
      },
      estimate: {
        fromAmount: '1000000',
        toAmount: '999000',
        toAmountMin: '998000',
        gasCostUsd: '0.42',
        feeCostUsd: '0.08',
        executionDuration: 37,
        tool: 'estimate-tool-is-not-route-tool',
      },
      route: {
        tool: 123,
        action: {
          fromChainId: SUPPORTED_CHAINS.BASE,
          toChainId: SUPPORTED_CHAINS.ETHEREUM,
        },
      },
    };
    const getQuote = vi.fn().mockResolvedValue(quote);
    const adapter = { getQuote } as unknown as LiFiAdapter;

    const plan = await composeDeposit(
      {
        fromToken: USDC_ADDRESS[SUPPORTED_CHAINS.BASE],
        fromAmount: '1000000',
        sourceChainId: SUPPORTED_CHAINS.BASE,
        userAddress: USER,
        split: { [SUPPORTED_CHAINS.ETHEREUM]: 1 },
      },
      {
        adapter,
        publicClients: {
          [SUPPORTED_CHAINS.BASE]: {
            chain: { id: SUPPORTED_CHAINS.BASE },
          },
        } as never,
      },
    );

    expect(getQuote).toHaveBeenCalledWith({
      fromChain: SUPPORTED_CHAINS.BASE,
      toChain: SUPPORTED_CHAINS.ETHEREUM,
      fromToken: USDC_ADDRESS[SUPPORTED_CHAINS.BASE],
      toToken: USDC_ADDRESS[SUPPORTED_CHAINS.ETHEREUM],
      fromAmount: '1000000',
      fromAddress: USER,
      toAddress: USER,
    });
    expect(plan.legs).toEqual([
      {
        chainId: SUPPORTED_CHAINS.ETHEREUM,
        kind: 'bridge',
        toToken: USDC_ADDRESS[SUPPORTED_CHAINS.ETHEREUM],
        fromAmount: '1000000',
        toAmountMin: '998000',
        gasUsd: '0.42',
        durationSec: 37,
      },
    ]);
    expect(plan.legs[0]).not.toHaveProperty('bridge');
    expect(plan.calls).toEqual([quote.transaction]);
    expect(plan.approvals).toEqual([]);
    expect(plan.totalGasUsd).toBe('0.42');
  });
});
