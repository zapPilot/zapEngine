import { afterEach, describe, expect, it, vi } from 'vitest';

import { pipelineCorrelation, recordRenderCorrelation } from './correlation.js';

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }));

vi.mock('../services/supabase-client.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/supabase-client.js')>()),
  getPipelineSupabase: () => ({ rpc: mockRpc }),
}));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
describe('producer correlation', () => {
  it('emits only real, valid runtime identifiers', () => {
    vi.stubEnv('APP_COMMIT_SHA', 'a'.repeat(40));
    vi.stubEnv('FLY_MACHINE_ID', 'machine1');
    expect(pipelineCorrelation({})).toEqual({
      gitSha: 'a'.repeat(40),
      flyMachineId: 'machine1',
    });
    vi.stubEnv('APP_COMMIT_SHA', 'unknown');
    vi.stubEnv('FLY_MACHINE_ID', 'person@example.com');
    expect(pipelineCorrelation({})).toEqual({});
  });
  it('leaves a gap without changing job outcome when persistence is absent', async () => {
    vi.stubEnv('SUPABASE_URL', '');
    await expect(recordRenderCorrelation('run', {})).resolves.toBeUndefined();
  });
  it('persists runtime correlation when Supabase is configured', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key');
    mockRpc.mockReturnValue({
      abortSignal: vi.fn().mockReturnValue({ error: null }),
    });

    await expect(
      recordRenderCorrelation('record-1', {
        gitSha: 'a'.repeat(40),
      }),
    ).resolves.toBeUndefined();
    expect(mockRpc).toHaveBeenCalledWith(
      'ops_record_runtime',
      expect.objectContaining({ p_record_id: 'record-1' }),
    );
  });
  it('warns instead of throwing when persistence reports an error', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key');
    mockRpc.mockReturnValue({
      abortSignal: vi.fn().mockReturnValue({ error: { message: 'db down' } }),
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      await expect(
        recordRenderCorrelation('record-2', {}),
      ).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalledWith(
        '[ops-correlation] Runtime identity could not be persisted.',
      );
    } finally {
      warn.mockRestore();
    }
  });
  it('warns instead of throwing when persistence throws', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key');
    mockRpc.mockImplementation(() => {
      throw new Error('transport down');
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      await expect(
        recordRenderCorrelation('record-3', {}),
      ).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});
