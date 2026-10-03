import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  rpc: vi.fn().mockResolvedValue('incident'),
}));
vi.mock('node:fs/promises', () => ({ readFile: mocks.read }));
vi.mock('./config/env.js', () => ({ readControlCenterConfig: () => ({}) }));
vi.mock('./services/operations/operator/store.js', () => ({
  createOperatorStore: () => ({ rpc: mocks.rpc }),
}));
const argv = [...process.argv];
afterEach(() => {
  process.argv = argv;
  vi.restoreAllMocks();
});
const record = {
  fingerprint: 'sentry:stale-unresolved/desktop',
  actor: 'sweep',
  assessment: {
    target: '42',
    classification: 'engineering',
    stage: 'repair_pending',
    reason: 'Playback cancellation needs repair',
    evidence: ['Sentry 42'],
    nextAction: 'Reproduce the exact playback race',
    prNumber: null,
    fixSha: null,
    lastSeen: null,
    reviewAfter: '2026-10-04T00:00:00Z',
  },
};
async function run(args: string[], value = record) {
  vi.resetModules();
  mocks.rpc.mockClear();
  mocks.read.mockResolvedValue(JSON.stringify(value));
  process.argv = ['node', 'ops-triage-cli.ts', ...args];
  return import('./ops-triage-cli.js');
}
describe('bounded triage writer', () => {
  it('requires exactly one input and rejects project targets for Sentry', async () => {
    await expect(run([])).rejects.toThrow('exactly one');
    await expect(run(['a', 'b'])).rejects.toThrow('exactly one');
    await expect(
      run(['assessment.json'], {
        ...record,
        assessment: { ...record.assessment, target: 'desktop' },
      }),
    ).rejects.toThrow('exact issue ID');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('only persists assessment metadata and reports its incident identity', async () => {
    const output = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    await run(['assessment.json']);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('ops_record_triage', {
      p_fingerprint: record.fingerprint,
      p_actor: record.actor,
      p_assessment: record.assessment,
    });
    expect(output).toHaveBeenCalledWith(
      expect.stringContaining('"incidentId":"incident"'),
    );
  });
  it('accepts exact non-Sentry signal targets without triggering repairs', async () => {
    vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    await run(['assessment.json'], {
      ...record,
      fingerprint: 'fly:app/backend',
      assessment: { ...record.assessment, target: 'fly:app/backend' },
    });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
});
