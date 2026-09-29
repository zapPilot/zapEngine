import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/is-main-module.js', () => ({
  isMainModule: () => true,
}));

const originalArgv = process.argv;
const originalExitCode = process.exitCode;

beforeEach(() => {
  vi.resetModules();
  process.exitCode = undefined;
});

afterEach(() => {
  process.argv = originalArgv;
  process.exitCode = originalExitCode;
  vi.restoreAllMocks();
});

describe('social publish CLI main coverage', () => {
  it('reports a top-level CLI error and sets a non-zero exit code', async () => {
    process.argv = [
      'node',
      'social-cli',
      '123e4567-e89b-42d3-a456-426614174000',
    ];
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    await import('./cli.js');

    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('--language is required'),
    );
    expect(process.exitCode).toBe(1);
  });
});
