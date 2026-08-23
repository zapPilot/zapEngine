import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WalletBalanceETLProcessor } from '../../../../src/modules/wallet/processor.js';
import { createEtlJob } from '../../../utils/createEtlJob.js';

const successfulWallet = '0x1234567890123456789012345678901234567890';
const failedWallet = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';

const fetchAndFilterVipUsersForProcessing = vi.fn();
const updatePortfolioTimestampsNonFatal = vi.fn();
const fetchWalletDataFromDeBank = vi.fn();
const writeWalletBalanceSnapshots = vi.fn();
const writePortfolioSnapshots = vi.fn();

vi.mock('../../../../src/modules/vip-users/processing.js', () => ({
  fetchAndFilterVipUsersForProcessing,
  updatePortfolioTimestampsNonFatal,
}));

vi.mock('../../../../src/modules/vip-users/common.js', () => ({
  fetchWalletDataFromDeBank,
  mapTokenBalancesToSnapshots: vi.fn((tokens, wallet) =>
    tokens.map((token) => ({
      user_wallet_address: wallet,
      token_address: token.id,
      chain: token.chain,
      symbol: token.symbol,
      amount: token.amount,
    })),
  ),
}));

vi.mock('../../../../src/modules/vip-users/supabaseFetcher.js', () => ({
  SupabaseFetcher: class {},
}));

vi.mock('../../../../src/modules/wallet/fetcher.js', () => ({
  DeBankFetcher: class {},
}));

vi.mock('../../../../src/modules/wallet/balanceTransformer.js', () => ({
  WalletBalanceTransformer: class {
    transformBatch = vi.fn((data) => data);
  },
}));

vi.mock('../../../../src/modules/wallet/balanceWriter.js', () => ({
  WalletBalanceWriter: class {
    writeWalletBalanceSnapshots = writeWalletBalanceSnapshots;
  },
}));

vi.mock('../../../../src/modules/wallet/portfolioTransformer.js', () => ({
  DeBankPortfolioTransformer: class {
    transformBatch = vi.fn(() => []);
  },
}));

vi.mock('../../../../src/modules/wallet/portfolioWriter.js', () => ({
  PortfolioItemWriter: class {
    writeSnapshots = writePortfolioSnapshots;
  },
}));

vi.mock('../../../../src/utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('../../../../src/utils/mask.js', () => ({
  maskWalletAddress: vi.fn((wallet: string) => wallet),
}));

describe('WalletBalanceETLProcessor partial wallet failures', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    fetchAndFilterVipUsersForProcessing.mockResolvedValue({
      usersToUpdate: [
        {
          user_id: 'user-success',
          wallet: successfulWallet,
          last_activity_at: null,
          last_portfolio_update_at: null,
        },
        {
          user_id: 'user-failed',
          wallet: failedWallet,
          last_activity_at: null,
          last_portfolio_update_at: null,
        },
      ],
      vipUsersTotal: 2,
      costSavingsPercent: 0,
    });

    fetchWalletDataFromDeBank
      .mockResolvedValueOnce({
        tokens: [
          {
            id: '0xTokenSuccess',
            chain: 'eth',
            symbol: 'SCS',
            amount: 10,
          },
        ],
        protocols: [],
      })
      .mockRejectedValueOnce(new Error('DeBank unavailable'));

    updatePortfolioTimestampsNonFatal.mockResolvedValue(undefined);
    writeWalletBalanceSnapshots.mockResolvedValue({
      success: true,
      recordsInserted: 1,
      errors: [],
      duplicatesSkipped: 0,
    });
    writePortfolioSnapshots.mockResolvedValue({
      success: true,
      recordsInserted: 0,
      errors: [],
      duplicatesSkipped: 0,
    });
  });

  it('excludes failed wallets from authoritative daily replacements', async () => {
    const result = await new WalletBalanceETLProcessor().process(
      createEtlJob({
        jobId: 'partial-wallet-failure',
        sources: ['debank'],
        filters: {},
        createdAt: new Date('2026-08-24T00:00:00.000Z'),
      }),
    );

    expect(result.success).toBe(true);
    expect(result.recordsInserted).toBe(1);
    expect(updatePortfolioTimestampsNonFatal).toHaveBeenCalledWith(
      expect.anything(),
      [successfulWallet],
      'partial-wallet-failure',
    );
    expect(writeWalletBalanceSnapshots).toHaveBeenCalledWith(
      [expect.objectContaining({ user_wallet_address: successfulWallet })],
      [successfulWallet],
    );
    expect(writePortfolioSnapshots).toHaveBeenCalledWith(
      [],
      'debank',
      [successfulWallet],
    );

    const replacementWallets = writeWalletBalanceSnapshots.mock.calls[0]?.[1];
    expect(replacementWallets).not.toContain(failedWallet);
  });
});
