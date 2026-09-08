import { describe, expect, it } from 'vitest';

import { buildHandledErrorReport } from '@/observability/queryErrorReporting';

const QUERY_CONTEXT = {
  scope: 'react-query',
  extra: { queryKey: ['portfolio', 'summary', 'user-1'] },
} as const;

function withStatus(message: string, status: number): Error {
  return Object.assign(new Error(message), { status });
}

describe('buildHandledErrorReport', () => {
  it('reports a network failure', () => {
    const error = new Error('Network request failed');

    expect(buildHandledErrorReport(error, QUERY_CONTEXT)).toEqual({
      error,
      scope: 'react-query',
      extra: { queryKey: ['portfolio', 'summary', 'user-1'] },
    });
  });

  it('reports a timeout', () => {
    const error = new Error('Request timed out after 60000ms');

    expect(buildHandledErrorReport(error, QUERY_CONTEXT)?.error).toBe(error);
  });

  it('reports a 5xx', () => {
    const error = withStatus('bad gateway', 502);

    expect(buildHandledErrorReport(error, QUERY_CONTEXT)?.error).toBe(error);
  });

  it('does not report a 404', () => {
    expect(
      buildHandledErrorReport(withStatus('user not found', 404), QUERY_CONTEXT),
    ).toBeNull();
  });

  it('does not report any other 4xx', () => {
    expect(
      buildHandledErrorReport(withStatus('unauthorized', 401), QUERY_CONTEXT),
    ).toBeNull();
    expect(
      buildHandledErrorReport(withStatus('rate limited', 429), QUERY_CONTEXT),
    ).toBeNull();
  });

  it('reports a 500 even though it borders the client range', () => {
    expect(
      buildHandledErrorReport(withStatus('server error', 500), QUERY_CONTEXT),
    ).not.toBeNull();
  });

  it('wraps a non-Error rejection so Sentry can group it', () => {
    const report = buildHandledErrorReport('queryFn rejected with a string', {
      scope: 'react-query',
    });

    expect(report?.error).toBeInstanceOf(Error);
    expect(report?.error.message).toBe('queryFn rejected with a string');
    expect(report?.extra).toEqual({});
  });

  it('carries the reporting scope through unchanged', () => {
    const report = buildHandledErrorReport(new Error('schema drift'), {
      scope: 'strategyService.getDailySuggestion',
      extra: { issues: [{ path: 'context.target.allocation', code: 'x' }] },
    });

    expect(report?.scope).toBe('strategyService.getDailySuggestion');
    expect(report?.extra).toEqual({
      issues: [{ path: 'context.target.allocation', code: 'x' }],
    });
  });
});
