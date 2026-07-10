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
 * Whether the WalletConnect connector should be offered.
 *
 * Unlike Privy, a missing project ID does not disable the wallet stack —
 * `injected()` still works in real browsers. This only gates the
 * QR/deep-link connector, which is the only external-wallet path available
 * on hosts without browser extensions (e.g. the Electron desktop shell).
 *
 * @returns `true` when a non-empty `VITE_WALLETCONNECT_PROJECT_ID` is present.
 *
 * @example
 * ```ts
 * if (isWalletConnectEnabled()) {
 *   // offer the WalletConnect connector
 * }
 * ```
 */
export function isWalletConnectEnabled(): boolean {
  return getWalletConnectProjectId() !== undefined;
}
