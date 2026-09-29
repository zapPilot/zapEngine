import { describe, expect, it } from 'vitest';

import { readControlCenterConfig } from '../../../config/env.js';
import type { SentryInspectionOptions } from './sentry-options.js';
import { inspectSentrySignal } from './sentry.js';

const NOW = new Date('2026-09-19T09:00:00.000Z');

function inspectSentry(input: {
  key: string;
  kind?: string;
  fetchImpl: typeof fetch;
  sentry?: SentryInspectionOptions;
}): ReturnType<typeof inspectSentrySignal> {
  const kind = input.kind ?? 'issues';
  return inspectSentrySignal({
    config: readControlCenterConfig({
      SENTRY_OPS_AUTH_TOKEN: 'sentry-token',
      SENTRY_ORG_SLUG: 'zap-pilot',
    }),
    ...(input.sentry === undefined ? {} : { sentry: input.sentry }),
    fingerprint: `sentry:${kind}/${input.key}`,
    parsed: { source: 'sentry', kind, key: input.key },
    inspectedAt: NOW,
    fetchImpl: input.fetchImpl,
  });
}

// jscpd:ignore-start -- shared test json helper duplicated across operation tests
function json(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
// jscpd:ignore-end

function issue(
  id: string,
  slug = 'account-engine',
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    title: 'TypeError',
    count: 3,
    project: { slug },
    ...overrides,
  };
}

describe('inspectSentrySignal coverage', () => {
  it('reports unavailable without fetching when credentials are incomplete', async () => {
    const neverFetch: typeof fetch = async () => {
      throw new Error('missing credentials must not fetch');
    };

    const result = await inspectSentrySignal({
      config: readControlCenterConfig({}),
      fingerprint: 'sentry:issues/account-engine',
      parsed: { source: 'sentry', kind: 'issues', key: 'account-engine' },
      inspectedAt: NOW,
      fetchImpl: neverFetch,
    });

    expect(result.status).toBe('unavailable');
    expect(result.summary).toContain('credentials are incomplete');
    expect(result.gaps).toEqual([
      {
        source: 'sentry',
        reason: 'SENTRY_OPS_AUTH_TOKEN or SENTRY_ORG_SLUG is unset.',
      },
    ]);
  });

  it('rejects unsupported kinds without fetching', async () => {
    const neverFetch: typeof fetch = async () => {
      throw new Error('unsupported kinds must not fetch');
    };

    const result = await inspectSentry({
      key: 'product',
      kind: 'events',
      fetchImpl: neverFetch,
    });

    expect(result.status).toBe('unsupported');
    expect(result.summary).toContain(
      'Sentry inspection does not support events signals.',
    );
  });

  it('defaults to unresolved project issues in the last 24h when options are omitted', async () => {
    let seen = '';
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes('/organizations/zap-pilot/issues/')) {
        seen = url;
        return json([]);
      }
      throw new Error(`unexpected request: ${url}`);
    };

    const result = await inspectSentry({
      key: 'account-engine',
      fetchImpl,
    });
    const params = new URL(seen).searchParams;

    expect(params.get('query')).toBe('is:unresolved');
    expect(params.get('statsPeriod')).toBe('24h');
    expect(result.status).toBe('not-found');
    expect(result.summary).toContain(
      'No matching Sentry issues were found for account-engine on this page.',
    );
    expect(result.entities).toEqual([
      { type: 'sentry-project', id: 'account-engine' },
    ]);
  });

  it('lists organization-wide issues without a project entity', async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes('/organizations/zap-pilot/issues/')) {
        expect(new URL(url).searchParams.has('project')).toBe(false);
        return json([issue('1'), issue('2', 'alpha-etl')]);
      }
      if (url.includes('/issues/1/events/latest/')) {
        return json({});
      }
      throw new Error(`unexpected request: ${url}`);
    };

    const result = await inspectSentry({
      key: 'organization',
      fetchImpl,
      sentry: {},
    });

    expect(result.status).toBe('ok');
    expect(result.summary).toBe('organization: 2 matching issues inspected.');
    expect(result.entities).toHaveLength(2);
    expect(
      result.entities.every((entity) => entity.type === 'sentry-issue'),
    ).toBe(true);
  });

  it('marks the sample event unavailable when the latest-event read fails', async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes('/organizations/zap-pilot/issues/')) {
        return json([issue('9')]);
      }
      if (url.includes('/issues/9/events/latest/')) {
        return new Response('gone', { status: 500 });
      }
      throw new Error(`unexpected request: ${url}`);
    };

    const result = await inspectSentry({
      key: 'account-engine',
      fetchImpl,
      sentry: {},
    });

    expect(result.status).toBe('ok');
    expect(result.evidence['sampleEvent']).toMatchObject({
      unavailable: expect.stringContaining('500'),
    });
  });

  it('extracts exceptions while tolerating malformed entries, values, and frames', async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes('/organizations/zap-pilot/issues/')) {
        return json([issue('7', 'account-engine', { count: 5 })]);
      }
      if (url.includes('/issues/7/events/latest/')) {
        return json({
          eventID: 'event-7',
          entries: [
            { type: 'message', data: { message: 'hello' } },
            { type: 'exception', data: {} },
            {
              type: 'exception',
              data: {
                values: [
                  'bogus',
                  {
                    type: 'TypeError',
                    value: 'boom',
                    stacktrace: {
                      frames: [
                        {
                          filename: 'src/app.ts',
                          function: 'run',
                          module: 'app',
                          lineNo: 10,
                          colNo: 2,
                          inApp: true,
                        },
                        {},
                        42,
                      ],
                    },
                  },
                  { stacktrace: {} },
                ],
              },
            },
          ],
        });
      }
      throw new Error(`unexpected request: ${url}`);
    };

    const result = await inspectSentry({
      key: 'account-engine',
      fetchImpl,
      sentry: {},
    });
    const sampleEvent = result.evidence['sampleEvent'] as {
      eventId: string | null;
      exceptions: unknown[];
    };

    expect(sampleEvent.eventId).toBe('event-7');
    expect(sampleEvent.exceptions).toEqual([
      {
        type: 'TypeError',
        value: 'boom',
        frames: [
          {
            filename: 'src/app.ts',
            function: 'run',
            module: 'app',
            line: 10,
            column: 2,
            inApp: true,
          },
          {
            filename: null,
            function: null,
            module: null,
            line: null,
            column: null,
            inApp: null,
          },
        ],
      },
      { type: null, value: null, frames: [] },
    ]);
  });

  it('treats a cursor-less next link as the final page', async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes('/organizations/zap-pilot/issues/')) {
        return Response.json([issue('3')], {
          headers: {
            link: '<https://sentry.io/x>; rel="next"; results="true"',
          },
        });
      }
      if (url.includes('/issues/3/events/latest/')) {
        return json({});
      }
      throw new Error(`unexpected request: ${url}`);
    };

    const result = await inspectSentry({
      key: 'account-engine',
      fetchImpl,
      sentry: {},
    });

    expect(result.evidence).toMatchObject({
      nextCursor: null,
      hasMore: false,
    });
  });
});
