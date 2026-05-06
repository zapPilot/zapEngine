interface RequestStatsSource {
  getRequestStats(): unknown;
}

export function buildRequestStats(
  sources: Record<string, RequestStatsSource>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(sources).map(([name, source]) => [
      name,
      source.getRequestStats(),
    ]),
  );
}
