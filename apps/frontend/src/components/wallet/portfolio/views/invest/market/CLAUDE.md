# Market Dashboard Chart Lines

Read this before adding or changing lines in the Market Overview chart.

## Contract Shape

`/api/v2/market/dashboard` is a self-describing payload:

- `series[series_id]` declares metadata such as kind, unit, label, frequency, color hint, and scale.
- `snapshots[].values[series_id]` carries the dated `SeriesPoint`.
- `indicators.dma_200` is the shared convention for 200-day moving averages.

The shared Zod contract in `packages/types/src/api/marketDashboard.ts` uses generic records for `series` and `values`, so frontend validation accepts new series ids such as `eth`, `gold`, or `ndx`.

## Current Frontend Reality

The chart is not fully dynamic yet. Even though the API wire shape accepts new series, the visible chart lines are still statically registered in:

- `sections/marketDashboardConstants.ts` for `MARKET_LINE_KEYS`, `MARKET_LINES`, colors, labels, default visibility, and data keys.
- `MarketOverviewChart.tsx` for flattening `values[series_id]`, normalization, tooltip formatting, and axis visibility.
- `MarketDashboardView.test.tsx` for toggle and tooltip regression coverage.

Do not assume adding a backend `SeriesDescriptor` is enough to make a line visible.

## Checklist For Adding A Line

1. Backend:
   - Add the series id to `_SERIES_REGISTRY` in `apps/analytics-engine/src/services/market/market_dashboard_service.py`.
   - Fetch or compute the source data.
   - Populate `values["<series_id>"]` per snapshot.
   - Add `indicators["dma_200"]` when the line needs a DMA pair.
2. Shared contract:
   - Usually no schema change is needed because `series` and `values` are records.
   - Update comments/examples if they list concrete series ids.
3. Frontend line registry:
   - Add keys to `MARKET_LINE_KEYS`.
   - Add descriptors to `MARKET_LINES`.
   - Decide `axis`, `defaultActive`, `color`, `dataKey`, and optional `strokeDasharray`.
4. Frontend chart data:
   - Add raw fields to `ChartDataPoint` for tooltip values.
   - Add normalized fields for Recharts `dataKey`s.
   - Normalize price + DMA pairs together, not against unrelated assets.
   - Update axis visibility checks.
   - Update `DOLLAR_FORMAT_LABELS` or ratio/gauge tooltip formatting.
5. Tests:
   - Backend service and endpoint tests should assert registry + snapshot values.
   - Frontend tests should assert toggle rendering, default `aria-pressed`, and tooltip formatting.
   - Schema tests can include the new series as an example, but they are not enough to prove the chart renders it.

## Verification Commands

Targeted analytics tests:

```bash
pnpm --filter @zapengine/analytics-engine exec uv run pytest \
  tests/services/test_market_dashboard_service.py \
  tests/api/test_market_dashboard_endpoint.py
```

Targeted frontend market dashboard tests:

```bash
pnpm --filter @zapengine/frontend exec vitest run \
  tests/unit/components/wallet/portfolio/views/invest/market/MarketDashboardView.test.tsx
```

Avoid relying on `pnpm --filter @zapengine/frontend test:unit -- <file>` for targeted runs; the current package script can still run the broader unit suite.

Live API sanity check when analytics-engine is running on port 8001:

```bash
curl -i -s 'http://localhost:8001/api/v2/market/dashboard?days=5'
```

For a new chart line, confirm both `series.<id>` and at least one `snapshots[].values.<id>` exist before debugging the frontend.
