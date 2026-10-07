import { describe, expect, it, vi } from 'vitest';
import type { createClient } from '@supabase/supabase-js';
import { readControlCenterConfig } from '../../config/env.js';
import { readCtaExperiment } from './cta-experiment.js';

const now = new Date('2026-10-03T00:00:00Z');
const at = now.getTime() / 1000 - 2 * 86400;
const id = '12345678-1234-4234-8234-123456789012';
const config = readControlCenterConfig({
  POSTHOG_PERSONAL_API_KEY: 'test',
  POSTHOG_PROJECT_ID: '577455',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
});
const event = (
  name: string,
  offset = 0,
  location = 'hero',
  reason = '',
  submitted = '',
) => [name, String(at + offset), location, reason, submitted];
const visit = (
  events: unknown[],
  variant = 'control',
  person = 'anonymous',
  exposure = id,
  source = 'l.threads.com',
  device = 'Mobile',
  visibility = 'true',
) => [person, exposure, variant, source, device, events, visibility];
function database(data: unknown[] = [], error: unknown = null) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    gte: vi.fn(() => query),
    lte: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn().mockResolvedValue({ data, error }),
  };
  const create = vi.fn(() => ({
    from: vi.fn(() => query),
  })) as unknown as typeof createClient;
  return { create, query };
}
async function read(
  rows: unknown[],
  options: {
    data?: unknown[];
    error?: unknown;
    configuredDb?: boolean;
    configuredPh?: boolean;
    fetchImpl?: typeof fetch;
  } = {},
) {
  const db = database(options.data, options.error);
  const fetchImpl =
    options.fetchImpl ??
    vi.fn<typeof fetch>().mockResolvedValue(Response.json({ results: rows }));
  const result = await readCtaExperiment({
    config:
      options.configuredPh === false
        ? readControlCenterConfig({})
        : options.configuredDb === false
          ? { ...config, SUPABASE_URL: undefined }
          : config,
    now,
    fetchImpl,
    createSupabaseClient: db.create,
  });
  return { result, fetchImpl, db };
}

