import { vi } from 'vitest';

import { DeBankFetcher } from '../../../../src/modules/wallet/fetcher.js';

export const walletAddress = '0x1234567890123456789012345678901234567890';

export function mockDeBankFailure(fetcher: DeBankFetcher, error: Error) {
  return vi
    .spyOn(
      fetcher as unknown as { fetchWithRetry: () => Promise<unknown> },
      'fetchWithRetry',
    )
    .mockRejectedValue(error);
}

export function mockDeBankResponse(fetcher: DeBankFetcher, response: unknown) {
  return vi
    .spyOn(
      fetcher as unknown as { fetchWithRetry: () => Promise<unknown> },
      'fetchWithRetry',
    )
    .mockResolvedValue(response);
}

export function validToken(overrides: Record<string, unknown> = {}) {
  return {
    amount: 1,
    chain: 'eth',
    decimals: 18,
    id: '0xtoken',
    is_core: false,
    is_verified: true,
    is_wallet: true,
    name: 'Token',
    symbol: 'TKN',
    ...overrides,
  };
}

export function validProtocol(overrides: Record<string, unknown> = {}) {
  return {
    chain: 'eth',
    has_supported_portfolio: true,
    id: 'aave3',
    logo_url: null,
    name: 'Aave V3',
    portfolio_item_list: [],
    ...overrides,
  };
}

export function validProtocolItem(overrides: Record<string, unknown> = {}) {
  return {
    asset_dict: {},
    asset_token_list: [],
    detail: {},
    detail_types: [],
    name: 'Supply',
    pool: {},
    stats: {
      asset_usd_value: 100,
      debt_usd_value: 0,
      net_usd_value: 100,
    },
    update_at: 1_725_000_000,
    ...overrides,
  };
}
