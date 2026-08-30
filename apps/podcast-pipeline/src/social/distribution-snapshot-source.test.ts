import { beforeEach, describe, expect, it, vi } from 'vitest';

const getPipelineSupabase = vi.hoisted(() => vi.fn());

vi.mock('../services/supabase-client.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../services/supabase-client.js')>();
  return { ...actual, getPipelineSupabase };
});

const { loadDistributionSnapshotSource } =
  await import('./distribution-snapshot-source.js');

const PAGE_SIZE = 1_000;

interface SelectCall {
  table: string;
  columns: string;
  orderColumn: string;
  range: [number, number];
}

/**
 * A Supabase stub that answers each table from a queue of pages, recording how
 * it was asked so the paging contract itself can be asserted.
 */
function stubClient(
  pages: Record<string, unknown[][]>,
  error?: { message: string },
): { calls: SelectCall[] } {
  const calls: SelectCall[] = [];
  const cursors = new Map<string, number>();

  function respond(call: SelectCall): {
    data: unknown[] | null;
    error: { message: string } | null;
  } {
    calls.push(call);
    if (error) return { data: null, error };
    const index = cursors.get(call.table) ?? 0;
    cursors.set(call.table, index + 1);
    return { data: pages[call.table]?.[index] ?? [], error: null };
  }

  // Split out of the builder chain so no arrow nests more than four deep.
  function rangeStage(base: Omit<SelectCall, 'range'>) {
    return {
      range: (from: number, to: number) => ({
        returns: () => respond({ ...base, range: [from, to] }),
      }),
    };
  }

  getPipelineSupabase.mockReturnValue({
    from: (table: string) => ({
      select: (columns: string) => ({
        order: (orderColumn: string) =>
          rangeStage({ table, columns, orderColumn }),
      }),
    }),
  });

  return { calls };
}

function rows(count: number): { id: string }[] {
  return Array.from({ length: count }, (_, index) => ({ id: `r${index}` }));
}

describe('loadDistributionSnapshotSource', () => {
  beforeEach(() => {
    getPipelineSupabase.mockReset();
  });

  it('reads every table the snapshot needs', async () => {
    const { calls } = stubClient({
      episodes: [[{ id: 'ep1' }]],
      episode_localizations: [[{ episode_id: 'ep1' }]],
      episode_videos: [[{ episode_id: 'ep1', status: 'completed' }]],
      social_posts: [[{ id: 'p1' }]],
      social_post_metrics: [[{ social_post_id: 'p1' }]],
      social_publish_jobs: [[{ status: 'completed' }]],
      social_strategy_versions: [[{ platform: 'x' }]],
    });

    const source = await loadDistributionSnapshotSource();

    expect(source.episodes).toHaveLength(1);
    expect(source.localizations).toHaveLength(1);
    expect(source.videos).toHaveLength(1);
    expect(source.posts).toHaveLength(1);
    expect(source.metrics).toHaveLength(1);
    expect(source.publishJobs).toHaveLength(1);
    expect(source.strategyVersions).toHaveLength(1);
    expect(calls.map((call) => call.table).sort()).toEqual([
      'episode_localizations',
      'episode_videos',
      'episodes',
      'social_post_metrics',
      'social_posts',
      'social_publish_jobs',
      'social_strategy_versions',
    ]);
  });

  it('keeps paging while a table answers a full page', async () => {
    const { calls } = stubClient({
      social_post_metrics: [rows(PAGE_SIZE), rows(PAGE_SIZE), rows(7)],
    });

    const source = await loadDistributionSnapshotSource();

    expect(source.metrics).toHaveLength(PAGE_SIZE * 2 + 7);
    expect(
      calls
        .filter((call) => call.table === 'social_post_metrics')
        .map((call) => call.range),
    ).toEqual([
      [0, 999],
      [1_000, 1_999],
      [2_000, 2_999],
    ]);
  });

  it('stops after one page when the first page is short', async () => {
    const { calls } = stubClient({ episodes: [rows(3)] });

    await loadDistributionSnapshotSource();

    expect(calls.filter((call) => call.table === 'episodes')).toHaveLength(1);
  });

  it('pages video rows by their own primary key', async () => {
    const { calls } = stubClient({ episode_videos: [[]] });

    await loadDistributionSnapshotSource();

    expect(
      calls.find((call) => call.table === 'episode_videos')?.orderColumn,
    ).toBe('episode_localization_id');
  });

  it('asks for an explicit column list rather than every column', async () => {
    const { calls } = stubClient({ social_posts: [[]] });

    await loadDistributionSnapshotSource();

    expect(calls.find((call) => call.table === 'social_posts')?.columns).toBe(
      'id,episode_id,platform,language_code,post_url,published_at',
    );
  });

  it('surfaces a rejected read instead of returning a short corpus', async () => {
    stubClient({}, { message: 'permission denied for table episodes' });

    await expect(loadDistributionSnapshotSource()).rejects.toThrow(
      /permission denied for table episodes/,
    );
  });
});
