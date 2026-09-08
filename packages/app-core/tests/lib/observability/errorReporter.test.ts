import { beforeEach, describe, expect, it, vi } from 'vitest';

type ErrorReporterModule =
  typeof import('../../../src/lib/observability/errorReporter');

let errorReporter: ErrorReporterModule;

beforeEach(async () => {
  // Module-level state: every test needs a freshly evaluated module, not a
  // reporter left behind by the previous one.
  vi.resetModules();
  errorReporter = await import('../../../src/lib/observability/errorReporter');
});

describe('reportHandledError', () => {
  it('drops reports until a host injects a reporter', () => {
    expect(() =>
      errorReporter.reportHandledError(new Error('boom'), { scope: 'test' }),
    ).not.toThrow();
  });

  it('forwards the error and context to the injected reporter', () => {
    const reporter = vi.fn();
    errorReporter.setErrorReporter(reporter);

    const error = new Error('boom');
    errorReporter.reportHandledError(error, {
      scope: 'test',
      extra: { queryKey: ['portfolio', 'user-1'] },
    });

    expect(reporter).toHaveBeenCalledTimes(1);
    expect(reporter).toHaveBeenCalledWith(error, {
      scope: 'test',
      extra: { queryKey: ['portfolio', 'user-1'] },
    });
  });

  it('swallows a throwing reporter instead of failing the caller', () => {
    errorReporter.setErrorReporter(() => {
      throw new Error('reporter is broken');
    });

    expect(() =>
      errorReporter.reportHandledError(new Error('boom'), { scope: 'test' }),
    ).not.toThrow();
  });

  it('restores the no-op when the reporter is cleared', () => {
    const reporter = vi.fn();
    errorReporter.setErrorReporter(reporter);
    errorReporter.setErrorReporter(undefined);

    errorReporter.reportHandledError(new Error('boom'), { scope: 'test' });

    expect(reporter).not.toHaveBeenCalled();
  });
});
