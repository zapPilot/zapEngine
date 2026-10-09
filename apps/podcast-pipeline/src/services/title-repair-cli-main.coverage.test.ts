import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/is-main-module.js', () => ({ isMainModule: () => true }));

const originalArgv = process.argv;
const originalExitCode = process.exitCode;

afterEach(() => {
  process.argv = originalArgv;
  process.exitCode = originalExitCode;
  vi.restoreAllMocks();
});

describe('title repair CLI main', () => {
  it('reports a top-level error with a non-zero exit code', async () => {
    process.argv = ['node', 'title-repair-cli', '--nope'];
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    vi.resetModules();
    await import('./title-repair-cli.js');
    await vi.waitFor(() => expect(consoleError).toHaveBeenCalled());
    expect(process.exitCode).toBe(1);
  });
});
