import type { Mock } from 'vitest';

import {
  type CreateJobOptions,
  type Job,
  JobStatus,
  JobType,
} from '../../src/modules/jobs/interfaces/job.interface';
import type {
  CurveEvent,
  EquityCurveSubset,
} from '../../src/modules/notifications/track-record/schema';
/**
 * Shared test utilities for Hono-based service tests.
 * Replaces the old NestJS-centric src/test-utils/ that was deleted during migration.
 */

// ---------------------------------------------------------------------------
// Supabase query builder mock
// ---------------------------------------------------------------------------

export interface MockQueryBuilder {
  select: Mock;
  insert: Mock;
  update: Mock;
  upsert: Mock;
  delete: Mock;
  eq: Mock;
  neq: Mock;
  gt: Mock;
  gte: Mock;
  lt: Mock;
  lte: Mock;
  like: Mock;
  ilike: Mock;
  is: Mock;
  in: Mock;
  contains: Mock;
  order: Mock;
  limit: Mock;
  range: Mock;
  not: Mock;
  or: Mock;
  filter: Mock;
  match: Mock;
  single: Mock;
  maybeSingle: Mock;
  then: Mock;
  mockResolvedThen: (result: {
    data: unknown;
    error: unknown;
  }) => MockQueryBuilder;
}

export function createMockQueryBuilder(): MockQueryBuilder {
  // Declared before builder so the `then` implementation can close over it.
  let _thenResult: { data: unknown; error: unknown } = {
    data: null,
    error: null,
  };

  const builder: MockQueryBuilder = {
    // Chainable methods
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    like: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    contains: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    filter: vi.fn().mockReturnThis(),
    match: vi.fn().mockReturnThis(),
    // Terminal methods
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    // Thenable: when the query builder is awaited directly (e.g. `await query`),
    // JS calls query.then(resolve, reject). We must call resolve() with the result.
    then: vi.fn((resolve?: (v: unknown) => unknown) => {
      if (resolve) {
        return Promise.resolve(resolve(_thenResult));
      }
      return Promise.resolve(_thenResult);
    }),
    /**
     * Set the result returned when the builder is awaited directly (not via .single()).
     */
    mockResolvedThen: (result: { data: unknown; error: unknown }) => {
      _thenResult = result;
      return builder;
    },
  };

  return builder;
}

// ---------------------------------------------------------------------------
// Supabase client mock
// ---------------------------------------------------------------------------

export function createMockSupabaseClient() {
  const queryBuilder = createMockQueryBuilder();

  return {
    client: {
      from: vi.fn().mockReturnValue(queryBuilder),
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    },
    queryBuilder,
  };
}

// ---------------------------------------------------------------------------
// DatabaseService mock
// ---------------------------------------------------------------------------

export function createMockDatabaseService() {
  const supabase = createMockSupabaseClient();

  const mock = {
    getClient: vi.fn().mockReturnValue(supabase.client),
    rpc: vi.fn().mockResolvedValue(null),
  };

  return {
    mock,
    supabase,
  };
}

// ---------------------------------------------------------------------------
// Job fixtures and mocks
// ---------------------------------------------------------------------------

