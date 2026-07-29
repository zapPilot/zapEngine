import { getRuntimeEnv } from './runtimeEnv';

/**
 * Read the WalletConnect Cloud project ID from the runtime environment.
 *
 * @returns The trimmed `VITE_WALLETCONNECT_PROJECT_ID`, or `undefined` when unset/blank.
 *
 * @example
 * ```ts
 * const projectId = getWalletConnectProjectId();
 * ```
 */
export function getWalletConnectProjectId(): string | undefined {
  const projectId = getRuntimeEnv('VITE_WALLETCONNECT_PROJECT_ID')?.trim();
  return projectId ? projectId : undefined;
}

/**
 * Whether the WalletConnect connector should be configured.
 *
 * Unlike Privy, a missing project ID does not disable the wallet stack —
 * `injected()` still works in real browsers. This only gates the generic
 * QR/deep-link connector retained below the visible picker as a future seam
 * for curated mobile-wallet handoffs.
 *
 * @returns `true` when a non-empty `VITE_WALLETCONNECT_PROJECT_ID` is present.
 *
 * @example
 * ```ts
 * if (isWalletConnectEnabled()) {
 *   // configure the WalletConnect connector
 * }
 * ```
 */
export function isWalletConnectEnabled(): boolean {
  return getWalletConnectProjectId() !== undefined;
}
