# Adding a Line to the Market Overview Chart

Step-by-step procedure for adding a new line to the Market Dashboard chart.
The reason this is not just a backend change — and where the static
registrations live — is in the local CLAUDE.md:

`apps/frontend/src/components/wallet/portfolio/views/invest/market/CLAUDE.md`

## Contract shape (reference)

`/api/v2/market/dashboard` is a self-describing payload:

- `series[series_id]` declares metadata (kind, unit, label, frequency, color
  hint, scale).
- `snapshots[].values[series_id]` carries the dated `SeriesPoint`.
- `indicators.dma_200` is the shared convention for 200-day moving averages.

The shared Zod contract in `packages/types/src/api/marketDashboard.ts` uses
generic records, so new series ids (`eth`, `gold`, `ndx`, …) pass validation
without schema changes.

## Checklist

1. **Backend** — `apps/analytics-engine/src/services/market/market_dashboard_service.py`:
   - Add the series id to `_SERIES_REGISTRY`.
   - Fetch or compute the source data.
   - Populate `values["<series_id>"]` per snapshot.
   - Add `indicators["dma_200"]` when the line needs a DMA pair.
2. **Shared contract** — usually no schema change needed (records are
   generic). Update comments / examples that hard-code series ids.
3. **Frontend line registry** — `sections/marketDashboardConstants.ts`:
   - Add the key to `MARKET_LINE_KEYS`.
   - Add a descriptor to `MARKET_LINES` (axis, defaultActive, color, dataKey,
     optional `strokeDasharray`).
4. **Frontend chart data** — `MarketOverviewChart.tsx`:
   - Add raw fields to `ChartDataPoint` for tooltip values.
   - Add normalized fields for Recharts `dataKey`s.
   - Normalize price + DMA pairs together, never against unrelated assets.
   - Update axis visibility checks.
   - Update `DOLLAR_FORMAT_LABELS` or ratio/gauge tooltip formatting as needed.
5. **Tests**:
   - Backend service + endpoint tests assert registry + snapshot values.
   - Frontend tests assert toggle rendering, default `aria-pressed`, tooltip
     formatting (`MarketDashboardView.test.tsx`).
   - Schema tests can use the new id as an example but do not prove the chart
     renders it.

## Verification

Targeted analytics:

```bash
pnpm --filter @zapengine/analytics-engine exec uv run pytest \
  tests/services/test_market_dashboard_service.py \
  tests/api/test_market_dashboard_endpoint.py
```

Targeted frontend (the broader `test:unit` script can still run the whole
suite — prefer direct `vitest`):

```bash
pnpm --filter @zapengine/frontend exec vitest run \
  tests/unit/components/wallet/portfolio/views/invest/market/MarketDashboardView.test.tsx
```

Live API sanity check (analytics-engine on port 8001):

```bash
curl -i -s 'http://localhost:8001/api/v2/market/dashboard?days=5'
```

For a new chart line, confirm both `series.<id>` and at least one
`snapshots[].values.<id>` exist before debugging the frontend.
