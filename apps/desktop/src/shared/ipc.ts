/**
 * Typed IPC contract shared between the Electron main process and the
 * preload bridge. Keep this file dependency-free (pure TypeScript) so both
 * esbuild bundles and vitest can consume it directly.
 */

export const IPC_CHANNELS = {
  /** main → renderer: a rebalance proposal is ready (background scheduler). */
  rebalanceProposal: 'zap:rebalance-proposal',
  /** renderer → main: push the logged-in scheduler context after Privy auth. */
  registerSchedulerContext: 'zap:register-scheduler-context',
  /** renderer → main: clear the scheduler context (logout). */
  clearSchedulerContext: 'zap:clear-scheduler-context',
  /** renderer → main: open an https URL in the system browser. */
  openExternal: 'zap:open-external',
  /** main → renderer: a zappilotv2:// deep link arrived. */
  deepLink: 'zap:deep-link',
} as const;

export type SchedulerContext = {
  userId: string;
  walletAddress: string;
};

export type RebalanceProposal = {
  /** Absolute drift in percentage points that triggered the proposal. */
  driftPercent: number;
  /** ISO timestamp when the proposal was computed. */
  generatedAt: string;
  /** Optional strategy identifier the proposal applies to. */
  strategyId?: string;
};

export function isSchedulerContext(value: unknown): value is SchedulerContext {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate['userId'] === 'string' &&
    candidate['userId'].length > 0 &&
    typeof candidate['walletAddress'] === 'string' &&
    /^0x[0-9a-fA-F]{40}$/.test(candidate['walletAddress'])
  );
}

export function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  return parsed.protocol === 'https:';
}

export function isDeepLinkUrl(value: unknown, scheme: string): value is string {
  return typeof value === 'string' && value.startsWith(`${scheme}://`);
}
