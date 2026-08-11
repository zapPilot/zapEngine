import { describe, expect, it, vi } from 'vitest';
import type { Address, Hash } from 'viem';

import { EcoBridgeAdapter } from '../../src/adapters/eco-bridge.adapter.js';

const USER = '0x1111111111111111111111111111111111111111' as Address;
const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address;
const ARB_USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as Address;
const OTHER = '0x4444444444444444444444444444444444444444' as Address;
const PORTAL = '0x2222222222222222222222222222222222222222' as Address;
const PROVER = '0x3333333333333333333333333333333333333333' as Address;
const SOURCE_HASH = `0x${'1'.repeat(64)}` as Hash;
const DEST_HASH = `0x${'2'.repeat(64)}` as Hash;

function response(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as Response;
}

function ecoPayload(overrides: Record<string, unknown> = {}) {
  return {
    data: [
      {
        quoteID: 'quote-1',
        quoteData: {
          contracts: { sourcePortal: PORTAL, prover: PROVER },
          quoteResponse: {
            intentExecutionType: 'SELF_PUBLISH',
            sourceChainID: 8453,
            destinationChainID: 42161,
            sourceToken: BASE_USDC,
            destinationToken: ARB_USDC,
            sourceAmount: '1000000',
            destinationAmount: '999000',
            funder: USER,
            refundRecipient: USER,
            recipient: USER,
            deadline: '1800000000',
            encodedRoute: '0x1234',
            ...overrides,
          },
        },
      },
    ],
  };
}

const request = {
  fromChainId: 8453,
  toChainId: 42161,
  fromToken: BASE_USDC,
  toToken: ARB_USDC,
  fromAmount: '1000000',
  sender: USER,
  recipient: USER,
};

describe('EcoBridgeAdapter coverage', () => {
  it('rejects non-canonical routes through supports', () => {
    const adapter = new EcoBridgeAdapter({ dAppId: 'zap-pilot' });
    expect(adapter.supports(request)).toBe(true);
    expect(adapter.supports({ ...request, toChainId: 1 })).toBe(false);
    expect(adapter.supports({ ...request, fromToken: OTHER })).toBe(false);
  });

  it('normalizes fee decimal variants and optional duration defaults', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      response(
        ecoPayload({
          fees: [
            { amount: '1000000', token: { symbol: 'DAI', decimals: 6 } },
            {
              amount: '1000000000000000000',
              token: { symbol: 'USDC', decimals: 18 },
            },
            { amount: '100', token: { symbol: 'USDC', decimals: 2 } },
            { amount: '500000', token: { symbol: 'USDC' } },
          ],
        }),
      ),
    );
    const adapter = new EcoBridgeAdapter({
      dAppId: 'zap-pilot',
      fetch: fetcher as typeof fetch,
    });

    const quote = await adapter.quote(request);

    expect(quote).toMatchObject({
      provider: 'eco',
      feeUsd: '2.500000',
      gasUsd: '0',
      estimatedDurationSec: 0,
      expiresAt: 1_800_000_000,
    });
    expect(quote.calls[0]?.meta.estimatedDuration).toBe(0);
  });

  it('uses zero fees without a fee array and rejects unusable quote responses', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response(ecoPayload()))
      .mockResolvedValueOnce(response({ data: [] }))
      .mockResolvedValueOnce(response({}, false, 503));
    const adapter = new EcoBridgeAdapter({
      dAppId: 'zap-pilot',
      fetch: fetcher as typeof fetch,
    });

    expect((await adapter.quote(request)).feeUsd).toBe('0');
    await expect(adapter.quote(request)).rejects.toThrow(
      'Eco returned no SELF_PUBLISH quote',
    );
    await expect(adapter.quote(request)).rejects.toThrow(
      'Eco quote failed: 503',
    );
  });

  it('maps completed and failed intent statuses', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          data: {
            status: { status: 'COMPLETED' },
            fulfillment: { transactionHash: DEST_HASH },
          },
        }),
      )
      .mockResolvedValueOnce(
        response({ data: { status: { status: 'REFUNDED' } } }),
      );
    const controller = new AbortController();
    const adapter = new EcoBridgeAdapter({
      dAppId: 'zap-pilot',
      baseUrl: 'https://eco.test',
      fetch: fetcher as typeof fetch,
    });

    await expect(
      adapter.waitForCompletion({
        sourceTxHash: SOURCE_HASH,
        signal: controller.signal,
      }),
    ).resolves.toMatchObject({
      status: 'settled',
      destinationTxHash: DEST_HASH,
    });
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      signal: controller.signal,
    });

    await expect(
      adapter.waitForCompletion({ sourceTxHash: SOURCE_HASH }),
    ).resolves.toMatchObject({ status: 'failed' });
  });

  it('surfaces status API failures', async () => {
    const fetcher = vi.fn().mockResolvedValue(response({}, false, 502));
    const adapter = new EcoBridgeAdapter({
      dAppId: 'zap-pilot',
      fetch: fetcher as typeof fetch,
    });

    await expect(
      adapter.waitForCompletion({ sourceTxHash: SOURCE_HASH }),
    ).rejects.toThrow('Eco status failed: 502');
  });
});
