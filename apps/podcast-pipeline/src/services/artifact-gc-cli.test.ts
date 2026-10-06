import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  run: vi.fn(),
  release: vi.fn(),
  main: vi.fn(() => false),
  cli: vi.fn(),
}));
vi.mock('./artifact-gc.js', () => ({
  createArtifactGcDependencies: mocks.create,
  runArtifactGc: mocks.run,
  releaseArtifactGcOwner: mocks.release,
}));
vi.mock('../lib/is-main-module.js', () => ({ isMainModule: mocks.main }));
vi.mock('../lib/cli-runner.js', () => ({ runCli: mocks.cli }));
import { runArtifactGcCli } from './artifact-gc-cli.js';
afterEach(() => {
  process.exitCode = 0;
  vi.clearAllMocks();
});
it.each([
  ['--wat'],
  ['stray'],
  ['--apply', 'yes'],
  ['--dry-run', 'yes'],
  ['--apply', '--dry-run'],
  ['--owner'],
  ['--owner', 'bad'],
  ['--release-owner', 'bad'],
  ['--max-minutes'],
  ['--max-minutes', '0'],
  ['--max-minutes', 'NaN'],
  ['--release-owner', '00000000-0000-0000-0000-000000000000', '--apply'],
])('rejects invalid args %j', async (...args) => {
  await expect(runArtifactGcCli(args)).rejects.toThrow();
  expect(mocks.create).not.toHaveBeenCalled();
});
it('runs dry-run by default and propagates failures', async () => {
  mocks.create.mockReturnValue('deps');
  mocks.run.mockResolvedValue({ failures: 1 });
  await runArtifactGcCli([]);
  expect(mocks.run).toHaveBeenCalledWith('deps', { apply: false });
  expect(process.exitCode).toBe(1);
});
it('passes explicit owner and budget', async () => {
  mocks.run.mockResolvedValue({ failures: 0 });
  await runArtifactGcCli([
    '--apply',
    '--owner',
    '00000000-0000-0000-0000-000000000000',
    '--max-minutes',
    '18',
  ]);
  expect(mocks.run).toHaveBeenCalledWith(expect.anything(), {
    apply: true,
    owner: '00000000-0000-0000-0000-000000000000',
    maxMinutes: 18,
  });
});
it('releases only the supplied owner', async () => {
  await runArtifactGcCli([
    '--release-owner',
    '00000000-0000-0000-0000-000000000000',
  ]);
  expect(mocks.release).toHaveBeenCalled();
  expect(mocks.run).not.toHaveBeenCalled();
});
it('registers and executes the main entry', async () => {
  vi.resetModules();
  mocks.main.mockReturnValue(true);
  mocks.run.mockResolvedValue({ failures: 0 });
  await import('./artifact-gc-cli.js');
  const original = process.argv;
  process.argv = ['node', 'gc'];
  try {
    await mocks.cli.mock.calls[0]![0]();
    expect(mocks.run).toHaveBeenCalled();
  } finally {
    process.argv = original;
    mocks.main.mockReturnValue(false);
  }
});
