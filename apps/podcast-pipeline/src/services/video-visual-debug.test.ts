import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getPipelineSupabase: vi.fn(),
  throwSupabaseError: vi.fn(),
}));

vi.mock('./supabase-client.js', () => ({
  getPipelineSupabase: mocks.getPipelineSupabase,
  throwSupabaseError: mocks.throwSupabaseError,
}));

import { saveEpisodeVideoVisualDebug } from './video-visual-debug.js';

const episodeId = '00000000-0000-4000-8000-000000000001';

function updateQuery(result: { data: unknown; error: unknown }) {
  const builder = {
    update: vi.fn(),
    eq: vi.fn(),
    select: vi.fn(),
    maybeSingle: vi.fn(),
  };
  builder.update.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.select.mockReturnValue(builder);
  builder.maybeSingle.mockResolvedValue(result);
  return builder;
}

function stubSupabase(result: { data: unknown; error: unknown }) {
  const builder = updateQuery(result);
  const from = vi.fn(() => builder);
  mocks.getPipelineSupabase.mockReturnValue({ from });
  return { builder, from };
}

describe('saveEpisodeVideoVisualDebug', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes the checkpoint under the episode row this worker still leases', async () => {
    const { builder, from } = stubSupabase({
      data: { episode_id: episodeId },
      error: null,
    });
    const startedAt = Date.now();

    await expect(
      saveEpisodeVideoVisualDebug(episodeId, 'worker-1', { phase: 'planned' }),
    ).resolves.toBe(true);

    expect(from).toHaveBeenCalledWith('episode_video_visuals');
    const written = builder.update.mock.calls[0]?.[0] as {
      visual_payload: unknown;
      updated_at: string;
    };
    expect(written.visual_payload).toEqual({ phase: 'planned' });
    expect(Date.parse(written.updated_at)).toBeGreaterThanOrEqual(startedAt);
    // The three filters together are the lease fence: a stale worker must not
    // be able to overwrite a row that has already been reclaimed or completed.
    expect(builder.eq.mock.calls).toEqual([
      ['episode_id', episodeId],
      ['status', 'processing'],
      ['lease_owner', 'worker-1'],
    ]);
    expect(builder.select).toHaveBeenCalledWith('episode_id');
  });

  it('reports a lost lease when the fence matches no row', async () => {
    stubSupabase({ data: null, error: null });

    await expect(
      saveEpisodeVideoVisualDebug(episodeId, 'worker-1', { phase: 'searched' }),
    ).resolves.toBe(false);
    expect(mocks.throwSupabaseError).not.toHaveBeenCalled();
  });

  it('routes a Supabase failure through throwSupabaseError', async () => {
    const error = { code: '42501', message: 'permission denied' };
    stubSupabase({ data: null, error });
    mocks.throwSupabaseError.mockImplementation(() => {
      throw new Error('[42501] permission denied');
    });

    await expect(
      saveEpisodeVideoVisualDebug(episodeId, 'worker-1', {
        phase: 'search-failed',
      }),
    ).rejects.toThrow('[42501] permission denied');
    expect(mocks.throwSupabaseError).toHaveBeenCalledWith(error);
  });
});
