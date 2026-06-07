import { getRuntimeEnv } from './runtimeEnv';

/**
 * Read the Privy application ID from the runtime environment.
 *
 * @returns The trimmed `VITE_PRIVY_APP_ID`, or `undefined` when unset/blank.
 *
 * @example
 * ```ts
 * const appId = getPrivyAppId();
 * ```
 */
export function getPrivyAppId(): string | undefined {
  const appId = getRuntimeEnv('VITE_PRIVY_APP_ID')?.trim();
  return appId ? appId : undefined;
}

/**
 * Whether the Privy embedded-wallet integration is configured.
 *
 * Gates both the Privy provider tree and the "Create Zap Wallet" button so the
 * app still boots on the RainbowKit-only flow when no Privy App ID is provided.
 *
 * @returns `true` when a non-empty `VITE_PRIVY_APP_ID` is present.
 *
 * @example
 * ```ts
 * if (isPrivyEnabled()) {
 *   // render the Create Zap Wallet button
 * }
 * ```
 */
export function isPrivyEnabled(): boolean {
  return getPrivyAppId() !== undefined;
}
