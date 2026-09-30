import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getPipelineSupabase: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('./supabase-client.js', () => ({
  getPipelineSupabase: mocks.getPipelineSupabase,
  throwSupabaseError: (error: unknown) => {
    throw error;
  },
}));

import { recordVideoCompletionDelivery } from './video-completion-delivery.js';

const episodeId = '78c0a4f6-3e10-49de-ae0d-985e2b42b460';
const message = `🎬 三語影片完成：🇨🇳 中文・🇯🇵 日文・🇺🇸 英文\nhttps://example.test/e/${episodeId}`;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('video completion delivery default wiring', () => {
  it('uses the default Supabase client when none is injected', async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    mocks.getPipelineSupabase.mockReturnValue({ rpc: mocks.rpc });

    await recordVideoCompletionDelivery(message);

    expect(mocks.getPipelineSupabase).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledOnce();
  });

  it('uses console as the default logger when the default client fails', async () => {
    const error = new Error('database unavailable');
    mocks.rpc.mockResolvedValue({ data: null, error });
    mocks.getPipelineSupabase.mockReturnValue({ rpc: mocks.rpc });
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(
      recordVideoCompletionDelivery(message),
    ).resolves.toBeUndefined();

    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('failed to record grouped video completion'),
      expect.any(Error),
    );
  });
});
