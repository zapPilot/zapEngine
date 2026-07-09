import { describe, expect, it, vi } from 'vitest';

import { createTenderlySimulationService } from '../../../src/services/tenderly-simulation.service';

const WALLET = '0x1111111111111111111111111111111111111111';
const TARGET = '0x4444444444444444444444444444444444444444';

describe('TenderlySimulationService fetch errors', () => {
  it('fails closed as unavailable when the core simulation request throws', async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('socket hang up'));
    const service = createTenderlySimulationService({
      accountSlug: 'account-slug',
      projectSlug: 'project-slug',
      accessToken: 'secret-token',
      fetchFn,
    });

    const result = await service.simulateBundle({
      chainId: 8453,
      walletAddress: WALLET,
      calls: [{ to: TARGET, data: '0x1234', value: '0x1' }],
    });

    expect(result).toMatchObject({
      status: 'unavailable',
      unavailableReason: 'Tenderly simulation unavailable: socket hang up',
      calls: [
        expect.objectContaining({
          index: 0,
          to: TARGET,
          data: '0x1234',
          value: '1',
          status: 'skipped',
        }),
      ],
      shareUrls: [],
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('fails closed with a timeout reason when the core simulation request aborts', async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new DOMException('Timed out', 'AbortError'));
    const service = createTenderlySimulationService({
      accountSlug: 'account-slug',
      projectSlug: 'project-slug',
      accessToken: 'secret-token',
      fetchFn,
    });

    const result = await service.simulateBundle({
      chainId: 42161,
      walletAddress: WALLET,
      calls: [{ to: TARGET, data: '0xabcd', value: '0x2' }],
    });

    expect(result).toMatchObject({
      status: 'unavailable',
      unavailableReason: 'Tenderly simulation timed out',
      chainId: 42161,
      walletAddress: WALLET,
      calls: [
        expect.objectContaining({
          index: 0,
          to: TARGET,
          data: '0xabcd',
          value: '2',
          status: 'skipped',
          gasUsed: null,
          contractVerified: false,
        }),
      ],
      shareUrls: [],
      simulationIds: [],
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
