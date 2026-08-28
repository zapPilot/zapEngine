import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WalletBalanceETLProcessor } from '../../../../src/modules/wallet/processor.js';
import type { ETLUserCandidate } from '../../../../src/types/index.js';
import { createEtlJob } from '../../../utils/createEtlJob.js';

const successfulWallet = '0x1234567890123456789012345678901234567890';
const failedWallet = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';

const {
  selectDueUsers,
  fetchWalletDataFromDeBank,
  recordUserResourceUsageNonFatal,
  updatePortfolioTimestampsNonFatal,
  recordWalletSourceRefresh,
  writePortfolioSnapshots,
  writeWalletBalanceSnapshots,
} = vi.hoisted(() => ({
  selectDueUsers: vi.fn(),
  fetchWalletDataFromDeBank: vi.fn(),
  recordUserResourceUsageNonFatal: vi.fn(),
  updatePortfolioTimestampsNonFatal: vi.fn(),
  recordWalletSourceRefresh: vi.fn(),
  writePortfolioSnapshots: vi.fn(),
  writeWalletBalanceSnapshots: vi.fn(),
}));

vi.mock('../../../../src/modules/user-service/selector.js', () => ({
  selectDueUsers,
  updatePortfolioTimestampsNonFatal,
}));

vi.mock(
  '../../../../src/modules/user-service/attribution.js',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('../../../../src/modules/user-service/attribution.js')
      >();
    return { ...actual, recordUserResourceUsageNonFatal };
  },
);

vi.mock('../../../../src/modules/wallet/debank-io.js', () => ({
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

vi.mock('../../../../src/modules/user-service/supabaseFetcher.js', () => ({
  SupabaseFetcher: class {
    recordWalletSourceRefresh = recordWalletSourceRefresh;
  },
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

function dueUser(userId: string, wallet: string): ETLUserCandidate {
  return {
    userId,
    wallet,
    planCode: 'vip',
    defaultTier: 'priority',
    overrideTier: null,
    effectiveTier: 'priority',
    lastActivityAt: null,
    lastPortfolioUpdateAt: null,
    refreshIntervalHours: 24,
    dueForRefresh: true,
    dueSources: ['debank'],
  };
}

function selection(usersToUpdate: ETLUserCandidate[]) {
  return {
    usersToUpdate,
    candidatesTotal: usersToUpdate.length,
    skippedNotDue: 0,
    skippedByTier: 0,
  };
}

describe('WalletBalanceETLProcessor partial wallet failures', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    selectDueUsers.mockResolvedValue(
      selection([
        dueUser('user-success', successfulWallet),
        dueUser('user-failed', failedWallet),
      ]),
    );

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
    recordUserResourceUsageNonFatal.mockResolvedValue(undefined);
    recordWalletSourceRefresh.mockResolvedValue(undefined);
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

    expect(result.success).toBe(false);
    expect(result.recordsInserted).toBe(1);
    expect(result.errors).toContain(`User ${failedWallet}: DeBank unavailable`);
    // Freshness is scoped to the wallet, not to the batch. The write landed, so
    // the wallet DeBank answered for is fresh and the wallet it did not is
    // still due. Condemning the whole batch here would let one permanently
    // unreachable address hold the entire priority fleet due for ever — daily
    // DeBank re-billing, and a dashboard reporting wallets as never refreshed
    // on the very days their data was written.
    expect(updatePortfolioTimestampsNonFatal).toHaveBeenCalledWith(
      expect.anything(),
      [successfulWallet],
      'partial-wallet-failure',
    );
    expect(recordWalletSourceRefresh).toHaveBeenCalledWith([
      {
        wallet: successfulWallet,
        source: 'debank',
        user_id: 'user-success',
        succeeded: true,
      },
      {
        wallet: failedWallet,
        source: 'debank',
        user_id: 'user-failed',
        succeeded: false,
        error: `User ${failedWallet}: DeBank unavailable`,
      },
    ]);
    expect(writeWalletBalanceSnapshots).toHaveBeenCalledWith(
      [expect.objectContaining({ user_wallet_address: successfulWallet })],
      [successfulWallet],
    );
    expect(writePortfolioSnapshots).toHaveBeenCalledWith([], 'debank', [
      successfulWallet,
    ]);

    const replacementWallets = writeWalletBalanceSnapshots.mock.calls[0]?.[1];
    expect(replacementWallets).not.toContain(failedWallet);
  });

  it('bills the usage ledger only for the wallet DeBank actually answered', async () => {
    await new WalletBalanceETLProcessor().process(
      createEtlJob({
        jobId: 'partial-wallet-failure',
        sources: ['debank'],
        filters: {},
        createdAt: new Date('2026-08-24T00:00:00.000Z'),
      }),
    );

    expect(recordUserResourceUsageNonFatal).toHaveBeenCalledWith(
      expect.anything(),
      [
        expect.objectContaining({
          user_id: 'user-success',
          wallet: successfulWallet,
          provider: 'debank',
          resource: 'portfolio_refresh',
          request_count: 2,
        }),
      ],
      'partial-wallet-failure',
    );
  });

  it('fails when every eligible wallet fails without replacing any wallet slice', async () => {
    selectDueUsers.mockResolvedValue(
      selection([dueUser('user-failed', failedWallet)]),
    );
    fetchWalletDataFromDeBank.mockReset();
    fetchWalletDataFromDeBank.mockRejectedValue(
      new Error('DeBank unavailable'),
    );

    const result = await new WalletBalanceETLProcessor().process(
      createEtlJob({
        jobId: 'all-wallets-failed',
        sources: ['debank'],
        filters: {},
        createdAt: new Date('2026-08-24T00:00:00.000Z'),
      }),
    );

    expect(result.success).toBe(false);
    expect(result.errors).toEqual([`User ${failedWallet}: DeBank unavailable`]);
    expect(writeWalletBalanceSnapshots).toHaveBeenCalledWith([], []);
    expect(writePortfolioSnapshots).toHaveBeenCalledWith([], 'debank', []);
  });

  it('succeeds with no errors when there are no eligible wallets', async () => {
    selectDueUsers.mockResolvedValue(selection([]));

    const result = await new WalletBalanceETLProcessor().process(
      createEtlJob({
        jobId: 'no-eligible-wallets',
        sources: ['debank'],
        filters: {},
        createdAt: new Date('2026-08-24T00:00:00.000Z'),
      }),
    );

    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
  });
});
