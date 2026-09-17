import { describe, expect, it } from 'vitest';

import { StockPriceDmaService } from '../../../../src/modules/stock-price/dmaService.js';

describe('StockPriceDmaService coverage', () => {
  it('skips the writer when there are no DMA snapshots', async () => {
    const service = new StockPriceDmaService({} as never);
    const writeDmaSnapshots = (
      service as unknown as {
        writeDmaSnapshots: (
          snapshots: never[],
          jobId: string,
          symbol: string,
        ) => Promise<{ recordsInserted: number }>;
      }
    ).writeDmaSnapshots.bind(service);

    await expect(writeDmaSnapshots([], 'job-empty', 'SPY')).resolves.toEqual({
      recordsInserted: 0,
    });
  });
});
