import { beforeEach, describe, expect, it, vi } from 'vitest';

type ErrorReporterModule =
  typeof import('../../../src/lib/observability/errorReporter');
type QueryClientModule = typeof import('../../../src/lib/state/queryClient');

let reporter: ReturnType<typeof vi.fn>;
let queryClientModule: QueryClientModule;

beforeEach(async () => {
  // The client is a module-level singleton with its own cache, so each test
  // needs a fresh evaluation rather than a shared error history.
  vi.resetModules();

  const errorReporter: ErrorReporterModule =
    await import('../../../src/lib/observability/errorReporter');
  reporter = vi.fn();
  errorReporter.setErrorReporter(reporter);

  queryClientModule = await import('../../../src/lib/state/queryClient');
});

function failingQuery(queryKey: readonly unknown[], error: unknown) {
  return queryClientModule.queryClient.fetchQuery({
    queryKey,
    queryFn: async (): Promise<unknown> => {
      throw error;
    },
    retry: false,
  });
}

describe('queryClient error reporting', () => {
  it('reports a failed query together with its query key', async () => {
    const error = new Error('upstream exploded');

    await expect(
      failingQuery(['portfolio', 'summary', 'user-1'], error),
    ).rejects.toThrow('upstream exploded');

    expect(reporter).toHaveBeenCalledTimes(1);
    expect(reporter).toHaveBeenCalledWith(error, {
      scope: 'react-query',
      extra: { queryKey: ['portfolio', 'summary', 'user-1'] },
    });
  });

  it('reports a server failure', async () => {
    const error = Object.assign(new Error('bad gateway'), { status: 502 });

    await expect(
      failingQuery(['portfolio', 'apr', 'user-1'], error),
    ).rejects.toBe(error);

    expect(reporter).toHaveBeenCalledTimes(1);
  });

  it('stays silent for a 4xx, which describes the request rather than a fault', async () => {
    const error = Object.assign(new Error('user not found'), { status: 404 });

    await expect(
      failingQuery(['user', 'by-id', 'missing'], error),
    ).rejects.toBe(error);

    expect(reporter).not.toHaveBeenCalled();
  });
});
