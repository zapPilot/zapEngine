import { describe, expect, it, vi } from 'vitest';
import type { Address } from 'viem';

import { EcoBridgeAdapter } from '../../src/adapters/eco-bridge.adapter.js';

const USER = '0x1111111111111111111111111111111111111111' as Address;
const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address;
const ARB_USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as Address;
const PORTAL = '0x2222222222222222222222222222222222222222' as Address;
const PROVER = '0x3333333333333333333333333333333333333333' as Address;

function response(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}

describe('EcoBridgeAdapter', () => {
  it('requests SELF_PUBLISH exact-in and builds approval + publishAndFund', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      response({
        data: [
          {
            quoteID: 'quote-1',
            solverID: 'solver-1',
            quoteData: {
              contracts: {
                sourcePortal: PORTAL,
                prover: PROVER,
              },
              quoteResponse: {
                intentExecutionType: 'SELF_PUBLISH',
                sourceChainID: 8453,
                destinationChainID: 42161,
                sourceToken: BASE_USDC,
                destinationToken: ARB_USDC,
                sourceAmount: '100000000',
                destinationAmount: '100000000',
                funder: USER,
                refundRecipient: USER,
                recipient: USER,
                deadline: 1_800_000_000,
                estimatedFulfillTimeSec: 7,
                encodedRoute: '0x1234',
                fees: [
                  {
                    amount: '1000',
                    token: { symbol: 'USDC', decimals: 6 },
                  },
                ],
              },
            },
          },
        ],
      }),
    );
    const adapter = new EcoBridgeAdapter({
      dAppId: 'zap-pilot',
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
      provider: 'eco',
      toAmount: '100000000',
      toAmountMin: '100000000',
      feeUsd: '0.001000',
      estimatedDurationSec: 7,
      expiresAt: 1_800_000_000,
    });
    expect(quote.approvals).toHaveLength(1);
    expect(quote.approvals[0]?.to).toBe(BASE_USDC);
    expect(quote.calls).toHaveLength(1);
    expect(quote.calls[0]?.to).toBe(PORTAL);
    expect(quote.calls[0]?.data).not.toBe('0x');

    const [url, init] = fetcher.mock.calls[0]!;
    expect(String(url)).toContain('/quotes/exactIn');
    expect(JSON.parse(String(init.body))).toMatchObject({
      dAppID: 'zap-pilot',
      intentExecutionTypes: ['SELF_PUBLISH'],
      quoteRequest: {
        sourceChainID: 8453,
        destinationChainID: 42161,
        sourceAmount: '100000000',
        funder: USER,
        recipient: USER,
        refundRecipient: USER,
      },
    });
  });
});
