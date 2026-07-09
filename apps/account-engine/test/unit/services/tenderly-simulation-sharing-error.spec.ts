import { describe, expect, it, vi } from 'vitest';

import { createTenderlySimulationService } from '../../../src/services/tenderly-simulation.service';

const WALLET = '0x1111111111111111111111111111111111111111';
const TARGET = '0x4444444444444444444444444444444444444444';

function simulationResponse(id: string): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      simulation_results: [
        {
          transaction: {
            status: true,
            to: TARGET,
            input: '0x1234',
            gas_used: 21_000,
            block_number: 123,
            method: 'execute',
            transaction_info: { asset_changes: [] },
          },
          simulation: {
            id,
            status: true,
            gas_used: 21_000,
            block_number: 123,
            method: 'execute',
          },
          contracts: [
            {
              address: TARGET,
              contract_name: 'Target',
              verified_by: 'tenderly',
            },
          ],
        },
      ],
    }),
  } as Response;
}

describe('TenderlySimulationService sharing errors', () => {
  it('keeps a successful simulation valid when public sharing throws', async () => {
    const warn = vi.fn();
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(simulationResponse('sim-share-throws'))
      .mockRejectedValueOnce(new Error('network down'));
    const service = createTenderlySimulationService({
      accountSlug: 'account-slug',
      projectSlug: 'project-slug',
      accessToken: 'secret-token',
      fetchFn,
      logger: { warn },
    });

    const result = await service.simulateBundle({
      chainId: 8453,
      walletAddress: WALLET,
      calls: [{ to: TARGET }],
    });

    expect(result.status).toBe('passed');
    expect(result.shareUrls).toEqual([]);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith(
      'Tenderly simulation sharing failed',
      expect.objectContaining({
        simulationId: 'sim-share-throws',
        error: 'network down',
      }),
    );
  });

  it('keeps a successful simulation valid when public sharing times out', async () => {
    const warn = vi.fn();
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(simulationResponse('sim-share-timeout'))
      .mockRejectedValueOnce(new DOMException('share timed out', 'AbortError'));
    const service = createTenderlySimulationService({
      accountSlug: 'account-slug',
      projectSlug: 'project-slug',
      accessToken: 'secret-token',
      fetchFn,
      logger: { warn },
    });

    const result = await service.simulateBundle({
      chainId: 8453,
      walletAddress: WALLET,
      calls: [{ to: TARGET }],
    });

    expect(result.status).toBe('passed');
    expect(result.shareUrls).toEqual([]);
    expect(result.simulationIds).toEqual(['sim-share-timeout']);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith(
      'Tenderly simulation sharing failed',
      expect.objectContaining({
        simulationId: 'sim-share-timeout',
        error: 'share timed out',
      }),
    );
  });
});
