import type { Mock } from 'vitest';
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
  const anon = createMockSupabaseClient();
  const serviceRole = createMockSupabaseClient();

  const mock = {
    getClient: vi.fn().mockReturnValue(anon.client),
    getServiceRoleClient: vi.fn().mockReturnValue(serviceRole.client),
    rpc: vi.fn().mockResolvedValue(null),
  };

  return {
    mock,
    anon,
    serviceRole,
  };
}

// ---------------------------------------------------------------------------
// ConfigService mock
// ---------------------------------------------------------------------------

export function createMockConfigService(
  overrides: Record<string, unknown> = {},
): any {
  const defaults: Record<string, unknown> = {
    'database.supabase.url': 'http://localhost:54321',
    'database.supabase.anonKey': 'test-anon-key',
    'database.supabase.serviceRoleKey': 'test-service-role-key',
    ADMIN_API_KEY: 'test-admin-key',
    API_KEY: 'test-api-key',
    TELEGRAM_BOT_TOKEN: 'test-bot-token',
    TELEGRAM_BOT_NAME: 'test_bot',
    TELEGRAM_WEBHOOK_SECRET: 'test-webhook-secret',
    ANALYTICS_ENGINE_URL: 'http://localhost:8001',
    ALPHA_ETL_URL: 'http://localhost:8002',
    ALPHA_ETL_WEBHOOK_SECRET: 'test-etl-secret',
    EMAIL_HOST: 'smtp.test.com',
    EMAIL_USER: 'test@test.com',
    // eslint-disable-next-line sonarjs/no-hardcoded-passwords
    EMAIL_APP_PASSWORD: 'test-password',
    NOTIFICATIONS_TEST_RECIPIENT: 'recipient@test.com',
    ADMIN_NOTIFICATIONS_ENABLED: 'true',
    ...overrides,
  };

  return {
    env: defaults as any,
    get: vi.fn(<T>(key: string, defaultValue?: T): T | undefined => {
      // Support dot-path lookups
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
