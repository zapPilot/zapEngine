export interface AnalyticsConfig {
  key: string;
  /** Omitted when unset: posthog-js already falls back to the US ingest host. */
  apiHost?: string;
}

export function buildAnalyticsConfig(
  key: string | undefined,
  host: string | undefined,
): AnalyticsConfig | undefined {
  const normalizedKey = key?.trim();
  if (!normalizedKey) {
    return undefined;
  }

  const normalizedHost = host?.trim();

  return {
    key: normalizedKey,
    ...(normalizedHost ? { apiHost: normalizedHost } : {}),
  };
}
