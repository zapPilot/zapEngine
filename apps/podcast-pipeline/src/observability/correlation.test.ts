import { afterEach, describe, expect, it, vi } from 'vitest';

import { pipelineCorrelation, recordRenderCorrelation } from './correlation.js';
afterEach(() => vi.unstubAllEnvs());
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
});
