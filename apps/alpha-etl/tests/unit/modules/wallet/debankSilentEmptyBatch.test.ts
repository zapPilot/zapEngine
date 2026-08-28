import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ETLUserCandidate } from '../../../../src/types/index.js';
import { createEtlJob } from '../../../utils/createEtlJob.js';

const mocks = vi.hoisted(() => ({
  fetchUserServiceStates: vi.fn(),
  batchUpdatePortfolioTimestamps: vi.fn(),
  recordUserResourceUsage: vi.fn(),
  fetchWalletTokenList: vi.fn(),
  fetchComplexProtocolList: vi.fn(),
  writeWalletBalanceSnapshots: vi.fn(),
  writeSnapshots: vi.fn(),
  captureBackgroundException: vi.fn(),
}));

vi.mock('../../../../src/utils/logger.js', async () => {
  const { mockLogger } = await import('../../../setup/mocks.js');
  return mockLogger();
});

vi.mock('../../../../src/observability/sentry.js', () => ({
  captureBackgroundException: mocks.captureBackgroundException,
}));

vi.mock('../../../../src/modules/user-service/supabaseFetcher.js', () => ({
  SupabaseFetcher: class {
    fetchUserServiceStates = mocks.fetchUserServiceStates;
    batchUpdatePortfolioTimestamps = mocks.batchUpdatePortfolioTimestamps;
    recordUserResourceUsage = mocks.recordUserResourceUsage;
    healthCheck = vi.fn();
    getRequestCount = vi.fn(() => 0);
  },
}));

vi.mock('../../../../src/modules/wallet/fetcher.js', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../../../src/modules/wallet/fetcher.js')
    >();
  return {
    ...actual,
    DeBankFetcher: class {
      fetchWalletTokenList = mocks.fetchWalletTokenList;
      fetchComplexProtocolList = mocks.fetchComplexProtocolList;
      healthCheck = vi.fn();
      getRequestCount = vi.fn(() => 0);
    },
  };
});

vi.mock('../../../../src/modules/wallet/balanceWriter.js', () => ({
  WalletBalanceWriter: class {
    writeWalletBalanceSnapshots = mocks.writeWalletBalanceSnapshots;
  },
}));

vi.mock('../../../../src/modules/wallet/portfolioWriter.js', () => ({
  PortfolioItemWriter: class {
    writeSnapshots = mocks.writeSnapshots;
  },
}));

const WALLETS = [
  '0x1111111111111111111111111111111111111111',
  '0x2222222222222222222222222222222222222222',
];

function dueUsers(): ETLUserCandidate[] {
  return WALLETS.map((wallet, index) => ({
    userId: `user-${index}`,
    wallet,
    planCode: 'vip',
    defaultTier: 'priority',
    overrideTier: null,
    effectiveTier: 'priority',
    lastActivityAt: null,
    lastPortfolioUpdateAt: null,
    refreshIntervalHours: 24,
    dueForRefresh: true,
  }));
}

function writeResult(recordsInserted: number) {
  return { success: true, recordsInserted, duplicatesSkipped: 0, errors: [] };
}

async function runProcessor() {
  const { WalletBalanceETLProcessor } =
    await import('../../../../src/modules/wallet/processor.js');
  return new WalletBalanceETLProcessor().process(
    createEtlJob({ sources: ['debank'] }),
  );
}

describe('DeBank scheduled batch silent-empty detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchUserServiceStates.mockResolvedValue(dueUsers());
    mocks.batchUpdatePortfolioTimestamps.mockResolvedValue(undefined);
    mocks.recordUserResourceUsage.mockResolvedValue(undefined);
    mocks.fetchWalletTokenList.mockResolvedValue([]);
    mocks.fetchComplexProtocolList.mockResolvedValue([]);
    mocks.writeWalletBalanceSnapshots.mockResolvedValue(writeResult(0));
    mocks.writeSnapshots.mockResolvedValue(writeResult(0));
  });

  it('fails the source when every fetched wallet came back empty', async () => {
    const result = await runProcessor();

    expect(result.success).toBe(false);
    expect(result.errors).toEqual([
      expect.stringContaining('DeBank returned no tokens and no positions'),
    ]);
    expect(mocks.captureBackgroundException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        tags: { failure_scope: 'wallet_batch', provider: 'debank' },
      }),
    );
  });

  it('still hands every fetched wallet to both daily writers', async () => {
    // The empty batch must keep deleting its own wallet/day slice, so the
    // failure signal cannot come from withholding wallets from the writers.
    await runProcessor();

    expect(mocks.writeWalletBalanceSnapshots).toHaveBeenCalledWith([], WALLETS);
    expect(mocks.writeSnapshots).toHaveBeenCalledWith([], 'debank', WALLETS);
    expect(mocks.batchUpdatePortfolioTimestamps).toHaveBeenCalledWith(WALLETS);
  });

  it('stays successful when DeBank returned tokens for a wallet', async () => {
    mocks.fetchWalletTokenList.mockResolvedValueOnce([
      {
        id: '0xtoken',
        chain: 'eth',
        name: 'Token',
        symbol: 'TKN',
        decimals: 18,
        amount: 1,
        price: 2,
        is_wallet: true,
        is_core: true,
        is_verified: true,
      },
    ]);
    mocks.writeWalletBalanceSnapshots.mockResolvedValue(writeResult(1));

    const result = await runProcessor();

    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
    expect(mocks.captureBackgroundException).not.toHaveBeenCalled();
  });

  it('stays successful when no wallet was due for refresh', async () => {
    mocks.fetchUserServiceStates.mockResolvedValue([]);

    const result = await runProcessor();

    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
    expect(mocks.captureBackgroundException).not.toHaveBeenCalled();
  });
});
