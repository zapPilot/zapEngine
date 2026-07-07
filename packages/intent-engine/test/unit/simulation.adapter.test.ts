import { describe, it, expect, vi } from 'vitest';
import {
  createTenderlyBundleSimulationAdapter,
  NoopSimulationAdapter,
} from '../../src/adapters/simulation.adapter.js';
import type { PreparedTransaction } from '../../src/types/transaction.types.js';

describe('NoopSimulationAdapter', () => {
  it('should return success true', async () => {
    const mockTx: PreparedTransaction = {
      to: '0x123',
      data: '0xdata',
      value: '0',
      chainId: 1,
      meta: {
        intentType: 'SWAP',
        estimatedGas: '50000',
      },
    };
    const adapter = new NoopSimulationAdapter();
    const result = await adapter.simulate(mockTx);

    expect(result).toEqual({ success: true });
  });
});

describe('createTenderlyBundleSimulationAdapter', () => {
  const CONFIG = {
    accountSlug: 'acct',
    projectSlug: 'proj',
    accessKey: 'key',
  };

  const REQUEST = {
    chainId: 8453,
    from: '0x1111111111111111111111111111111111111111',
    calls: [
      {
        to: '0x2222222222222222222222222222222222222222',
        data: '0x',
        value: '0',
      },
      {
        to: '0x3333333333333333333333333333333333333333',
        data: '0x',
        value: '0',
      },
    ],
  };

  function okResponse(body: unknown): Response {
    return new Response(JSON.stringify(body), { status: 200 });
  }

  function passedResult() {
    return { transaction: { status: true }, simulation: { status: true } };
  }

  it('returns passed when every call simulates successfully', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        okResponse({ simulation_results: [passedResult(), passedResult()] }),
      );
    const adapter = createTenderlyBundleSimulationAdapter({
      ...CONFIG,
      fetchFn,
    });

    await expect(adapter.simulateBundle(REQUEST)).resolves.toEqual({
      status: 'passed',
    });
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/account/acct/project/proj/simulate-bundle');
    const payload = JSON.parse(init.body as string) as {
      simulations: Array<{ network_id: string; from: string }>;
    };
    expect(payload.simulations).toHaveLength(2);
    expect(payload.simulations[0]?.network_id).toBe('8453');
  });

  it('returns failed with the revert reason when a call reverts', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      okResponse({
        simulation_results: [
          passedResult(),
          {
            transaction: { status: false, error_message: 'ERC20: allowance' },
            simulation: { status: true },
          },
        ],
      }),
    );
    const adapter = createTenderlyBundleSimulationAdapter({
      ...CONFIG,
      fetchFn,
    });

    await expect(adapter.simulateBundle(REQUEST)).resolves.toEqual({
      status: 'failed',
      reason: 'ERC20: allowance',
    });
  });

  it('returns unavailable on a non-2xx response', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(new Response('nope', { status: 503 }));
    const adapter = createTenderlyBundleSimulationAdapter({
      ...CONFIG,
      fetchFn,
    });

    const result = await adapter.simulateBundle(REQUEST);
    expect(result.status).toBe('unavailable');
  });

  it('returns unavailable on malformed payloads', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse({ nope: true }));
    const adapter = createTenderlyBundleSimulationAdapter({
      ...CONFIG,
      fetchFn,
    });

    const result = await adapter.simulateBundle(REQUEST);
    expect(result.status).toBe('unavailable');
  });

  it('returns unavailable when fetch rejects', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const adapter = createTenderlyBundleSimulationAdapter({
      ...CONFIG,
      fetchFn,
    });

    const result = await adapter.simulateBundle(REQUEST);
    expect(result.status).toBe('unavailable');
    expect(result.status === 'unavailable' ? result.reason : '').toContain(
      'ECONNREFUSED',
    );
  });

  it('returns unavailable when results are silently truncated without a revert', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(okResponse({ simulation_results: [passedResult()] }));
    const adapter = createTenderlyBundleSimulationAdapter({
      ...CONFIG,
      fetchFn,
    });

    const result = await adapter.simulateBundle(REQUEST);
    expect(result.status).toBe('unavailable');
  });
});
