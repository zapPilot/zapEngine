import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildSourceRefreshRecords,
  recordSourceRefreshOutcomeNonFatal,
  type WalletRefreshOutcome,
} from '../../../../src/modules/user-service/refreshState.js';
import type { SupabaseFetcher } from '../../../../src/modules/user-service/supabaseFetcher.js';
import { logger } from '../../../../src/utils/logger.js';

vi.mock('../../../../src/utils/logger.js', async () => {
  const { mockLogger } = await import('../../../setup/mocks.js');
  return mockLogger();
});

function outcome(
  overrides: Partial<WalletRefreshOutcome> = {},
): WalletRefreshOutcome {
  return {
    wallet: '0xwallet',
    userId: 'user-1',
    fetchSucceeded: true,
    ...overrides,
  };
}

describe('buildSourceRefreshRecords', () => {
  it('marks a fetched wallet fresh once the load committed', () => {
    expect(
      buildSourceRefreshRecords('debank', [outcome()], { succeeded: true }),
    ).toEqual([
      {
        wallet: '0xwallet',
        source: 'debank',
        user_id: 'user-1',
        succeeded: true,
      },
    ]);
  });

  it('keeps a fetched wallet due when the load failed, and says why', () => {
    expect(
      buildSourceRefreshRecords('hyperliquid', [outcome()], {
        succeeded: false,
        error: 'daily_portfolio_positions write failed',
      }),
    ).toEqual([
      {
        wallet: '0xwallet',
        source: 'hyperliquid',
        user_id: 'user-1',
        succeeded: false,
        error: 'daily_portfolio_positions write failed',
      },
    ]);
  });

  it('blames the fetch rather than the load when the provider never answered', () => {
    // The wallet never reached the writers, so the load's verdict says nothing
    // about it; the provider outage is the reason it must stay due.
    expect(
      buildSourceRefreshRecords(
        'debank',
        [outcome({ fetchSucceeded: false, error: 'DeBank unavailable' })],
        { succeeded: true },
      ),
    ).toEqual([
      {
        wallet: '0xwallet',
        source: 'debank',
        user_id: 'user-1',
        succeeded: false,
        error: 'DeBank unavailable',
      },
    ]);
  });

  it('omits the error key when neither stage named one', () => {
    expect(
      buildSourceRefreshRecords(
        'debank',
        [outcome({ fetchSucceeded: false })],
        { succeeded: false },
      ),
    ).toEqual([
      {
        wallet: '0xwallet',
        source: 'debank',
        user_id: 'user-1',
        succeeded: false,
      },
    ]);
  });

  it('records nothing for a batch that attempted no wallet', () => {
    expect(
      buildSourceRefreshRecords('hyperliquid', [], { succeeded: true }),
    ).toEqual([]);
  });
});

describe('recordSourceRefreshOutcomeNonFatal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips the round trip when there is nothing to record', async () => {
    const recordWalletSourceRefresh = vi.fn();

    await recordSourceRefreshOutcomeNonFatal(
      { recordWalletSourceRefresh } as unknown as SupabaseFetcher,
      [],
      'job-empty',
    );

    expect(recordWalletSourceRefresh).not.toHaveBeenCalled();
  });

  it('forwards the rows to the definer function', async () => {
    const recordWalletSourceRefresh = vi.fn().mockResolvedValue(undefined);
    const rows = [
      {
        wallet: '0xwallet',
        source: 'debank' as const,
        user_id: 'user-1',
        succeeded: true,
      },
    ];

    await recordSourceRefreshOutcomeNonFatal(
      { recordWalletSourceRefresh } as unknown as SupabaseFetcher,
      rows,
      'job-ok',
    );

    expect(recordWalletSourceRefresh).toHaveBeenCalledWith(rows);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('never lets a bookkeeping failure reach the pipeline', async () => {
    const error = new Error('ops schema unreachable');
    const recordWalletSourceRefresh = vi.fn().mockRejectedValue(error);

    await expect(
      recordSourceRefreshOutcomeNonFatal(
        { recordWalletSourceRefresh } as unknown as SupabaseFetcher,
        [
          {
            wallet: '0xwallet',
            source: 'debank',
            user_id: 'user-1',
            succeeded: true,
          },
        ],
        'job-fail',
      ),
    ).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledWith(
      'Failed to record wallet source refresh state',
      { jobId: 'job-fail', rowCount: 1, error },
    );
  });
});
