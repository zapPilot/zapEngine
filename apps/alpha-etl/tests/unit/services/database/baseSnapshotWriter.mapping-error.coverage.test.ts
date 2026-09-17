import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TokenPriceWriter } from '../../../../src/modules/token-price/writer.js';
import { logger } from '../../../../src/utils/logger.js';

vi.mock('../../../../src/utils/logger.js', async () => {
  const { mockLogger } = await import('../../../setup/mocks.js');
  return mockLogger();
});

describe('BaseSnapshotWriter latest snapshot mapping coverage', () => {
  let writer: TokenPriceWriter;
  let mockClient: { query: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockClient = { query: vi.fn() };
    writer = new TokenPriceWriter();

    vi.spyOn(
      writer as unknown as {
        withDatabaseClient: (
          fn: (client: typeof mockClient) => Promise<unknown>,
        ) => Promise<unknown>;
      },
      'withDatabaseClient',
    ).mockImplementation(async (fn) => fn(mockClient));
  });

  it('logs and rethrows when a latest snapshot cannot be mapped', async () => {
    mockClient.query.mockResolvedValue({
      rows: [
        {
          snapshot_date: 'not-a-date',
          price_usd: '50000',
          token_symbol: 'BTC',
        },
      ],
      rowCount: 1,
    });

    await expect(writer.getLatestSnapshot('BTC')).rejects.toThrow();

    expect(logger.error).toHaveBeenCalledWith(
      'Failed to map latest token snapshot',
      expect.objectContaining({ tokenSymbol: 'BTC', error: expect.any(Error) }),
    );
  });
});
