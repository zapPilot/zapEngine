import { vi } from 'vitest';

export const AUDIENCE_ROW = [318, 1204, 90, 310, 4, 18, 20, 55, 8, 21, 6, 7, 2];
export const CTA_FUNNEL_STEPS = [
  { order: 0, count: 300 },
  { order: 1, count: 12 },
];
export const DISCORD_FUNNEL_STEPS = [
  { order: 0, count: 300 },
  { order: 1, count: 7 },
];
export const LANE_ROWS = [['episode-1', 'youtube', 'en', 8, 2, 1]];

export function posthogQueryFetch(
  overrides: {
    audience?: unknown;
    sources?: unknown;
    cta?: unknown;
    discord?: unknown;
    lanes?: unknown;
    status?: number;
  } = {},
) {
  return vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
    const { query } = JSON.parse(String(init?.body));
    const results =
      query.kind === 'FunnelsQuery'
        ? query.series[1].event === 'discord_cta_clicked'
          ? (overrides.discord ?? DISCORD_FUNNEL_STEPS)
          : (overrides.cta ?? CTA_FUNNEL_STEPS)
        : query.query.includes('argMin(')
          ? (overrides.sources ?? [
              ['threads', 210],
              ['x', 40],
              ['youtube', 15],
              ['rednote', 5],
              ['direct', 20],
              ['other', 10],
            ])
          : query.query.includes('AS episode_id')
            ? (overrides.lanes ?? LANE_ROWS)
            : (overrides.audience ?? [AUDIENCE_ROW]);
    return Response.json({ results }, { status: overrides.status ?? 200 });
  });
}
