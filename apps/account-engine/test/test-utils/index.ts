/**
 * Shared test utilities for Hono-based service tests.
 * Replaces the old NestJS-centric src/test-utils/ that was deleted during migration.
 */

// ---------------------------------------------------------------------------
// Supabase query builder mock
// ---------------------------------------------------------------------------

export interface MockQueryBuilder {
  select: jest.Mock;
  insert: jest.Mock;
  update: jest.Mock;
  upsert: jest.Mock;
  delete: jest.Mock;
  eq: jest.Mock;
  neq: jest.Mock;
  gt: jest.Mock;
  gte: jest.Mock;
  lt: jest.Mock;
  lte: jest.Mock;
  like: jest.Mock;
  ilike: jest.Mock;
  is: jest.Mock;
  in: jest.Mock;
  contains: jest.Mock;
  order: jest.Mock;
  limit: jest.Mock;
  range: jest.Mock;
  not: jest.Mock;
  or: jest.Mock;
  filter: jest.Mock;
  match: jest.Mock;
  single: jest.Mock;
  maybeSingle: jest.Mock;
  then: jest.Mock;
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
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    upsert: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    neq: jest.fn().mockReturnThis(),
    gt: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    lt: jest.fn().mockReturnThis(),
    lte: jest.fn().mockReturnThis(),
    like: jest.fn().mockReturnThis(),
    ilike: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    contains: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    range: jest.fn().mockReturnThis(),
    not: jest.fn().mockReturnThis(),
    or: jest.fn().mockReturnThis(),
    filter: jest.fn().mockReturnThis(),
    match: jest.fn().mockReturnThis(),
    // Terminal methods
    single: jest.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    // Thenable: when the query builder is awaited directly (e.g. `await query`),
    // JS calls query.then(resolve, reject). We must call resolve() with the result.
    then: jest.fn((resolve?: (v: unknown) => unknown) => {
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
      from: jest.fn().mockReturnValue(queryBuilder),
      rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
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
    getClient: jest.fn().mockReturnValue(anon.client),
    getServiceRoleClient: jest.fn().mockReturnValue(serviceRole.client),
    rpc: jest.fn().mockResolvedValue(null),
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
    get: jest.fn(<T>(key: string, defaultValue?: T): T | undefined => {
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
