import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getPipelineSupabase: vi.fn(),
}));

vi.mock('./supabase-client.js', () => ({
  getPipelineSupabase: mocks.getPipelineSupabase,
  throwSupabaseError: (error: unknown) => {
    throw error;
  },
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
  it('returns an empty snapshot when deployment claims are explicitly closed', async () => {
    const from = vi.fn();
    const rpc = vi.fn().mockResolvedValue({ data: false, error: null });
    const probe = createRenderWorkProbe({ from, rpc } as never);

    await expect(probe.loadSnapshot()).resolves.toMatchObject({
      videos: [],
      visuals: [],
      visualFailureNotices: [],
      nowMs: expect.any(Number),
    });

    expect(from).not.toHaveBeenCalled();
  });

  it('fails closed when the deployment gate RPC errors', async () => {
    const error = new Error('gate unavailable');
    const rpc = vi.fn().mockResolvedValue({ data: null, error });
    const probe = createRenderWorkProbe({ from: vi.fn(), rpc } as never);

    await expect(probe.loadSnapshot()).rejects.toBe(error);
  });

  it('fails when optional visual failure notices cannot be read', async () => {
    const from = vi.fn(() => emptyQuery());
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({
        data: null,
        error: new Error('notice read failed'),
      });
    const probe = createRenderWorkProbe({ from, rpc } as never);

    await expect(probe.loadSnapshot()).rejects.toThrow('notice read failed');
  });

  it('normalizes a null visual failure notice payload to an empty list', async () => {
    const from = vi.fn(() => emptyQuery());
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    const probe = createRenderWorkProbe({ from, rpc } as never);

    await expect(probe.loadSnapshot()).resolves.toMatchObject({
      videos: [],
      visuals: [],
      visualFailureNotices: [],
    });
  });

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
