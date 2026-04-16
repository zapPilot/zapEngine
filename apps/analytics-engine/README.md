# Analytics Engine

FastAPI-based analytics backend for DeFi portfolio management and data aggregation in the Zap Pilot ecosystem. Provides portfolio analytics, risk metrics, and landing page data optimization for DeFi applications.

## Quick Start

```bash
# Install dependencies
make install

# Install git hooks (run once per clone so pre-commit runs on every commit)
uv run pre-commit install

# Start development server
make dev

# Run tests with coverage
make test

# Format and lint code
make format
make lint

# Type checking
make type-check

# Complete quality pipeline
make pre-commit
```

## API Endpoints

### System
- `GET /` - Health check
- `GET /health` - Detailed health check
- `GET /docs` - Interactive API documentation

### Portfolio Analytics
- `GET /api/v2/analytics/{user_id}/trend` - Historical trend analysis with configurable time periods
- `GET /api/v2/portfolio/{user_id}/landing` - Unified portfolio data for landing page optimization

### Market Data API
- `GET /api/v2/market/sentiment` - Current market sentiment (Fear & Greed)
- `GET /api/v2/market/sentiment/history` - Historical sentiment values
- `GET /api/v2/market/regime/history` - Market regime transition tracking
- `GET /api/v2/market/sentiment/health` - Sentiment service health status

### Risk Analytics
- `GET /api/v2/analytics/{user_id}/risk` - Portfolio risk metrics (volatility, Sharpe, drawdown)
- `GET /api/v2/analytics/{user_id}/risk/summary` - Combined risk summary backed by PortfolioInsightsService
- `GET /api/v2/analytics/{user_id}/yield/summary` - Yield summary with multi-window support and outlier filtering
- `GET /api/v2/analytics/{user_id}/dashboard` - Aggregated dashboard with flexible metric selection

## Testing URLs

When development server is running on port 8001:
- Health: http://localhost:8001/
- API Docs: http://localhost:8001/docs
- Portfolio Trends: http://localhost:8001/api/v2/analytics/{user_id}/trend
- Landing Page Data: http://localhost:8001/api/v2/portfolio/{user_id}/landing

## Architecture

- **FastAPI**: High-performance async web framework with dependency injection
- **SQLAlchemy**: Async database ORM with PostgreSQL (Supabase) and connection pooling
- **Python 3.11+**: Full type hints with mypy validation
- **uv**: Fast dependency management and virtual environment handling

### Specialized Services Architecture

The Analytics Engine uses a specialized service architecture:
- **SentimentDatabaseService**: Replaces external API calls with database-backed market sentiment data (synced via alpha-etl)
- **RegimeTrackingService**: Tracks market regime classifications (Fear/Greed/Neutral) and directional trends


- **TrendAnalysisService**: Historical portfolio trends and daily aggregations
- **RiskMetricsService**: Volatility, Sharpe ratio, and maximum drawdown calculations
- **AllocationAnalysisService**: Portfolio composition and category allocation tracking
- **DrawdownAnalysisService**: Enhanced drawdown analysis and underwater period tracking
- **RollingAnalyticsService**: Rolling window analytics (Sharpe ratio, volatility)
- **PortfolioAnalyticsContext**: Shared utilities for date calculations and interpretations

### Internal Import Conventions

- Canonical API router imports should use `src.api.routers.*`.
- Canonical strategy imports should use `src.services.strategy.*`.
- Legacy shim imports remain available for one release cycle:
  - `src.api.routes.backtesting`
  - `src.services.strategies.outlier_filter_strategy`

### Documentation

- **[CLAUDE.md](./CLAUDE.md)** - Development guidelines and service patterns

### Dead Code Policy

Dead-code detection uses two complementary checks:

- `uv run python scripts/check_service_reachability.py`
  - Validates that router-used `*ServiceDep` symbols resolve to reachable DI functions.
  - Flags service modules that are only test-referenced or fully unreferenced (unless allowlisted).
- `uv run vulture src/ vulture_whitelist.py --min-confidence <N>`
  - Symbol-level static unused-code detection.

Enforcement thresholds:

- PR/push CI blocker: `min-confidence 80`
- Weekly audit workflow: `min-confidence 60`

Whitelist policy (`vulture_whitelist.py`):

- Every whitelist entry must include a reason in comments.
- Any PR that deletes/moves modules must also remove stale whitelist entries.
- New whitelist entries should be rare and justified by framework/static-analysis limitations.

Local and CI command contract:

- Local pre-commit and `make lint` must run reachability + dead-code checks.
- CI test workflow must run the same checks with the blocker threshold.
- Weekly `Dead Code Audit` workflow must run both reachability and deep vulture scan.

## Development

For detailed commands, configuration, and development guidelines, see [CLAUDE.md](./CLAUDE.md).

## Key Features

- **Portfolio Analytics**: Historical trend analysis and portfolio summaries
- **Risk Metrics**: Volatility calculations and portfolio risk assessment
- **Landing Page Optimization**: Unified endpoints for frontend performance
- **High Performance**: Optimized SQL queries and connection pooling (-330-650ms latency reduction)
- **Production-Ready**: Environment-aware error handling and professional logging
- **Scalable**: 30 concurrent connection capacity with LIFO cache optimization
- **Read-only by Default**: Database operations with explicit write guards
- **Comprehensive Testing**: 90% coverage requirement with in-memory SQLite fixtures
- **Type Safety**: Full mypy validation with strict async typing

### Recent Performance Improvements (2025-01-16)

**Performance Gains**: -330-650ms across critical analytics paths
- ✅ Optimized SQL queries (window functions, JSONB, pool performance)
- ✅ Tuned connection pool (10/20 → 30 concurrent connections)
- ✅ Environment-aware error handling (detailed in dev, secure in production)
- 📋 Database index recommendations (pending DBA review for -150-300ms additional gain)

See `.serena/memories/performance_optimizations.md` for complete details.
