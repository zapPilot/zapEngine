import { afterEach, describe, expect, it, vi } from 'vitest';

import { runTitleRepairCli, selectBacklog } from './title-repair-cli.js';

const LONG = '这是一个明显超过小红书二十单位限制的非常长的最佳标题内容';
const FITS = '短标题';

type Rows = Record<string, unknown[] | { error: unknown }>;

interface Call {
  table: string;
  update?: unknown;
  eqs: [string, unknown][];
}

function fakeDb(
  rows: Rows,
  updateResult: { data: unknown[] | null; error: unknown } = {
    data: [{ id: 'x' }],
    error: null,
  },
) {
  const calls: Call[] = [];
  const db = {
    from(table: string) {
      const call: Call = { table, eqs: [] };
      calls.push(call);
      const builder = {
        select: () => builder,
        eq: (c: string, v: unknown) => {
          call.eqs.push([c, v]);
          return builder;
        },
        gte: () => builder,
        order: () => builder,
        range: () => builder,
        update: (payload: unknown) => {
          call.update = payload;
          return builder;
        },
        then: (
          resolve: (v: unknown) => unknown,
          reject: (e: unknown) => unknown,
        ) => {
          const result =
            call.update === undefined ? readResult(rows[table]) : updateResult;
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      return builder;
    },
  };
  return { db: db as never, calls };
}

function readResult(r: Rows[string] | undefined) {
  if (Array.isArray(r)) return { data: r, error: null };
  return { data: null, error: r ? r.error : null };
}

function loc(over: Record<string, unknown> = {}) {
  return {
    id: 'loc-1',
    episode_id: 'ep-1',
    title: LONG,
    title_variants: null,
    title_provenance: null,
    raw_text: '文章正文',
    ...over,
  };
}

const EPISODES = [{ id: 'ep-1', source_title: '来源' }];

afterEach(() => vi.restoreAllMocks());

describe('selectBacklog', () => {
  it('selects only unusable, unposted, unclosed rows in range', async () => {
    const { db, calls } = fakeDb({
      episode_localizations: [
        loc(),
        loc({ id: 'fits', episode_id: 'ep-2', title: FITS }),
        loc({
          id: 'variant',
          episode_id: 'ep-3',
          title_variants: { '20': { title: FITS, method: 'llm' } },
        }),
        loc({ id: 'posted', episode_id: 'ep-4' }),
        loc({ id: 'skipped', episode_id: 'ep-5' }),
        loc({ id: 'closed', episode_id: 'ep-6' }),
        loc({ id: 'override', episode_id: 'ep-7' }),
        loc({ id: 'old', episode_id: 'ep-old' }),
      ],
      episodes: ['ep-1', 'ep-2', 'ep-3', 'ep-4', 'ep-5', 'ep-6', 'ep-7'].map(
        (id) => ({ id, source_title: null }),
      ),
      social_posts: [{ episode_id: 'ep-4' }],
      social_publish_jobs: [
        { episode_id: 'ep-5', status: 'skipped', legacy_title_override: null },
        { episode_id: 'ep-7', status: 'queued', legacy_title_override: FITS },
      ],
      social_release_closures: [{ episode_id: 'ep-6' }],
    });
    const backlog = await selectBacklog(db);
    expect(backlog.map((r) => r.id)).toEqual(['loc-1']);
    expect(backlog[0]?.sourceTitle).toBeNull();
    expect(calls.every((c) => !c.eqs.some(([k]) => k === 'episode_id'))).toBe(
      true,
    );
  });

  it('scopes every read to one episode', async () => {
    const { db, calls } = fakeDb({
      episode_localizations: [loc()],
      episodes: EPISODES,
    });
    await selectBacklog(db, 'ep-1');
    expect(
      calls.filter((c) =>
        c.eqs.some(([k, v]) => k === 'episode_id' && v === 'ep-1'),
      ),
    ).toHaveLength(4);
  });

  it('pages until a short page and surfaces read errors', async () => {
    const full = Array.from({ length: 1000 }, (_, i) =>
      loc({ id: `l${i}`, episode_id: `e${i}`, title: FITS }),
    );
    const { db } = fakeDb({ episode_localizations: full, episodes: [] });
    // First page is full, so a second (same) page is requested; make it terminate.
    let pages = 0;
    const wrapped = {
      from: (t: string) => {
        const b = (db as { from: (t: string) => Record<string, unknown> }).from(
          t,
        );
        if (t === 'episode_localizations') {
          b['range'] = () => {
            pages += 1;
            return b;
          };
          const origThen = b['then'] as (
            r: (v: unknown) => unknown,
            j: (e: unknown) => unknown,
          ) => unknown;
          b['then'] = (
            r: (v: unknown) => unknown,
            j: (e: unknown) => unknown,
          ) =>
            origThen((v) => r(pages === 1 ? v : { data: [], error: null }), j);
        }
        return b;
      },
    };
    expect(await selectBacklog(wrapped as never)).toEqual([]);
    expect(pages).toBe(2);

    const bad = fakeDb({
      episode_localizations: { error: { message: 'boom' } },
    });
    await expect(selectBacklog(bad.db)).rejects.toThrow('boom');
  });
});

describe('runTitleRepairCli', () => {
  const base = {
    episode_localizations: [loc()],
    episodes: EPISODES,
  };

  it('prints usage', async () => {
    const log = vi.fn();
    await runTitleRepairCli(['--help'], { log });
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Usage'));
  });

  it('rejects a bad limit', async () => {
    await expect(
      runTitleRepairCli(['--limit', '0'], { log: vi.fn() }),
    ).rejects.toThrow('--limit');
  });

  it('dry-run proposes without writing', async () => {
    const { db, calls } = fakeDb(base);
    const log = vi.fn();
    const compress = vi.fn(async (ledger) => {
      ledger.cost.push({ costUsd: 0.01 });
      return { title: FITS, reason: null, verifierRejections: 0 };
    });
    await runTitleRepairCli(['--limit', '1'], {
      db,
      log,
      compress: compress as never,
    });
    expect(compress).toHaveBeenCalledWith(expect.anything(), {
      best: LONG,
      sourceTitle: '来源',
      grounding: { articleText: '文章正文' },
    });
    expect(calls.some((c) => c.update !== undefined)).toBe(false);
    expect(log).toHaveBeenLastCalledWith(
      expect.stringContaining(
        '1 proposed, 0 written, 0 unresolved, cost $0.0100',
      ),
    );
  });

  it('apply merges variants and provenance conditionally', async () => {
    const { db, calls } = fakeDb({
      ...base,
      episode_localizations: [
        loc({
          title_variants: { '30': { title: 'x', method: 'llm' } },
          title_provenance: { version: 1, thesis: 't' },
        }),
      ],
    });
    const compress = vi.fn(async () => ({
      title: FITS,
      reason: null,
      verifierRejections: 0,
    }));
    await runTitleRepairCli(['--apply', '--episode', 'ep-1'], {
      db,
      log: vi.fn(),
      compress,
    });
    const update = calls.find((c) => c.update !== undefined)!;
    expect(update.update).toEqual({
      title_variants: {
        '30': { title: 'x', method: 'llm' },
        '20': { title: FITS, method: 'llm' },
      },
      title_provenance: { version: 1, thesis: 't', variantSource: 'repair' },
    });
    expect(update.eqs).toEqual([
      ['id', 'loc-1'],
      ['title', LONG],
    ]);
  });

  it('apply writes minimal provenance when none exists', async () => {
    const { db, calls } = fakeDb(base);
    await runTitleRepairCli(['--apply'], {
      db,
      log: vi.fn(),
      compress: async () => ({
        title: FITS,
        reason: null,
        verifierRejections: 2,
      }),
    });
    const update = calls.find((c) => c.update !== undefined)!;
    expect(update.update).toMatchObject({
      title_variants: { '20': { title: FITS, method: 'llm' } },
      title_provenance: {
        version: 1,
        thesis: '',
        angle: '',
        evidence: [],
        candidates: 0,
        rounds: 0,
        verifierRejections: 2,
        model: 'unknown',
        variantSource: 'repair',
      },
    });
  });

  it('reports concurrent change, empty text, failures and transport errors', async () => {
    const { db } = fakeDb(
      {
        episode_localizations: [
          loc(),
          loc({ id: 'l2', episode_id: 'ep-2', raw_text: '  ' }),
          loc({ id: 'l3', episode_id: 'ep-3' }),
          loc({ id: 'l4', episode_id: 'ep-4' }),
          loc({ id: 'l5', episode_id: 'ep-5', raw_text: null }),
        ],
        episodes: ['ep-1', 'ep-2', 'ep-3', 'ep-4', 'ep-5'].map((id) => ({
          id,
          source_title: id === 'ep-1' ? '来源' : null,
        })),
      },
      { data: null, error: null },
    );
    const log = vi.fn();
    const compress = vi
      .fn()
      .mockResolvedValueOnce({
        title: FITS,
        reason: null,
        verifierRejections: 0,
      })
      .mockResolvedValueOnce({
        title: null,
        reason: 'nope',
        verifierRejections: 1,
      })
      .mockRejectedValueOnce(new Error('network'));
    await runTitleRepairCli(['--apply'], { db, log, compress });
    const out = log.mock.calls.map((c) => c[0]).join('\n');
    expect(out).toContain('Best Title changed concurrently');
    expect(out).toContain('skipped: no article text');
    expect(out).toContain('no variant: nope');
    expect(out).toContain('error: network');
    expect(out).toContain('1 proposed, 0 written, 5 unresolved');
  });

  it('reports a failed proposal that carries no reason', async () => {
    const { db } = fakeDb(base);
    const log = vi.fn();
    await runTitleRepairCli([], {
      db,
      log,
      compress: vi.fn().mockResolvedValue({
        title: null,
        reason: null,
        verifierRejections: 0,
      }),
    });
    expect(log.mock.calls.map((c) => c[0]).join('\n')).toContain(
      'no variant: unknown',
    );
  });

  it('stringifies non-Error throws and surfaces update errors', async () => {
    const { db } = fakeDb(base, {
      data: null,
      error: { message: 'write failed' },
    });
    const log = vi.fn();
    await runTitleRepairCli([], {
      db,
      log,
      compress: vi.fn().mockRejectedValue('weird'),
    });
    expect(log.mock.calls.map((c) => c[0]).join('\n')).toContain(
      'error: weird',
    );
    await expect(
      runTitleRepairCli(['--apply'], {
        db,
        log,
        compress: vi.fn().mockResolvedValue({
          title: FITS,
          reason: null,
          verifierRejections: 0,
        }),
      }),
    ).rejects.toThrow('write failed');
  });

  it('falls back to the singleton client and real compressor defaults', async () => {
    vi.resetModules();
    const { db } = fakeDb({ episode_localizations: [], episodes: [] });
    vi.doMock('./supabase-client.js', async (orig) => ({
      ...(await orig<object>()),
      getPipelineSupabase: () => db,
    }));
    const mod = await import('./title-repair-cli.js');
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await mod.runTitleRepairCli([]);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('0 Rednote'));
    vi.doUnmock('./supabase-client.js');
  });
});
