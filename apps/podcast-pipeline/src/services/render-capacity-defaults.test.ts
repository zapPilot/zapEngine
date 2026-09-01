import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getPipelineSupabase: vi.fn(),
}));

vi.mock('./supabase-client.js', () => ({
  getPipelineSupabase: mocks.getPipelineSupabase,
}));

import { createRenderWorkProbe } from './render-capacity.js';

function emptyQuery() {
  const builder = {
    select: vi.fn(),
    in: vi.fn(),
    returns: vi.fn(),
  };
  builder.select.mockReturnValue(builder);
  builder.in.mockReturnValue(builder);
  builder.returns.mockResolvedValue({ data: [], error: null });
  return builder;
}

describe('render work probe default wiring', () => {
  it('builds the pipeline Supabase client lazily when no client is injected', async () => {
    const from = vi.fn(() => emptyQuery());
    const rpc = vi.fn(async () => ({ data: [], error: null }));
    mocks.getPipelineSupabase.mockReturnValue({ from, rpc });

    const probe = createRenderWorkProbe();
    await expect(probe.loadSnapshot()).resolves.toMatchObject({
      videos: [],
      visuals: [],
      nowMs: expect.any(Number),
    });

    expect(mocks.getPipelineSupabase).toHaveBeenCalledOnce();
    expect(from).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenCalledWith(
      'reap_failed_episode_video_visual_notifications',
      { p_limit: 20 },
    );
  });
});
