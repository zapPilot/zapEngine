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

it.each(['code-scanning', 'secret-scanning'])(
  'guards %s target identities',
  async (surface) => {
    vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const fingerprint = `github-security:${surface}/repository`;
    await expect(
      run(['a'], {
        ...record,
        fingerprint,
        assessment: { ...record.assessment, target: fingerprint },
      }),
    ).rejects.toThrow('numeric alert ID');
    expect(mocks.rpc).not.toHaveBeenCalled();
    await run(['a'], { ...record, fingerprint });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  },
);
it.each([
  'github-security:dependabot/repository',
  '../requirements.txt',
  'not-a-manifest',
])('rejects invalid Dependabot target %s', async (target) => {
  await expect(
    run(['a'], {
      ...record,
      fingerprint: 'github-security:dependabot/repository',
      assessment: { ...record.assessment, target },
    }),
  ).rejects.toThrow('manifest path');
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it('accepts a Dependabot manifest target', async () => {
  vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  await run(['a'], {
    ...record,
    fingerprint: 'github-security:dependabot/repository',
    assessment: { ...record.assessment, target: 'pnpm-lock.yaml' },
  });
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
});
