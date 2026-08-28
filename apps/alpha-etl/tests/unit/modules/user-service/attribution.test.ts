import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildUserResourceUsageRows,
  recordUserResourceUsageNonFatal,
} from '../../../../src/modules/user-service/attribution.js';
import type { SupabaseFetcher } from '../../../../src/modules/user-service/supabaseFetcher.js';
import type { ETLUserCandidate } from '../../../../src/types/index.js';
import { logger } from '../../../../src/utils/logger.js';

vi.mock('../../../../src/utils/logger.js', async () => {
  const { mockLogger } = await import('../../../setup/mocks.js');
  return mockLogger();
});

function candidate(userId: string, wallet: string): ETLUserCandidate {
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
  };
}

const debankUsage = {
  provider: 'debank' as const,
  resource: 'portfolio_refresh',
  requestCount: 2,
};

describe('buildUserResourceUsageRows', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-28T23:30:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('bills only the wallets whose fetch succeeded', () => {
    const rows = buildUserResourceUsageRows(
      [candidate('user-ok', '0xok'), candidate('user-failed', '0xfailed')],
      ['0xok'],
      debankUsage,
    );

    expect(rows).toEqual([
      {
        usage_date: '2026-08-28',
        user_id: 'user-ok',
        wallet: '0xok',
        provider: 'debank',
        resource: 'portfolio_refresh',
        request_count: 2,
      },
    ]);
  });

  it('dates lines by the UTC day, not the machine timezone', () => {
    // 23:30Z is already the next local day in Asia/Taipei; the ledger's key
    // has to line up with the analytics.daily_* slice these calls produced.
    vi.setSystemTime(new Date('2026-08-28T23:30:00.000Z'));

    const [row] = buildUserResourceUsageRows(
      [candidate('user-ok', '0xok')],
      ['0xok'],
      { provider: 'hyperliquid', resource: 'vault_details', requestCount: 1 },
    );

    expect(row).toMatchObject({
      usage_date: '2026-08-28',
      provider: 'hyperliquid',
      resource: 'vault_details',
      request_count: 1,
    });
  });

  it('returns nothing when the batch fetched nothing', () => {
    expect(
      buildUserResourceUsageRows(
        [candidate('user-ok', '0xok')],
        [],
        debankUsage,
      ),
    ).toEqual([]);
  });
});

describe('recordUserResourceUsageNonFatal', () => {
  const rows = [
    {
      usage_date: '2026-08-28',
      user_id: 'user-ok',
      wallet: '0xok',
      provider: 'debank' as const,
      resource: 'portfolio_refresh',
      request_count: 2,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips the round trip when there is nothing to record', async () => {
    const recordUserResourceUsage = vi.fn();

    await recordUserResourceUsageNonFatal(
      { recordUserResourceUsage } as unknown as SupabaseFetcher,
      [],
      'job-empty',
    );

    expect(recordUserResourceUsage).not.toHaveBeenCalled();
  });

  it('forwards the rows to the ledger', async () => {
    const recordUserResourceUsage = vi.fn().mockResolvedValue(undefined);

    await recordUserResourceUsageNonFatal(
      { recordUserResourceUsage } as unknown as SupabaseFetcher,
      rows,
      'job-ok',
    );

    expect(recordUserResourceUsage).toHaveBeenCalledWith(rows);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('never lets a ledger failure reach the pipeline', async () => {
    const error = new Error('ops schema unreachable');
    const recordUserResourceUsage = vi.fn().mockRejectedValue(error);

    await expect(
      recordUserResourceUsageNonFatal(
        { recordUserResourceUsage } as unknown as SupabaseFetcher,
        rows,
        'job-fail',
      ),
    ).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledWith(
      'Failed to record per-user resource usage',
      { jobId: 'job-fail', rowCount: 1, error },
    );
  });
});
