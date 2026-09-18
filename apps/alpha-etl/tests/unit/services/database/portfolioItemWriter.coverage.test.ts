import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getDbClient } from '../../../../src/config/database.js';
import { PortfolioItemWriter } from '../../../../src/modules/wallet/portfolioWriter.js';
import type { PortfolioItemSnapshotInsert } from '../../../../src/types/database.js';

vi.mock('../../../../src/config/database.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../../src/config/database.js')>();
  return { ...actual, getDbClient: vi.fn() };
});

vi.mock('../../../../src/utils/logger.js', async () => {
  const { mockLogger } = await import('../../../setup/mocks.js');
  return mockLogger();
});

const position = (
  overrides: Record<string, unknown> = {},
): PortfolioItemSnapshotInsert =>
  ({
    wallet: '0xABC',
    chain: 'eth',
    name: 'Protocol',
    name_item: 'Position',
    id_raw: 'shared-protocol-id',
    asset_usd_value: 10,
    detail: {},
    snapshot_at: '2026-08-23T23:30:00.000Z',
    has_supported_portfolio: true,
    site_url: 'https://example.com',
    asset_dict: {},
    asset_token_list: [],
    detail_types: [],
    pool: {},
    proxy_detail: {},
    debt_usd_value: 0,
    net_usd_value: 10,
    update_at: 1,
    ...overrides,
  }) as PortfolioItemSnapshotInsert;

describe('PortfolioItemWriter coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('names unknown wallets and missing ids in validation errors', async () => {
    const result = await new PortfolioItemWriter().writeSnapshots(
      [position({ wallet: undefined }), position({ id_raw: undefined })],
      'debank',
    );

    expect(result.recordsInserted).toBe(0);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0]).toContain('unknown');
    expect(result.errors[1]).toContain('missing id');
    expect(getDbClient).not.toHaveBeenCalled();
  });
});
