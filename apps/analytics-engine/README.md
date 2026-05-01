# Analytics Engine

FastAPI read-only analytics backend for the Zap Pilot ecosystem. Serves portfolio trends, risk metrics, and market sentiment.

## Setup

```bash
pnpm --filter @zapengine/analytics-engine build   # uv sync --locked (first-time setup)
pnpm --filter @zapengine/analytics-engine dev     # http://localhost:8001
```

From inside this directory, drop the `--filter …` prefix: `pnpm build`, `pnpm dev`, etc.

See [CLAUDE.md](./CLAUDE.md) for the full command list and gotchas.

## API

Grouped under `/api/v2`:

- `portfolio/{user_id}/landing` — unified landing-page payload
- `analytics/{user_id}/trend` · `yield/daily` · `dashboard`
- `market/sentiment` · `sentiment/history` · `regime/history` · `sentiment/health`

Interactive docs at `/docs`.

## Hierarchical Attribution Sweep

Run this when validating the hierarchical SPY/crypto tactic stack across the
registered attribution variants.

Start the API first:

```bash
pnpm --filter @zapengine/analytics-engine dev
```

Then run the sweep from the repo root:

```bash
pnpm --filter @zapengine/analytics-engine exec uv run python scripts/attribution/sweep_hierarchical.py \
  --windows 2024,2025,2026,combined \
  --out attribution_$(date -I).md
```

The script posts each `dma_fgi_hierarchical_*` variant to
`/api/v3/backtesting/compare` and renders a markdown table with Calmar, Sharpe,
max drawdown, ROI, trades, win rate, delta Calmar versus control, and a
cross-window validation label.

Phase 2 NoDMA leave-one-out sweep:

```bash
pnpm --filter @zapengine/analytics-engine exec uv run python scripts/attribution/sweep_hierarchical.py \
  --windows 2024,2025,2026,combined \
  --baseline-strategy dma_fgi_hierarchical_full_minus_adaptive_dma \
  --variants dma_fgi_hierarchical_full_minus_adaptive_dma,dma_fgi_hierarchical_nodma_full_minus_spy_latch,dma_fgi_hierarchical_nodma_full_minus_greed_sell_suppression,dma_fgi_hierarchical_nodma_full_minus_buy_floor,dma_fgi_hierarchical_nodma_full_minus_fear_recovery_buy \
  --out attribution_phase2_$(date -I).md
```

Useful options:

```bash
--endpoint http://localhost:8001   # API base URL; this is the default
--windows 2024,2025,2026,combined  # comma-separated windows to run
--total-capital 10000              # default initial capital
--baseline-strategy <strategy-id>  # baseline for delta Calmar and validation
--variants <strategy-id,...>       # optional registered variant subset
--out attribution_2026-05-01.md    # optional markdown output path
--no-progress                      # disable stderr progress bar
```

Quick single-window run:

```bash
pnpm --filter @zapengine/analytics-engine exec uv run python scripts/attribution/sweep_hierarchical.py \
  --windows 2025
```

## Hierarchical Regression Events

Run this after changing the hierarchical SPY/crypto strategy to verify fixed
behavioral checkpoints like BTC/ETH cross-down routing, extreme-fear DCA, and
the 2026-04-06 SPY cross-up redeploy path.

Start the API first:

```bash
pnpm --filter @zapengine/analytics-engine dev
```

Then run the event validator:

```bash
pnpm --filter @zapengine/analytics-engine exec uv run python scripts/attribution/validate_hierarchical_events.py \
  --out hierarchical_validation_$(date -I).md
```

The fixture lives at
`tests/fixtures/hierarchical_validation_events.json`. Each case uses a search
window, so uncertain dates such as `2025-03-08 or 2025-03-09` are resolved from
the compare timeline instead of hard-coded to a single day.

## Import conventions

- Routers: `src.api.routers.*` (canonical). `src.api.routes.backtesting` is a deprecated shim.
- Strategies: `src.services.strategy.*` (canonical). `src.services.strategies.outlier_filter_strategy` is a deprecated shim.

## Dead-code policy

Two enforced checks on every push:

- `uv run python scripts/quality/check_service_reachability.py` — rejects unreachable `*ServiceDep` bindings
- `uv run vulture src/ vulture_whitelist.py --min-confidence 80` — symbol-level unused detection (weekly audit drops to 60)

Every entry in `vulture_whitelist.py` must carry an inline reason. Removing a module requires removing its whitelist entries in the same PR.

## Environment

PostgreSQL (Supabase) via async SQLAlchemy. `DATABASE_READ_ONLY=true` is enforced — writes are blocked at the pool level. Local port override: `ANALYTICS_ENGINE_PORT=8001`.
