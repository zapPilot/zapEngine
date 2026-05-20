# Market Dashboard Chart Lines

Read this before changing lines in the Market Overview chart.

## Invariant: the chart is not fully dynamic

The `/api/v2/market/dashboard` wire shape accepts arbitrary series ids
(`packages/types/src/api/marketDashboard.ts` uses generic records). But the
visible chart lines are statically registered in **three** places, all of
which must be updated to make a new line visible:

- `sections/marketDashboardConstants.ts` — `MARKET_LINE_KEYS`, `MARKET_LINES`,
  colors, labels, default visibility, data keys.
- `MarketOverviewChart.tsx` — flattens `values[series_id]`, normalizes,
  formats tooltips, manages axis visibility.
- `MarketDashboardView.test.tsx` — toggle and tooltip regression coverage.

Adding a backend `SeriesDescriptor` is **not** enough.

## How to actually add a line

Step-by-step checklist + verification commands live in
`apps/frontend/docs/market-dashboard-add-line.md`.
