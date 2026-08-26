import type { ElectronMainOptions } from '@sentry/electron/main';

export function buildDesktopSentryOptions(
  dsn: string | undefined,
  release: string | undefined,
): ElectronMainOptions | undefined {
  const normalizedDsn = dsn?.trim();
  if (!normalizedDsn) {
    return undefined;
  }

  return {
    dsn: normalizedDsn,
    enableLogs: false,
    release: release?.trim() || undefined,
    sendDefaultPii: false,
    skipOpenTelemetrySetup: true,
  };
}
