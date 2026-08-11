import { describe, expect, it, vi } from 'vitest';
import type { Address, Hash } from 'viem';

import { AcrossBridgeAdapter } from '../../src/adapters/across-bridge.adapter.js';

const USER = '0x1111111111111111111111111111111111111111' as Address;
const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address;
const ARB_USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as Address;
const ROUTER = '0x2222222222222222222222222222222222222222' as Address;
const SOURCE_HASH = `0x${'1'.repeat(64)}` as Hash;
const FILL_HASH = `0x${'2'.repeat(64)}` as Hash;
const DEST_HASH = `0x${'3'.repeat(64)}` as Hash;

function response(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as Response;
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

describe('AcrossBridgeAdapter coverage', () => {
  it('uses quote defaults when optional response fields are absent', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      response({
        swapTx: { to: ROUTER, data: '0x1234' },
        inputAmount: '1000000',
        expectedOutputAmount: '999000',
        minOutputAmount: '998000',
        fees: { total: { amountUsd: '0.004' } },
      }),
    );
    const adapter = new AcrossBridgeAdapter({
      integratorId: 'zap-pilot',
      fetch: fetcher as typeof fetch,
    });

    const quote = await adapter.quote(request);

    expect(quote).toMatchObject({
      provider: 'across',
      feeUsd: '0.004',
      gasUsd: '0',
      estimatedDurationSec: 0,
      approvals: [],
      calls: [
        expect.objectContaining({
          to: ROUTER,
          value: '0',
          chainId: 8453,
        }),
      ],
    });
    expect(quote).not.toHaveProperty('expiresAt');
    expect(fetcher.mock.calls[0]?.[1]).toEqual({
      headers: { Accept: 'application/json' },
    });
  });

  it('falls back to zero fees and surfaces quote API errors', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          swapTx: {
            to: ROUTER,
            data: '0x1234',
            gas: '90000',
            chainId: 8453,
          },
          inputAmount: '1000000',
          expectedOutputAmount: '999000',
          minOutputAmount: '998000',
          quoteExpiryTimestamp: 'not-a-number',
        }),
      )
      .mockResolvedValueOnce(response({}, false, 429));
    const adapter = new AcrossBridgeAdapter({
      integratorId: 'zap-pilot',
      fetch: fetcher as typeof fetch,
    });

    const quote = await adapter.quote(request);
    expect(quote.feeUsd).toBe('0');
    expect(quote.calls[0]?.gasLimit).toBe('90000');
    expect(quote).not.toHaveProperty('expiresAt');

    await expect(adapter.quote(request)).rejects.toThrow(
      'Across quote failed: 429',
    );
  });

  it('maps filled and settled status responses including destination hash fallbacks', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response({ status: 'SUCCESS', fillTx: FILL_HASH }))
      .mockResolvedValueOnce(
        response({ status: 'SETTLED', destinationTxHash: DEST_HASH }),
      );
    const controller = new AbortController();
    const adapter = new AcrossBridgeAdapter({
      apiKey: 'secret',
      integratorId: 'zap-pilot',
      baseUrl: 'https://across.test',
      fetch: fetcher as typeof fetch,
    });

    await expect(
      adapter.waitForCompletion({
        sourceTxHash: SOURCE_HASH,
        signal: controller.signal,
      }),
    ).resolves.toMatchObject({
      status: 'filled',
      destinationTxHash: FILL_HASH,
    });
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer secret',
      },
      signal: controller.signal,
    });

    await expect(
      adapter.waitForCompletion({ sourceTxHash: SOURCE_HASH }),
    ).resolves.toMatchObject({
      status: 'settled',
      destinationTxHash: DEST_HASH,
    });
  });

  it('maps failed status and surfaces status API errors', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response({ status: 'FAILED' }))
      .mockResolvedValueOnce(response({}, false, 503));
    const adapter = new AcrossBridgeAdapter({
      integratorId: 'zap-pilot',
      fetch: fetcher as typeof fetch,
    });

    await expect(
      adapter.waitForCompletion({ sourceTxHash: SOURCE_HASH }),
    ).resolves.toMatchObject({ status: 'failed' });
    await expect(
      adapter.waitForCompletion({ sourceTxHash: SOURCE_HASH }),
    ).rejects.toThrow('Across status failed: 503');
  });
});