describe('CTA evidence loop', () => {
  it('joins persisted first-touch exposure IDs, never email or client success, and bounds ordered stages', async () => {
    const { result, fetchImpl, db } = await read(
      [
        visit([
          event('landing_cta_exposed'),
          event('waitlist_submit_attempted', 1), // out of order
          event('waitlist_cta_visible', 2),
          event('waitlist_cta_clicked', 3),
          event('waitlist_form_opened', 4),
          event('waitlist_form_started', 5),
          event('waitlist_submit_attempted', 6),
          event('waitlist_submitted', 7),
          event('waitlist_form_error', 8, 'hero', 'rate_limited'),
          event('waitlist_form_error', 9, 'hero', 'rate_limited'),
          event('waitlist_form_closed', 10, 'hero', '', 'false'),
          event('waitlist_form_error', 86401, 'hero', 'server_error'),
        ]),
      ],
      {
        data: [
          {
            cta_exposure_id: id,
            cta_experiment_variant: 'control',
            created_at: new Date((at + 7) * 1000).toISOString(),
          },
        ],
      },
    );
    expect(result).toMatchObject({
      status: 'ok',
      readiness: 'inconclusive',
      variants: [
        {
          variant: 'control',
          exposed: 1,
          visible: 1,
          clicked: 1,
          started: 1,
          attempted: 1,
          acknowledged: 1,
          confirmed: 1,
          errors: 1,
          closedWithoutSubmit: 1,
        },
      ],
      failures: [{ reason: 'rate_limited', people: 1 }],
      clickLocations: [{ location: 'hero', people: 1 }],
      segments: [{ source: 'threads', device: 'Mobile' }],
    });
    expect(db.query.select).toHaveBeenCalledWith(
      'cta_exposure_id,cta_experiment_variant,created_at',
    );
    expect(JSON.stringify(result)).not.toContain(id);
    expect(JSON.stringify(result)).not.toContain('anonymous');
    const body = JSON.parse(
      String(vi.mocked(fetchImpl).mock.calls[0]?.[1]?.body),
    );
    expect(body.query.query).toContain('LIMIT 2001');
    expect(body.query.query).toContain('cta_schema_version = 1');
    expect(body.query.query).toContain("'UTC'");
  });

  it('does not equate a success acknowledgement with a durable signup', async () => {
    const { result } = await read([
      visit([
        event('landing_cta_exposed'),
        event('waitlist_cta_visible', 1),
        event('waitlist_cta_clicked', 2),
        event('waitlist_form_opened', 3),
        event('waitlist_form_started', 4),
        event('waitlist_submit_attempted', 5),
        event('waitlist_submitted', 6),
      ]),
    ]);
    expect(result.variants[0]).toMatchObject({ acknowledged: 1, confirmed: 0 });
  });

  it.each([
    {
      cta_exposure_id: '87654321-4321-4321-8321-210987654321',
      cta_experiment_variant: 'control',
      created_at: new Date(at * 1000).toISOString(),
    },
    {
      cta_exposure_id: id,
      cta_experiment_variant: 'value_first',
      created_at: new Date(at * 1000).toISOString(),
    },
    {
      cta_exposure_id: id,
      cta_experiment_variant: 'control',
      created_at: new Date((at - 1) * 1000).toISOString(),
    },
    {
      cta_exposure_id: id,
      cta_experiment_variant: 'control',
      created_at: new Date((at + 86401) * 1000).toISOString(),
    },
  ])(
    'rejects unmatched, differently assigned, prior and late durable outcomes',
    async (signup) => {
      const { result } = await read([visit([event('landing_cta_exposed')])], {
        data: [signup],
      });
      expect(result.variants[0]?.confirmed).toBe(0);
    },
  );

  it('deduplicates people across exposures and excludes mixed variants and immature exposures', async () => {
    const second = '87654321-4321-4321-8321-210987654321';
    const { result } = await read([
      visit([event('landing_cta_exposed')]),
      visit([event('landing_cta_exposed', 1)], 'control', 'anonymous', second),
      visit([event('landing_cta_exposed')], 'control', 'mixed'),
      visit([event('landing_cta_exposed')], 'value_first', 'mixed', second),
      visit([event('landing_cta_exposed', 2 * 86400 - 2)], 'control', 'new'),
      visit([event('waitlist_form_error', 1)], 'control', 'orphan'),
    ]);
    expect(result).toMatchObject({
      excludedMultipleVariants: 1,
      excludedImmature: 1,
      variants: [{ exposed: 1 }],
    });
  });

  it.each([
    '',
    't.co',
    'youtube',
    'xiaohongshu.com',
    'rednote',
    '$direct',
    'other.example',
  ])('keeps bounded source/device diagnostics for %s', async (source) => {
    const { result } = await read([
      visit(
        [
          event('landing_cta_exposed'),
          event('waitlist_form_error', 1, '', ''),
          event('waitlist_cta_clicked', 2, ''),
        ],
        'baseline',
        'person',
        id,
        source,
        '',
        '',
      ),
    ]);
    expect(result).toMatchObject({
      readiness: 'inconclusive',
      visibilityUnmeasurable: 1,
      segments: [{ variant: 'baseline', device: 'unknown' }],
      failures: [{ reason: 'unknown' }],
      clickLocations: [{ location: 'unknown' }],
    });
  });

  it('preserves unknown confirmed counts when the migration/database is unavailable', async () => {
    const { result } = await read([visit([event('landing_cta_exposed')])], {
      error: { message: 'column missing' },
    });
    expect(result).toMatchObject({
      status: 'ok',
      sources: { waitlist: 'unavailable' },
      message: 'column missing',
      variants: [{ confirmed: null }],
    });
    expect((await read([], { configuredDb: false })).result.message).toContain(
      'configured Supabase',
    );
    expect((await read([], { data: [{}] })).result.sources.waitlist).toBe(
      'unavailable',
    );
  });

  it('does not interpret no exposure events as a measured zero conversion', async () => {
    const { result } = await read([]);
    expect(result).toMatchObject({
      status: 'ok',
      readiness: 'awaiting_data',
      variants: [],
    });
    expect(result.message).toContain('not evidence of zero');
  });

  it('fails closed on missing credentials, transport failures, invalid rows and truncation', async () => {
    expect((await read([], { configuredPh: false })).result.status).toBe(
      'unavailable',
    );
    expect(
      (
        await read([], {
          fetchImpl: vi.fn().mockRejectedValue(new Error('offline')),
        })
      ).result.message,
    ).toBe('offline');
    expect((await read([['malformed']])).result.status).toBe('unavailable');
    expect(
      (
        await read(
          Array.from({ length: 2001 }, () =>
            visit([event('landing_cta_exposed')]),
          ),
        )
      ).result,
    ).toMatchObject({ status: 'unavailable', truncated: true, variants: [] });
    expect(
      (
        await read([visit([event('landing_cta_exposed')])], {
          data: Array.from({ length: 2001 }, () => ({
            cta_exposure_id: id,
            cta_experiment_variant: 'control',
            created_at: now.toISOString(),
          })),
        })
      ).result,
    ).toMatchObject({
      sources: { waitlist: 'unavailable' },
      variants: [{ confirmed: null }],
    });
  });

  it('reports review readiness only at the sample floor without selecting a winner', async () => {
    const rows = Array.from({ length: 1000 }, (_, i) =>
      visit(
        [event('landing_cta_exposed')],
        i < 500 ? 'control' : 'value_first',
        `person-${i}`,
        `12345678-1234-4234-8234-${String(i).padStart(12, '0')}`,
      ),
    );
    const data = rows.slice(0, 20).map((row) => ({
      cta_exposure_id: row[1],
      cta_experiment_variant: row[2],
      created_at: new Date((at + 1) * 1000).toISOString(),
    }));
    const { result } = await read(rows, { data });
    expect(result.readiness).toBe('review_ready');
    expect(result).not.toHaveProperty('winner');
  });
});
