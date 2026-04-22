import { describe, it, expect, vi } from 'vitest';
import { DeBankPortfolioTransformer } from '../../../../src/modules/wallet/portfolioTransformer.js';
import { logger } from '../../../../src/utils/logger.js';

vi.mock('../../../../src/utils/logger.js', async () => {
  const { mockLogger } = await import('../../../setup/mocks.js');
  return mockLogger();
});

describe('DeBankPortfolioTransformer', () => {
  const transformer = new DeBankPortfolioTransformer();

  const makeProtocol = (items: unknown[] | null = []) => ({
    chain: 'ethereum',
    name: 'Aave',
    has_supported_portfolio: true,
    logo_url: 'https://example.com/logo.png',
    portfolio_item_list: items,
  });

  const makeItem = (overrides: Record<string, unknown> = {}) => ({
    name: 'Lending',
    stats: { asset_usd_value: 100, debt_usd_value: 0, net_usd_value: 100 },
    pool: { id: 'pool-1' },
    detail: {},
    asset_dict: {},
    asset_token_list: [],
    detail_types: ['lending'],
    proxy_detail: null,
    update_at: null,
    ...overrides,
  });

  it('should handle protocol with null portfolio_item_list', () => {
    const protocol = makeProtocol(null);
    const results = transformer.transformBatch([protocol as unknown], '0xabc');
    expect(results).toEqual([]);
  });

  it('should handle transformItem catch block on error', () => {
    // Create an item that causes buildSnapshot to throw
    const badItem = makeItem({
      stats: {
        asset_usd_value: 100,
        debt_usd_value: 0,
        net_usd_value: 100,
      },
      pool: null, // will cause .id access to throw
    });

    const result = transformer.transformItem({
      protocol: makeProtocol() as unknown,
      item: badItem as unknown,
      walletAddress: '0xabc',
    });

    expect(result).toBeNull();
    expect(logger.error).toHaveBeenCalledWith(
      'Failed to transform DeBank portfolio item',
      expect.objectContaining({ protocol: 'Aave' }),
    );
  });

  it('should reject portfolio items without a string pool id', () => {
    const badItem = makeItem({ pool: {} });

    const result = transformer.transformItem({
      protocol: makeProtocol() as unknown,
      item: badItem as unknown,
      walletAddress: '0xabc',
    });

    expect(result).toBeNull();
    expect(logger.error).toHaveBeenCalledWith(
      'Failed to transform DeBank portfolio item',
      expect.objectContaining({ protocol: 'Aave' }),
    );
  });
});
