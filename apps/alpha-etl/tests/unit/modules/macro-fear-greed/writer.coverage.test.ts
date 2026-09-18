import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MacroFearGreedWriter } from '../../../../src/modules/macro-fear-greed/writer.js';

vi.mock('../../../../src/utils/logger.js', async () => {
  const { mockLogger } = await import('../../../setup/mocks.js');
  return mockLogger();
});

vi.mock('../../../../src/config/database.js', () => ({
  getTableName: vi
    .fn()
    .mockImplementation((table: string) => `alpha_raw.${table.toLowerCase()}`),
}));

type MockClient = {
  query: ReturnType<typeof vi.fn>;
};

type WriterWithDatabaseClient = {
  withDatabaseClient: <T>(fn: (client: MockClient) => Promise<T>) => Promise<T>;
};

describe('MacroFearGreedWriter coverage', () => {
  let writer: MacroFearGreedWriter;
  let mockClient: MockClient;

  beforeEach(() => {
    vi.clearAllMocks();
    writer = new MacroFearGreedWriter();
    mockClient = { query: vi.fn() };
    vi.spyOn(
      writer as unknown as WriterWithDatabaseClient,
      'withDatabaseClient',
    ).mockImplementation(async (fn) => fn(mockClient));
  });

  it('maps string timestamps from the latest snapshot row', async () => {
    mockClient.query.mockResolvedValue({
      rows: [
        {
          score: '42.50',
          label: 'fear',
          source: 'cnn_fear_greed_unofficial',
          provider_updated_at: '2026-04-29T00:00:00.000Z',
          raw_rating: null,
          raw_data: null,
        },
      ],
    });

    const result = await writer.getLatestSnapshot();

    expect(result).toEqual({
      score: 42.5,
      label: 'fear',
      source: 'cnn_fear_greed_unofficial',
      updatedAt: '2026-04-29T00:00:00.000Z',
      rawRating: null,
      rawData: {},
    });
  });
});
