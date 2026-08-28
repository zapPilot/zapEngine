import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SupabaseFetcher } from '../../../../src/modules/user-service/supabaseFetcher.js';
import { APIError } from '../../../../src/utils/errors.js';
import { logger } from '../../../../src/utils/logger.js';

const { mockClient, mockGetDbClient } = vi.hoisted(() => {
  const mockClient = {
    query: vi.fn(),
    release: vi.fn(),
  };

  return {
    mockClient,
    mockGetDbClient: vi.fn().mockResolvedValue(mockClient),
  };
});

vi.mock('../../../../src/utils/logger.js', async () => {
  const { mockLogger } = await import('../../../setup/mocks.js');
  return mockLogger();
});

vi.mock('../../../../src/config/database.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../../src/config/database.js')>();
  return {
    ...actual,
    createDbPool: vi.fn(),
    getDbPool: vi.fn(),
    getDbClient: mockGetDbClient,
    testDatabaseConnection: vi.fn().mockResolvedValue(true),
    closeDbPool: vi.fn(),
  };
});

const SERVICE_STATES_QUERY =
  'select user_id, email, wallet, plan_code, last_activity_at, last_portfolio_update_at, default_tier, override_tier, override_reason, override_expires_at, effective_tier, refresh_interval_hours, due_for_refresh, aum_usd from public.get_user_service_states()';

function stateRow(overrides: Record<string, unknown> = {}) {
  return {
    user_id: 'user-1',
    email: 'priority@example.com',
    wallet: '0xABC',
    plan_code: 'vip',
    last_activity_at: '2026-08-27T00:00:00.000Z',
    last_portfolio_update_at: '2026-08-26T00:00:00.000Z',
    default_tier: 'priority',
    override_tier: null,
    override_reason: null,
    override_expires_at: null,
    effective_tier: 'priority',
    refresh_interval_hours: 24,
    due_for_refresh: true,
    aum_usd: '1000.00',
    ...overrides,
  };
}

function spyOnWithDatabaseClient(fetcher: SupabaseFetcher) {
  return vi.spyOn(
    fetcher as unknown as {
      withDatabaseClient: (callback: unknown) => Promise<never>;
    },
    'withDatabaseClient',
  );
}

describe('SupabaseFetcher user service states', () => {
  let fetcher: SupabaseFetcher;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDbClient.mockResolvedValue(mockClient);
    fetcher = new SupabaseFetcher();
  });

  describe('fetchUserServiceStates', () => {
    it('maps the SQL projection onto camelCase candidates', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [stateRow()] });

      const result = await fetcher.fetchUserServiceStates();

      expect(mockClient.query).toHaveBeenCalledWith(SERVICE_STATES_QUERY);
      expect(result).toEqual([
        {
          userId: 'user-1',
          wallet: '0xabc',
          planCode: 'vip',
          defaultTier: 'priority',
          overrideTier: null,
          effectiveTier: 'priority',
          lastActivityAt: '2026-08-27T00:00:00.000Z',
          lastPortfolioUpdateAt: '2026-08-26T00:00:00.000Z',
          refreshIntervalHours: 24,
          dueForRefresh: true,
        },
      ]);
      expect(fetcher.getRequestStats().requestCount).toBe(1);
    });

    it('carries operator overrides and non-scheduled wallets through unchanged', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [
          stateRow({
            user_id: 'user-paused',
            wallet: '0xPAUSED',
            override_tier: 'paused',
            effective_tier: 'paused',
            refresh_interval_hours: null,
            due_for_refresh: false,
          }),
        ],
      });

      const [candidate] = await fetcher.fetchUserServiceStates();

      expect(candidate).toMatchObject({
        overrideTier: 'paused',
        effectiveTier: 'paused',
        refreshIntervalHours: null,
        dueForRefresh: false,
      });
    });

    it('filters rows missing an identity and warns', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [
          stateRow(),
          stateRow({ user_id: null, wallet: '0xDEF' }),
          stateRow({ user_id: 'user-3', wallet: '' }),
        ],
      });

      const result = await fetcher.fetchUserServiceStates();

      expect(result).toHaveLength(1);
      expect(logger.warn).toHaveBeenCalledWith(
        'Some invalid user records filtered out',
        { total: 3, valid: 1, invalid: 2 },
      );
    });

    it('deduplicates wallets that differ only in case and warns', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [
          stateRow({ user_id: 'user-1', wallet: '0xABC' }),
          stateRow({ user_id: 'user-2', wallet: '0xabc' }),
        ],
      });

      const result = await fetcher.fetchUserServiceStates();

      expect(result).toHaveLength(1);
      expect(logger.warn).toHaveBeenCalledWith(
        'Duplicate wallets detected after SQL query',
        { total: 2, unique: 1, duplicates: 1 },
      );
    });

    it('summarizes how many wallets are priority and due', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [
          stateRow(),
          stateRow({
            user_id: 'user-2',
            wallet: '0xSTANDARD',
            plan_code: 'free',
            default_tier: 'standard',
            effective_tier: 'standard',
            refresh_interval_hours: null,
            due_for_refresh: false,
          }),
        ],
      });

      await fetcher.fetchUserServiceStates();

      expect(logger.info).toHaveBeenCalledWith(
        'User service states fetched successfully',
        { walletCount: 2, priority: 1, dueForRefresh: 1 },
      );
    });

    it('re-throws APIError instances without wrapping', async () => {
      const apiError = new APIError('db error', 500, 'db', 'SupabaseFetcher');
      spyOnWithDatabaseClient(fetcher).mockRejectedValueOnce(apiError);

      await expect(fetcher.fetchUserServiceStates()).rejects.toBe(apiError);
    });

    it('wraps generic and non-Error failures', async () => {
      const spy = spyOnWithDatabaseClient(fetcher);

      spy.mockRejectedValueOnce(new Error('boom'));
      await expect(fetcher.fetchUserServiceStates()).rejects.toThrow(
        'DB fetch of service states failed: boom',
      );

      spy.mockRejectedValueOnce('String Error');
      await expect(fetcher.fetchUserServiceStates()).rejects.toThrow(
        'DB fetch of service states failed: Unknown error',
      );
      await expect(fetcher.fetchUserServiceStates()).rejects.toBeInstanceOf(
        APIError,
      );
    });
  });

  describe('recordUserResourceUsage', () => {
    const rows = [
      {
        usage_date: '2026-08-28',
        user_id: 'user-1',
        wallet: '0xabc',
        provider: 'debank' as const,
        resource: 'portfolio_refresh',
        request_count: 2,
      },
    ];

    it('sends every row as one jsonb payload', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await fetcher.recordUserResourceUsage(rows);

      expect(mockClient.query).toHaveBeenCalledWith(
        'select public.ops_record_user_resource_usage($1::jsonb)',
        [JSON.stringify(rows)],
      );
    });

    it('propagates database failures to its caller', async () => {
      mockClient.query.mockRejectedValueOnce(new Error('ledger down'));

      await expect(fetcher.recordUserResourceUsage(rows)).rejects.toThrow(
        'ledger down',
      );
    });
  });
});
