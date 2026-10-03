import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  config: vi.fn(),
  collect: vi.fn(),
  loop: vi.fn(),
  flush: vi.fn(),
}));
vi.mock('./sentry-init.js', () => ({}));
vi.mock('./sentry.js', () => ({ flushSentry: mocks.flush }));
vi.mock('./db-evidence.js', () => ({
  readDbEvidenceConfig: mocks.config,
  collectDbEvidence: mocks.collect,
  runDbEvidenceLoop: mocks.loop,
}));
const originalArgv = process.argv;
const originalExitCode = process.exitCode;
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.config.mockReturnValue({ directory: 'original' });
  mocks.collect.mockResolvedValue({
    metrics: { ok: true },
    database: { ok: true },
  });
  mocks.loop.mockResolvedValue(undefined);
  mocks.flush.mockResolvedValue(true);
  process.exitCode = undefined;
  vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  process.argv = originalArgv;
  process.exitCode = originalExitCode;
  vi.restoreAllMocks();
});

async function run(args: string[]) {
  process.argv = ['node', 'db-evidence-cli.ts', ...args];
  await import('./db-evidence-cli.js');
}

describe('DB evidence CLI', () => {
  it('captures once, accepts a destination override, and flushes before exit', async () => {
    await run(['--once', '--directory', '/owner-only/evidence']);
    expect(mocks.collect).toHaveBeenCalledWith({
      directory: '/owner-only/evidence',
    });
    expect(mocks.flush).toHaveBeenCalledTimes(1);
    expect(process.exit).toHaveBeenCalledWith(0);
    expect(mocks.flush.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(process.exit).mock.invocationCallOrder[0]!,
    );
  });
  it('returns failure when either source is unavailable', async () => {
    mocks.collect.mockResolvedValueOnce({
      metrics: { ok: false },
      database: { ok: true },
    });
    await run(['--once']);
    expect(process.exit).toHaveBeenLastCalledWith(1);
    vi.resetModules();
    mocks.collect.mockResolvedValueOnce({
      metrics: { ok: true },
      database: { ok: false },
    });
    await run(['--once']);
    expect(process.exit).toHaveBeenLastCalledWith(1);
  });
  it('flushes even when capture throws', async () => {
    mocks.collect.mockRejectedValueOnce(new Error('local storage unavailable'));
    await run(['--once']);
    expect(console.error).toHaveBeenCalledWith(
      'db-evidence: CLI failed',
      expect.any(Error),
    );
    expect(process.exit).toHaveBeenCalledWith(1);
    expect(mocks.flush).toHaveBeenCalledTimes(1);
  });
  it('rejects unsupported arguments and missing destination', async () => {
    await run(['--invalid']);
    expect(process.exit).toHaveBeenLastCalledWith(1);
    vi.resetModules();
    await run(['--directory']);
    expect(process.exit).toHaveBeenLastCalledWith(1);
  });
  it('runs continuously and wires both shutdown signals to abort', async () => {
    const handlers: (() => void)[] = [];
    vi.spyOn(process, 'once').mockImplementation((event, handler) => {
      expect(['SIGINT', 'SIGTERM']).toContain(event);
      handlers.push(handler as () => void);
      return process;
    });
    await run([]);
    expect(mocks.loop).toHaveBeenCalledTimes(1);
    const signal = mocks.loop.mock.calls[0]?.[1].signal as AbortSignal;
    expect(signal.aborted).toBe(false);
    for (const handler of handlers) handler();
    expect(signal.aborted).toBe(true);
    expect(mocks.flush).toHaveBeenCalledTimes(1);
  });
});
