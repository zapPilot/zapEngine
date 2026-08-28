import { trimToUndefined } from '@zapengine/types/shared';

export interface AppSentryOptions {
  dsn: string;
  enableAutoSessionTracking: false;
  enableLogs: false;
  release: string | undefined;
  sendDefaultPii: false;
}

export function buildAppSentryOptions(
  dsn: string | undefined,
  release: string | undefined,
): AppSentryOptions | undefined {
  const normalizedDsn = trimToUndefined(dsn);
  if (!normalizedDsn) {
    return undefined;
  }

  return {
    dsn: normalizedDsn,
    enableAutoSessionTracking: false,
    enableLogs: false,
    release: trimToUndefined(release),
    sendDefaultPii: false,
  };
}
