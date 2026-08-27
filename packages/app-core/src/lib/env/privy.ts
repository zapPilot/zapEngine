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
