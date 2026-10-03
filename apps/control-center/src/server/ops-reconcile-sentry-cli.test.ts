import { afterEach, describe, expect, it, vi } from 'vitest';

const reconcile = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ reconciled: true }),
);
vi.mock('./config/env.js', () => ({ readControlCenterConfig: () => ({}) }));
vi.mock('./services/operations/aggregate.js', () => ({
  createOperationsService: () => ({ reconcileSentryIssue: reconcile }),
}));
const argv = [...process.argv];
afterEach(() => {
  process.argv = argv;
  vi.restoreAllMocks();
});
describe('provider-read reconciliation CLI', () => {
  it('requires exactly one issue identity', async () => {
    for (const args of [[], ['42', '43']]) {
      vi.resetModules();
      process.argv = ['node', 'ops-reconcile-sentry-cli.ts', ...args];
      await expect(import('./ops-reconcile-sentry-cli.js')).rejects.toThrow(
        'exactly one',
      );
    }
  });
  it('reports reconciliation through the bounded service', async () => {
    vi.resetModules();
    process.argv = ['node', 'ops-reconcile-sentry-cli.ts', '42'];
    const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    await import('./ops-reconcile-sentry-cli.js');
    expect(reconcile).toHaveBeenCalledWith('42');
    expect(write).toHaveBeenCalledWith('{"reconciled":true}\n');
  });
});
