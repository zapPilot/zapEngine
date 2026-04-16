## Snapshot Architecture

This document describes the canonical snapshot flow used to keep landing, trend,
and dashboard totals consistent across endpoints.

### High-Level Flow (Bundle Requests)

```mermaid
flowchart TD
    A[ETL: portfolio_item_snapshots] --> B[daily_portfolio_snapshots MV]
    C[ETL: alpha_raw.wallet_token_snapshots] --> D[daily_wallet_token_snapshots MV]
    B --> E[portfolio_category_trend_mv]
    D --> E
    E --> F[TrendAnalysisService (bundle)]
    F --> G[PortfolioSnapshotService]
    G --> H[LandingPageService]
    F --> I[DashboardService]
    J[CanonicalSnapshotService] --> H
    J --> I
```

### High-Level Flow (Wallet-Specific Requests)

```mermaid
flowchart TD
    A[ETL: portfolio_item_snapshots] --> B[daily_portfolio_snapshots MV]
    C[ETL: alpha_raw.wallet_token_snapshots] --> D[daily_wallet_token_snapshots MV]
    B --> E[get_portfolio_category_trend_by_user_id]
    D --> E
    E --> F[TrendAnalysisService (wallet-specific)]
    F --> G[DashboardService]
    J[CanonicalSnapshotService] --> G
```

### Notes
- The daily MVs dedupe to the latest snapshot per wallet per UTC day.
- Bundle trend queries use the materialized view for performance.
- Wallet-specific trend queries bypass the MV to preserve wallet filtering.
- CanonicalSnapshotService ensures landing + dashboard endpoints use the same
  "as-of" date, preventing cross-service drift.
