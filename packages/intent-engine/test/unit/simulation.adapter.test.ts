import { describe, it, expect, vi } from 'vitest';
import { createTenderlyBundleSimulationAdapter } from '../../src/adapters/simulation.adapter.js';

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

  it('returns failed with the stub reason when Tenderly halts on an invalid call', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      okResponse({
        simulation_results: [
          passedResult(),
          {
            transaction: null,
            simulation: {
              status: false,
              error_message:
                'agent call: insufficient funds for gas * price + value',
            },
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
      reason: 'agent call: insufficient funds for gas * price + value',
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

  it('classifies an AbortError as a bundle timeout', async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValue(new DOMException('aborted', 'AbortError'));
    const adapter = createTenderlyBundleSimulationAdapter({
      ...CONFIG,
      fetchFn,
      timeoutMs: 1,
    });

    await expect(adapter.simulateBundle(REQUEST)).resolves.toEqual({
      status: 'unavailable',
      reason: 'Tenderly bundle simulation timed out',
    });
  });

  it('stringifies a non-Error fetch rejection', async () => {
    const fetchFn = vi.fn().mockRejectedValue('offline');
    const adapter = createTenderlyBundleSimulationAdapter({
      ...CONFIG,
      fetchFn,
    });

    await expect(adapter.simulateBundle(REQUEST)).resolves.toEqual({
      status: 'unavailable',
      reason: 'Tenderly bundle simulation unavailable: offline',
    });
  });

  it('uses global fetch when no fetchFn is provided', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        okResponse({ simulation_results: [passedResult(), passedResult()] }),
      );
    vi.stubGlobal('fetch', fetchFn);
    try {
      const adapter = createTenderlyBundleSimulationAdapter(CONFIG);
      await expect(adapter.simulateBundle(REQUEST)).resolves.toEqual({
        status: 'passed',
      });
      expect(fetchFn).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('aborts a pending request after the configured timeout', async () => {
    vi.useFakeTimers();
    const fetchFn = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );
    const adapter = createTenderlyBundleSimulationAdapter({
      ...CONFIG,
      fetchFn: fetchFn as typeof fetch,
      timeoutMs: 25,
    });

    const pending = adapter.simulateBundle(REQUEST);
    await vi.advanceTimersByTimeAsync(26);
    await expect(pending).resolves.toEqual({
      status: 'unavailable',
      reason: 'Tenderly bundle simulation timed out',
    });
    expect((fetchFn.mock.calls[0]?.[1] as RequestInit).signal?.aborted).toBe(
      true,
    );
    vi.useRealTimers();
  });

  it('uses the generic revert reason when Tenderly supplies no message', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      okResponse({
        simulation_results: [
          { transaction: { status: false }, simulation: { status: false } },
        ],
      }),
    );
    const adapter = createTenderlyBundleSimulationAdapter({
      ...CONFIG,
      fetchFn,
    });

    await expect(
      adapter.simulateBundle({ ...REQUEST, calls: REQUEST.calls.slice(0, 1) }),
    ).resolves.toEqual({
      status: 'failed',
      reason: 'Simulation reverted',
    });
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
