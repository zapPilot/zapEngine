## Snapshot Architecture

This document describes the canonical snapshot flow used to keep landing, trend,
and dashboard totals consistent across endpoints.

### High-Level Flow (Bundle Requests)

```mermaid
flowchart TD
    A[ETL: portfolio_item_snapshots] --> Q[Dirty-key queues]
    C[ETL: alpha_raw.wallet_token_snapshots] --> Q
    W[user_crypto_wallets] --> Q
    Q --> P[Incremental rollup processor]
    P --> B[Private daily portfolio cache]
    P --> D[Private daily wallet-token cache]
    B --> E[Private category-trend cache]
    D --> E
    E --> V[portfolio_category_trend_mv compatibility view]
    V --> F[TrendAnalysisService (bundle)]
    F --> G[PortfolioSnapshotService]
    G --> H[LandingPageService]
    F --> I[DashboardService]
    J[CanonicalSnapshotService] --> H
    J --> I
```

### High-Level Flow (Wallet-Specific Requests)

```mermaid
flowchart TD
    A[ETL: portfolio_item_snapshots] --> B[daily_portfolio_snapshots compatibility view]
    C[ETL: alpha_raw.wallet_token_snapshots] --> D[daily_wallet_token_snapshots compatibility view]
    B --> E[get_portfolio_category_trend_by_user_id]
    D --> E
    E --> F[TrendAnalysisService (wallet-specific)]
    F --> G[DashboardService]
    J[CanonicalSnapshotService] --> G
```

### Notes

- The portfolio cache keeps every position from each protocol's latest batch per
  wallet and UTC day. It never deduplicates by `id_raw`.
- DeBank invokes the rollup processor after writes; the retained 30-minute cron
  drains any queue entries left by failures or other writers.
- The three historical relation names are security-invoker views backed by
  private cache tables.
- Bundle trend queries use the precomputed trend cache for performance.
- Wallet-specific trend queries use runtime aggregation to preserve wallet filtering.
- CanonicalSnapshotService ensures landing + dashboard endpoints use the same
  "as-of" date, preventing cross-service drift.
