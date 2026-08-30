import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  selectDueUsers,
  updatePortfolioTimestampsNonFatal,
} from '../../../../src/modules/user-service/selector.js';
import type { SupabaseFetcher } from '../../../../src/modules/user-service/supabaseFetcher.js';
import type { ETLUserCandidate } from '../../../../src/types/index.js';
import { logger } from '../../../../src/utils/logger.js';

vi.mock('../../../../src/utils/logger.js', async () => {
  const { mockLogger } = await import('../../../setup/mocks.js');
  return mockLogger();
});

function candidate(
  overrides: Partial<ETLUserCandidate> = {},
): ETLUserCandidate {
  return {
    userId: 'user-1',
    wallet: '0xpriority',
    planCode: 'vip',
    defaultTier: 'priority',
    overrideTier: null,
    effectiveTier: 'priority',
    lastActivityAt: null,
    lastPortfolioUpdateAt: null,
    refreshIntervalHours: 24,
    dueForRefresh: true,
    dueSources: ['debank', 'hyperliquid'],
    ...overrides,
  };
}

function fetcherReturning(candidates: ETLUserCandidate[]) {
  return {
    fetchUserServiceStates: vi.fn().mockResolvedValue(candidates),
  } as unknown as SupabaseFetcher;
}

describe('selectDueUsers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps only priority wallets that SQL marked due', async () => {
    const due = candidate();
    const notDue = candidate({
      userId: 'user-2',
      wallet: '0xrecent',
      dueForRefresh: false,
      dueSources: [],
    });
    const standard = candidate({
      userId: 'user-3',
      wallet: '0xstandard',
      planCode: 'free',
      defaultTier: 'standard',
      effectiveTier: 'standard',
      refreshIntervalHours: null,
      dueForRefresh: false,
      dueSources: [],
    });

    const selection = await selectDueUsers({
      fetcher: fetcherReturning([due, notDue, standard]),
      source: 'debank',
      jobId: 'job-1',
    });

    expect(selection).toEqual({
      usersToUpdate: [due],
      candidatesTotal: 3,
      skippedNotDue: 1,
      skippedByTier: 1,
    });
  });

  it('never schedules a paused wallet even if SQL called it due', async () => {
    // Defence in depth for the one case where the two conditions disagree:
    // an override that pauses an account must win over a stale due flag.
    const paused = candidate({
      wallet: '0xpaused',
      overrideTier: 'paused',
      effectiveTier: 'paused',
      dueForRefresh: true,
    });

    const selection = await selectDueUsers({
      fetcher: fetcherReturning([paused]),
      source: 'debank',
      jobId: 'job-paused',
    });

    expect(selection.usersToUpdate).toEqual([]);
    expect(selection.skippedByTier).toBe(1);
    expect(selection.skippedNotDue).toBe(0);
  });

  it('leaves a wallet to the provider that still owes it data', async () => {
    // The whole point of the split: DeBank landing today must not take
    // Hyperliquid's turn with it, and neither provider may be scheduled off
    // the other's freshness.
    const debankOnly = candidate({
      wallet: '0xdebank',
      dueSources: ['debank'],
    });
    const hyperliquidOnly = candidate({
      userId: 'user-2',
      wallet: '0xhyperliquid',
      dueSources: ['hyperliquid'],
    });

    const forDebank = await selectDueUsers({
      fetcher: fetcherReturning([debankOnly, hyperliquidOnly]),
      source: 'debank',
      jobId: 'job-debank',
    });
    const forHyperliquid = await selectDueUsers({
      fetcher: fetcherReturning([debankOnly, hyperliquidOnly]),
      source: 'hyperliquid',
      jobId: 'job-hyperliquid',
    });

    expect(forDebank.usersToUpdate).toEqual([debankOnly]);
    expect(forDebank.skippedNotDue).toBe(1);
    expect(forHyperliquid.usersToUpdate).toEqual([hyperliquidOnly]);
    expect(forHyperliquid.skippedNotDue).toBe(1);
  });

  it('logs the selection through the shared logger', async () => {
    await selectDueUsers({
      fetcher: fetcherReturning([candidate()]),
      source: 'hyperliquid',
      jobId: 'job-2',
    });

    expect(logger.info).toHaveBeenCalledWith('Wallets selected for refresh', {
      jobId: 'job-2',
      source: 'hyperliquid',
      candidatesTotal: 1,
      usersToUpdate: 1,
      skippedNotDue: 0,
      skippedByTier: 0,
    });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('warns through an injected logger when nothing is due', async () => {
    const log = { info: vi.fn(), warn: vi.fn() };

    const selection = await selectDueUsers({
      fetcher: fetcherReturning([
        candidate({ dueForRefresh: false, dueSources: [] }),
      ]),
      source: 'debank',
      jobId: 'job-3',
      log,
    });

    expect(selection.usersToUpdate).toEqual([]);
    expect(log.warn).toHaveBeenCalledWith('No wallets due for refresh', {
      jobId: 'job-3',
      source: 'debank',
      candidatesTotal: 1,
      usersToUpdate: 0,
      skippedNotDue: 1,
      skippedByTier: 0,
    });
    expect(log.info).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });
});

describe('updatePortfolioTimestampsNonFatal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not touch the database when no wallet succeeded', async () => {
    const batchUpdatePortfolioTimestamps = vi.fn();

    await updatePortfolioTimestampsNonFatal(
      { batchUpdatePortfolioTimestamps } as unknown as SupabaseFetcher,
      [],
      'job-empty',
    );

    expect(batchUpdatePortfolioTimestamps).not.toHaveBeenCalled();
  });

  it('records how many wallets were stamped', async () => {
    const batchUpdatePortfolioTimestamps = vi.fn().mockResolvedValue(undefined);

    await updatePortfolioTimestampsNonFatal(
      { batchUpdatePortfolioTimestamps } as unknown as SupabaseFetcher,
      ['0xa', '0xb'],
      'job-ok',
    );

    expect(batchUpdatePortfolioTimestamps).toHaveBeenCalledWith(['0xa', '0xb']);
    expect(logger.info).toHaveBeenCalledWith('Portfolio timestamps updated', {
      jobId: 'job-ok',
      walletsUpdated: 2,
    });
  });

  it('swallows update failures so the batch still counts as written', async () => {
    const error = new Error('timestamp write failed');
    const batchUpdatePortfolioTimestamps = vi.fn().mockRejectedValue(error);

    await expect(
      updatePortfolioTimestampsNonFatal(
        { batchUpdatePortfolioTimestamps } as unknown as SupabaseFetcher,
        ['0xa'],
        'job-fail',
      ),
    ).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith(
      'Failed to batch update portfolio timestamps',
      { jobId: 'job-fail', walletsCount: 1, error },
    );
  });
});
