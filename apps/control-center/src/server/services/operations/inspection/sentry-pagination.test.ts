import { describe, expect, it, vi } from 'vitest';
import { readControlCenterConfig } from '../../../config/env.js';
import { inspectOperationalSignal } from './inspect.js';
import type { SentryInspectionOptions } from './sentry-options.js';

const config = readControlCenterConfig({
  SENTRY_OPS_AUTH_TOKEN: 'token',
  SENTRY_ORG_SLUG: 'zap-pilot',
});
const start = '2026-08-01T00:00:00Z';
const end = '2026-08-02T00:00:00Z';
const issue = (id: number) => ({
  id: String(id),
  title: 'Issue',
  count: 1,
  project: { slug: 'account-engine' },
});

function inspect(
  fetchImpl: typeof fetch,
  sentry?: SentryInspectionOptions,
  fingerprint = 'sentry:issues/account-engine',
) {
  return inspectOperationalSignal({
    config,
    fingerprint,
    sentry,
    fetchImpl,
    now: () => new Date(end),
  });
}

describe('Sentry inspection pages', () => {
  it('keeps all 25 summaries and carries a cursor into the last page with identical filters', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      if (url.pathname.includes('/events/latest/')) {
        return Response.json({});
      }
      expect(url.searchParams.get('start')).toBe(start);
      expect(url.searchParams.get('end')).toBe(end);
      expect(url.searchParams.has('statsPeriod')).toBe(false);
      expect(url.searchParams.get('query')).toBe('');
      expect(url.searchParams.get('project')).toBe('account-engine');
      expect(url.searchParams.get('limit')).toBe('25');
      if (url.searchParams.get('cursor') === 'opaque:25:0') {
        return Response.json([issue(26)], {
          headers: {
            link: '<https://sentry.io/ignored>; rel="next"; results="false"; cursor="opaque:50:0"',
          },
        });
      }
      return Response.json(
        Array.from({ length: 25 }, (_, i) => issue(i)),
        {
          headers: {
            link: '<https://untrusted.example/>; rel="previous"; results="false"; cursor="prev", <https://untrusted.example/>; rel="next"; results="true"; cursor="opaque:25:0"',
          },
        },
      );
    });
    const first = await inspect(fetchImpl, { start, end, query: '' });
    expect(first.evidence['issues']).toHaveLength(25);
    expect(first.evidence).toMatchObject({
      nextCursor: 'opaque:25:0',
      hasMore: true,
      start,
      end,
      query: '',
    });
    expect(first.evidence['sampleEventScope']).toContain('not guaranteed');
    const last = await inspect(fetchImpl, {
      start,
      end,
      query: '',
      cursor: String(first.evidence['nextCursor']),
    });
    expect(last.evidence['issues']).toHaveLength(1);
    expect(last.evidence).toMatchObject({ nextCursor: null, hasMore: false });
    expect(
      fetchImpl.mock.calls.every(([url]) =>
        String(url).startsWith('https://sentry.io/'),
      ),
    ).toBe(true);
  });

  it('defaults to unresolved in 24h and leaves organization queries unscoped', async () => {
    const result = await inspect(
      async (input) => {
        const params = new URL(String(input)).searchParams;
        expect(params.get('statsPeriod')).toBe('24h');
        expect(params.get('query')).toBe('is:unresolved');
        expect(params.has('project')).toBe(false);
        return Response.json([]);
      },
      undefined,
      'sentry:issues/organization',
    );
    expect(result.status).toBe('not-found');
    expect(result.evidence).toMatchObject({
      issues: [],
      hasMore: false,
      nextCursor: null,
    });
  });

  it.each([
    { start },
    { end },
    { start: 'invalid', end },
    { start: end, end: start },
    { start, end: start },
  ])('rejects invalid time range %j before fetching', async (options) => {
    const fetchImpl = vi.fn<typeof fetch>();
    expect((await inspect(fetchImpl, options)).status).toBe('unsupported');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects Sentry options for other providers', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    expect(
      (await inspect(fetchImpl, { query: '' }, 'fly:app/example')).status,
    ).toBe('unsupported');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('does not silently omit malformed rows from a page', async () => {
    const result = await inspect(async () =>
      Response.json([issue(1), { id: 'broken' }]),
    );
    expect(result.status).toBe('unavailable');
    expect(result.gaps[0]?.reason).toContain('unrecognised body');
  });

  it('reports provider errors as unavailable, not an empty page', async () => {
    const result = await inspect(async () => new Response('', { status: 403 }));
    expect(result.status).toBe('unavailable');
    expect(result.gaps[0]?.reason).toContain('403');
  });
});