export function createJobFixture(overrides: Partial<Job> = {}): Job {
  const now = new Date();
  return {
    id: 'job-1',
    type: JobType.WEEKLY_REPORT_BATCH,
    status: JobStatus.PENDING,
    payload: {},
    priority: 0,
    maxRetries: 3,
    retryCount: 0,
    retryDelaySeconds: 60,
    scheduledAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export function createMockJobQueueService() {
  let childJobCounter = 0;
  return {
    createJob: vi.fn((options: CreateJobOptions) => ({
      id: `child-${String(++childJobCounter).padStart(4, '0')}`,
      ...options,
    })),
    logJobEvent: vi.fn(),
    updateJobMetadata: vi.fn(),
    updateJobStatus: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// ConfigService mock
// ---------------------------------------------------------------------------

export function createMockConfigService(
  overrides: Record<string, unknown> = {},
): any {
  const defaults: Record<string, unknown> = {
    SUPABASE_URL: 'http://localhost:54321',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    ADMIN_API_KEY: 'test-admin-key',
    TELEGRAM_BOT_TOKEN: 'test-bot-token',
    TELEGRAM_BOT_NAME: 'test_bot',
    TELEGRAM_WEBHOOK_SECRET: 'test-webhook-secret',
    ANALYTICS_ENGINE_URL: 'http://localhost:8001',
    ALPHA_ETL_URL: 'http://localhost:8002',
    ALPHA_ETL_WEBHOOK_SECRET: 'test-etl-secret',
    LIFI_INTEGRATOR: 'zapengine-test',
    LIFI_API_KEY: 'test-lifi-key',
    EMAIL_HOST: 'smtp.test.com',
    EMAIL_USER: 'test@test.com',
    // eslint-disable-next-line sonarjs/no-hardcoded-passwords
    EMAIL_APP_PASSWORD: 'test-password',
    NOTIFICATIONS_TEST_RECIPIENT: 'recipient@test.com',
    ADMIN_NOTIFICATIONS_ENABLED: 'true',
    REPORT_UNSUBSCRIBE_SECRET: 'test-report-unsubscribe-secret',
    ...overrides,
  };

  return {
    env: defaults as any,
    get: vi.fn(<T>(key: string, defaultValue?: T): T | undefined => {
      if (key in defaults) {
        return defaults[key] as T;
      }
      return defaultValue;
    }),
  };
}

// ---------------------------------------------------------------------------
// Mock result helpers
// ---------------------------------------------------------------------------

/**
 * Configure a mock query builder to return specific results in sequence.
 * Each call to `single()` or `then()` consumes the next result in the queue.
 */
export function configureMockResults(
  queryBuilder: ReturnType<typeof createMockQueryBuilder>,
  results: { data: unknown; error: unknown }[],
) {
  const queue = [...results];

  const dequeue = () => {
    const result = queue.shift() ?? { data: null, error: null };
    return Promise.resolve(result);
  };

  queryBuilder.single.mockImplementation(dequeue);
  queryBuilder.then.mockImplementation((resolve: (v: unknown) => unknown) => {
    const result = queue.shift() ?? { data: null, error: null };
    return Promise.resolve(resolve(result));
  });

  return queryBuilder;
}

// ---------------------------------------------------------------------------
// Equity-curve fixtures (strategy-change notifications)
// ---------------------------------------------------------------------------

/**
 * A three-day curve whose allocation rows are positional against the strategy
 * series, matching the artifact contract the schema enforces.
 */
export function createEquityCurveFixture(
  overrides: Partial<EquityCurveSubset> = {},
): EquityCurveSubset {
  return {
    window: { end: '2026-01-03' },
    series: [
      {
        id: 'strategy',
        values: [
          { date: '2026-01-01', value: 100 },
          { date: '2026-01-02', value: 110 },
          { date: '2026-01-03', value: 120.5 },
        ],
      },
    ],
    allocations: {
      assets: ['btc', 'eth', 'spy', 'stable'],
      values: [
        [0, 0, 0, 1],
        [0.5, 0, 0, 0.5],
        [0.25, 0.25, 0, 0.5],
      ],
    },
    events: [
      createCurveEventFixture({ date: '2026-01-02' }),
      createCurveEventFixture({
        date: '2026-01-03',
        type: 'rotate_to_eth',
        toAsset: 'ETH',
        fromAssets: ['BTC'],
        amountPercent: 25,
      }),
    ],
    eventsMeta: { strategyId: 'dma_fgi_portfolio_rules' },
    ...overrides,
  };
}

export function createCurveEventFixture(
  overrides: Partial<CurveEvent> = {},
): CurveEvent {
  return {
    date: '2026-01-02',
    type: 'buy',
    toAsset: 'BTC',
    fromAssets: [],
    amountUsd: 5000,
    amountPercent: 50,
    reason: 'portfolio_cross_up_equal_weight',
    ...overrides,
  };
}
