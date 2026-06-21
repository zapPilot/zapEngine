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
 * Gates the route entry on `VITE_PRIVY_APP_ID` being present so the bundle
 * app throws fast instead of rendering a degraded UI when the Privy App ID is
 * missing.
 *
 * @returns `true` when a non-empty `VITE_PRIVY_APP_ID` is present.
 *
 * @example
 * ```ts
 * if (isPrivyEnabled()) {
 *   // boot the Privy tree
 * }
 * ```
 */
export function isPrivyEnabled(): boolean {
  return getPrivyAppId() !== undefined;
}
