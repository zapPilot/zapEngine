# Analytics Engine

FastAPI-based analytics backend for DeFi portfolio management and data aggregation in the Zap Pilot ecosystem.

## Project Structure & Modules
- `src/`: FastAPI application and business logic
  - `src/main.py`: Application entrypoint with lifespan management and CORS configuration
  - `src/core/`: Configuration (`config.py`) and database layer (`database.py`)
  - `src/api/routers/`: HTTP route handlers (`portfolios.py`, `landing_page.py`, `risk.py`)
  - `src/services/`: Business logic services (`portfolio_service.py`, `landing_page_service.py`, `roi_calculator.py`)
  - `src/queries/`: SQL query registry and parameterized query files
  - `src/models/`: Pydantic models for request/response validation
- `tests/`: Comprehensive pytest suite with PostgreSQL-backed fixtures (see `TEST_DATABASE_URL` and `DATABASE_INTEGRATION_URL`)
- Root: `Makefile`, `Dockerfile`, `pyproject.toml`, environment configuration

## Build, Test, and Development Commands
- `make install`: Install dependencies via `uv sync`
- `make dev`: Run FastAPI development server with hot reload on `0.0.0.0:8001`
- `make test`: Run pytest with coverage reporting (HTML + terminal)
- `make lint` / `make format`: Run ruff linting/formatting, mypy type checking, and pylint duplicate detection
- `make type-check`: Run mypy type checking on `src/`
- `make duplicate-check`: Run pylint duplicate code detection
- `make pre-commit`: Complete quality pipeline (format, lint, type-check, duplicate-check, tests)
- Docker: `make docker` (compose up), `make docker-prod` (build production image)

## Architecture & Design Patterns

### Layered Architecture
- **API Layer**: FastAPI routers with dependency injection
- **Service Layer**: Business logic with async database operations
- **Data Layer**: SQLAlchemy async with connection pooling
- **Query Layer**: SQL query registry pattern loading from .sql files

### Key Features
- **Read-only by default**: Database operations are read-only with explicit write guards
- **Async/await patterns**: Full async support for high-concurrency analytics workloads
- **Query registry**: SQL queries managed as .sql files with parameterized execution
- **Comprehensive testing**: In-memory SQLite fixtures with 95%+ coverage
- **Type safety**: Full type hints with mypy validation
- **Specialized services**: Domain-specific services with single responsibilities
- **Performance optimized**: -330-650ms latency reduction across critical paths (see `.serena/memories/performance_optimizations.md`)
- **Production-ready**: Environment-aware error handling, professional logging, 30 concurrent connection capacity
- **Canonical snapshot consistency**: Daily snapshot MVs + CanonicalSnapshotService keep landing, dashboard, and trend data aligned

## Specialized Services Architecture

### Overview
The Analytics Engine uses a **specialized service architecture** where each service has a single, well-defined responsibility. This replaced a previous facade pattern (960 lines, 19 methods) with focused, testable services averaging 100-300 lines each.

### Architecture Principles
1. **Single Responsibility**: Each service handles one domain of analytics
2. **Protocol-Based Design**: Services implement typed protocols for testability
3. **Shared Context**: Common utilities in `PortfolioAnalyticsContext`
4. **Dependency Injection**: FastAPI's DI provides services with automatic lifecycle management

### Core Services

#### CanonicalSnapshotService (`src/services/canonical_snapshot_service.py`)
- **Purpose**: Single source of truth for "as-of" snapshot date selection
- **Key Method**: `get_snapshot_date(user_id, wallet_address=None)` - latest date where all wallets have snapshots
- **Use Cases**: Landing page totals, dashboard analytics, ROI alignment

#### TrendAnalysisService (`src/services/trend_analysis_service.py`)
- **Purpose**: Historical portfolio trend calculations and daily aggregations
- **Key Method**: `get_portfolio_trend(user_id, days, limit)` - Daily portfolio values with protocol/chain breakdowns
- **Use Cases**: Performance visualization, historical tracking, multi-protocol comparison
- **Routing**: Bundle requests use `portfolio_category_trend_mv`; wallet-specific requests use the runtime query

#### RiskMetricsService (`src/services/risk_metrics_service.py`)
- **Purpose**: Risk-adjusted performance metrics using financial theory
- **Key Methods**:
  - `calculate_portfolio_volatility()` - Annualized volatility from daily returns
  - `calculate_sharpe_ratio()` - Risk-adjusted return ratio
  - `calculate_max_drawdown()` - Peak-to-trough decline measurement
- **Use Cases**: Risk assessment, portfolio optimization, performance benchmarking

#### DrawdownAnalysisService (`src/services/drawdown_analysis_service.py`)
- **Purpose**: Detailed drawdown tracking and recovery analysis
- **Key Methods**:
  - `get_enhanced_drawdown_analysis()` - Daily drawdown percentages with running peaks
  - `get_underwater_recovery_analysis()` - Underwater period tracking
- **Use Cases**: Downside risk visualization, recovery pattern analysis

#### RollingAnalyticsService (`src/services/rolling_analytics_service.py`)
- **Purpose**: Rolling window financial metrics with reliability indicators
- **Key Methods**:
  - `get_rolling_sharpe_analysis()` - 30-day rolling Sharpe ratios
  - `get_rolling_volatility_analysis()` - 30-day rolling volatility
- **Use Cases**: Trend identification, metric stability analysis

#### PortfolioAggregator (`src/services/portfolio_aggregator.py`)
- **Purpose**: Cross-service data aggregation and normalization
- **Key Methods**:
  - `aggregate_categories()` - Combine category data from multiple sources
  - `aggregate_wallet_data()` - Consolidate multi-wallet portfolios
- **Use Cases**: Multi-wallet portfolios, cross-protocol aggregation

#### PoolPerformanceAggregator (`src/services/aggregators/pool_performance_aggregator.py`)
- **Purpose**: Cross-wallet pool position aggregation with weighted APR calculations
- **Architecture**: Immutable value objects + mutable accumulators pattern
- **Key Components**:
  - `PoolPositionData` - Frozen dataclass for input positions (immutable)
  - `AggregatedPoolPosition` - Accumulator for aggregation state (mutable)
  - `PoolPerformanceAggregator` - Main aggregation orchestrator
- **Key Features**:
  - Groups positions by (protocol, chain, pool_symbols) across wallets
  - Computes weighted average APRs: `sum(apr * value) / sum(value)`
  - Consolidates snapshot IDs across wallets
  - Preserves APR data from highest-value position
  - Handles Decimal types from PostgreSQL
  - Case-insensitive protocol/chain matching
  - Pool symbol order independence (sorted internally)
- **Use Cases**: Cross-wallet pool aggregation, pool performance analytics

#### YieldReturnService (`src/services/yield_return_service.py`)
- **Purpose**: Day-over-day yield return calculations for yield-generating positions
- **Protocol Support**: Hybrid approach handling multiple data sources
  - **Token-Based Protocols** (DeBank): Calculates yields from granular token amount changes
  - **USD Balance Protocols** (Hyperliquid): Direct USD balance delta calculations
- **Key Methods**:
  - `get_daily_yield_returns()` - Main entry point for daily yield calculations
  - `aggregate_snapshots()` - Protocol-aware routing to appropriate aggregation method
  - `aggregate_token_snapshots()` - Token-based protocol aggregation (Aave, Compound, etc.)
  - `aggregate_usd_balance_snapshots()` - USD balance protocol aggregation (Hyperliquid)
  - `calculate_snapshot_deltas()` - Token amount delta calculations
  - `calculate_usd_balance_deltas()` - USD balance delta calculations
- **SQL Preprocessing**: Protocol type detection and data normalization in `portfolio_snapshots_for_yield_returns.sql`
- **Use Cases**: Yield performance tracking, protocol comparison, portfolio yield visualization

#### SentimentDatabaseService (`src/services/sentiment_database_service.py`)
- **Purpose**: Database-backed market sentiment data access
- **Key Methods**:
  - `get_current_sentiment()` - Latest Fear & Greed index
  - `get_sentiment_history()` - Historical sentiment values
- **Data Source**: `alpha_raw.sentiment_snapshots` (populated by alpha-etl)
- **Use Cases**: Market regime analysis, sentiment tracking

#### RegimeTrackingService (`src/services/regime_tracking_service.py`)
- **Purpose**: Market regime classification and trend analysis
- **Key Methods**:
  - `get_regime_history()` - Regime transitions with directional context
  - `get_current_regime()` - Current market state
- **Regimes**: Extreme Fear, Fear, Neutral, Greed, Extreme Greed
- **Use Cases**: Strategy adaptation, user guidance context

#### BorrowingService (`src/services/borrowing_service.py`)
- **Purpose**: Unified borrowing analytics handling both detailed positions and risk metrics
- **Key Methods**:
  - `get_borrowing_positions(user_id)` - Detailed positions sorted by health rate
  - `calculate_borrowing_risk(...)` - Aggregated risk metrics and health status
  - `get_borrowing_summary(...)` - Summary for landing page
- **Analysis**: Calculates LTV, health rates per position, risk classification, and aggregates totals
- **Use Cases**: Detailed risk dashboard, liquidation warnings, portfolio summary

#### BacktestingService (`src/services/backtesting_service.py`)
- **Purpose**: DCA strategy comparison (Normal DCA vs Regime-based DCA)
- **Key Method**: `run_compare_v3()` - Simulates and compares historical strategy configs over a shared market window
- **Features**:
  - Compares fixed daily investment vs sentiment-based rebalancing
  - Regime-based allocations (Spot/LP/Stable) adjusting to Fear/Greed
- **Use Cases**: Strategy validation, performance projection, educational tools

### PortfolioAnalyticsContext
**Location**: `src/services/analytics_context.py`

Centralized utilities to eliminate duplication:
- Date range calculations: `calculate_date_range(days)`
- Period formatting: `build_period_info(start_date, end_date, days)`
- Financial interpretation: `interpret_sharpe_ratio()`, `interpret_volatility_level()`
- Statistical reliability: `assess_statistical_reliability()`
- Industry-standard thresholds for Sharpe ratios and volatility levels

### Dependency Injection Pattern
**Location**: `src/services/dependencies.py`

Each service has:
1. Factory function (e.g., `get_trend_analysis_service()`)
2. Type annotation (e.g., `TrendAnalysisServiceDep`)
3. Automatic dependency resolution (DB session, QueryService, AnalyticsContext)

Example endpoint:
```python
@router.get("/trends/by-user/{user_id}")
async def get_trend(
    trend_service: TrendAnalysisServiceDep,  # Auto-injected
    user_id: UUID,
    days: int = Query(30)
):
    return trend_service.get_portfolio_trend(user_id, days)
```

### Protocol-Based Design
**Location**: `src/services/interfaces.py`

Each service implements a typed `Protocol` defining its interface:
```python
class TrendAnalysisServiceProtocol(Protocol):
    def get_portfolio_trend(self, user_id: UUID, days: int = 30) -> dict[str, Any]: ...
```

**Benefits**: Loose coupling, type safety, easy testing, clear API contracts

### Canonical Snapshot + Daily View Architecture
**Data Flow (Bundle)**:
1. ETL inserts raw snapshots (`portfolio_item_snapshots`, `alpha_raw.wallet_token_snapshots`)
2. Daily MVs dedupe to latest snapshot per wallet per UTC day:
   - `public.daily_portfolio_snapshots`
   - `alpha_raw.daily_wallet_token_snapshots`
3. `portfolio_category_trend_mv` is built from daily MVs for fast bundle queries
4. `CanonicalSnapshotService` provides the consistent snapshot date used by landing + dashboard

**Data Flow (Wallet-Specific)**:
- Trend queries bypass MV and run `get_portfolio_category_trend_by_user_id` to enforce wallet filter accuracy.

### Benefits Over Previous Architecture
**Before** (Facade Pattern):
- Single 960-line file handling all analytics
- High coupling, difficult testing
- 9% protocol coverage

**After** (Specialized Services):
- 6 focused services (100-300 lines each)
- Low coupling, easy testing (95%+ coverage)
- 100% protocol coverage
- Clear separation of concerns

### Service Selection Guide
- **Historical values**: `TrendAnalysisService`
- **Risk assessment**: `RiskMetricsService` (volatility, Sharpe, drawdown)
- **Drawdown visualization**: `DrawdownAnalysisService`
- **Rolling metrics**: `RollingAnalyticsService`
- **Multi-wallet aggregation**: `PortfolioAggregator`
- **Yield calculations**: `YieldReturnService` (token-based and USD balance protocols)

### Yield Calculation Architecture (Hybrid SQL-First Approach)

The YieldReturnService uses a **SQL-first hybrid approach** for protocol-specific yield calculations:

#### SQL Preprocessing Layer
**File:** `src/queries/sql/portfolio_snapshots_for_yield_returns.sql`

The SQL query performs:
1. **Protocol Type Detection**: Classifies protocols as `token_based` (DeBank) or `usd_balance` (Hyperliquid)
2. **Data Normalization**: Extracts protocol-specific data into standardized `protocol_data` JSONB field
3. **Performance Optimization**: Single query with 80-150ms latency, 2.5MB transfer

```sql
-- Protocol type detection
CASE
    WHEN LOWER(pis.name) = 'hyperliquid' THEN 'usd_balance'
    ELSE 'token_based'
END AS protocol_type

-- Hybrid preprocessing
CASE
    WHEN protocol_type = 'usd_balance' THEN
        jsonb_build_object('usd_value', COALESCE((detail->>'hlp_balance')::numeric, 0))
    ELSE
        jsonb_build_object(
            'supply_tokens', detail->'supply_token_list',
            'borrow_tokens', detail->'borrow_token_list',
            'reward_tokens', detail->'reward_token_list'
        )
END AS protocol_data
```

#### Python Service Layer
**File:** `src/services/yield_return_service.py`

The service implements protocol-aware routing:

1. **Routing Method**: `aggregate_snapshots()` separates rows by `protocol_type`
2. **Token-Based Aggregation**: `aggregate_token_snapshots()` handles DeBank protocols
   - Processes `supply_tokens`, `borrow_tokens`, `reward_tokens` arrays
   - Aggregates by (protocol, chain, date, token_symbol)
   - Computes: `Σ(amount_delta × current_price)`
3. **USD Balance Aggregation**: `aggregate_usd_balance_snapshots()` handles Hyperliquid
   - Extracts single `usd_value` from `protocol_data`
   - Aggregates by (protocol, chain, date)
   - Computes: `current_balance - previous_balance`
4. **Delta Calculation**: Separate methods for each protocol type
5. **Unified Response**: Merges deltas into standardized `YieldReturnsResponse`

#### Extensibility: Adding New Protocol Types

**When to add new protocol type** (vs using existing types):
- Protocol provides data in significantly different format
- Current aggregation logic doesn't fit the data model
- Example: GMX vault shares, Lido staking rewards

**How to extend** (~60 lines, 1-2 hours):

1. **Update SQL** (10 lines in `portfolio_snapshots_for_yield_returns.sql`):
```sql
CASE
    WHEN LOWER(pis.name) = 'hyperliquid' THEN 'usd_balance'
    WHEN LOWER(pis.name) = 'gmx' THEN 'vault_shares'  -- New
    ELSE 'token_based'
END AS protocol_type

-- Add preprocessing case
WHEN protocol_type = 'vault_shares' THEN
    jsonb_build_object('shares', detail->>'vault_shares')
```

2. **Add Python Aggregation Method** (40 lines):
```python
@classmethod
def aggregate_vault_shares_snapshots(
    cls, user_id: UUID, rows: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    # Extract vault shares from protocol_data
    # Aggregate by (protocol, chain, date)
    # Return standardized snapshot format
```

3. **Update Routing** (5 lines in `aggregate_snapshots()`):
```python
vault_rows = [r for r in rows if r.get("protocol_type") == "vault_shares"]
vault_agg = cls.aggregate_vault_shares_snapshots(user_id, vault_rows)
```

4. **Add Tests** (50 lines):
```python
def test_aggregate_vault_shares_snapshots(): ...
def test_mixed_protocols_with_vault_shares(): ...
```

**Architectural Decision: SQL-First vs Strategy Pattern**
- **Chosen**: SQL-first hybrid (90% SQL preprocessing, 10% Python routing)
- **Rejected**: Full Strategy Pattern (over-engineering for 2-3 protocols)
- **Threshold**: Consider Strategy Pattern when 3+ protocol types with complex business rules
- **Benefits**: Simpler, faster, aligns with existing specialized service architecture

## V2 Validation Architecture

**Status**: Production-ready (Jan 2025) | **Coverage**: 87 integration tests, 1002 total tests passing

The Analytics Engine implements a **defense-in-depth** validation approach using Pydantic V2 field validators and cross-service consistency checks. All data integrity issues are caught at the API layer before persistence.

### Validation Layers

1. **Field-Level Validators** - Format, range, and uniqueness constraints
   - UUID format validation (`snapshot_id`, `protocol_id`)
   - ISO8601 date format validation (`start_date`, `end_date`, `date` fields)
   - Array uniqueness validation (`snapshot_ids`, `pool_symbols`, `protocols`)

2. **Model-Level Validators** - Cross-field mathematical consistency
   - Temporal ordering (daily_values, daily_returns must be chronological)
   - Mathematical consistency (allocation sums, percentage totals, net calculations)
   - Referential integrity (ROI recommended_period must exist in windows)
   - **Wallet Token Summary Validation**: Ensures `wallet_token_summary.total_value_usd` exactly matches the sum of category `wallet_tokens_value` fields. Both values are calculated from the **same source** (allocation categories), guaranteeing exact match by construction. The validator uses an assertion rather than a ValueError since any mismatch indicates a programming error, not a data integrity issue. This implements Option 3 from the consolidation plan - harmonizing calculation paths to eliminate floating-point rounding discrepancies between SQL and Python aggregations.

3. **Service-Level Validators** - Cross-service data consistency
   - Snapshot vs. wallet total validation (>5% threshold triggers error)
   - Business rule enforcement at service boundaries

### Integration Test Coverage

**89 integration tests** across 7 test files ensure validators work in realistic scenarios:
- `test_cross_service_consistency.py` (7 tests)
- `test_pool_performance_validation.py` (12 tests)
- `test_landing_page_validation.py` (16 tests)
- `test_trend_analysis_validation.py` (12 tests)
- `test_risk_metrics_validation.py` (16 tests)
- `test_yield_returns_validation.py` (15 tests)
- `test_all_endpoints_data_integrity.py` (11 tests)

### Key Features

- **Fail Fast**: Catches errors at API layer before persistence
- **Helpful Error Messages**: Validation errors include field name, actual value, expected constraint
- **Zero Regressions**: All existing tests pass with V2 validators
- **Minimal Performance Impact**: <15ms added latency across all validation layers

### Adding New Validators

See `.serena/memories/validation_architecture.md` for comprehensive documentation including:
- Complete validator list with locations
- Step-by-step guide for adding new validators
- Best practices and examples
- Migration guide from V1
- Performance considerations

## API Endpoints

### Portfolio Analytics
- `GET /api/v2/analytics/{user_id}/trend` - Historical trend analysis with configurable time periods
- `GET /api/v2/portfolio/{user_id}/landing` - Unified portfolio data optimized for landing page performance

### Risk Analytics
- `GET /api/v2/analytics/{user_id}/dashboard` - Unified dashboard with all risk metrics (RECOMMENDED)
- `GET /api/v2/analytics/{user_id}/risk/summary` - Lightweight risk summary (volatility, drawdown, Sharpe ratio)

**Note**: Individual risk metric endpoints have been removed in favor of the unified dashboard endpoint for better performance and maintainability. The dashboard endpoint provides all risk metrics in a single request with 12-hour caching.

### Market Data API
- `GET /api/v2/market/sentiment` - Current market sentiment from the latest snapshot (any source: alternative.me, coinmarketcap, etc.)
- `GET /api/v2/market/sentiment/history` - Historical sentiment values from all sources, ordered by timestamp
- `GET /api/v2/market/regime/history` - Market regime transition tracking
- `GET /api/v2/market/sentiment/health` - Sentiment service health status

**Note**: Sentiment endpoints query `alpha_raw.sentiment_snapshots` table and return data from all sources. The latest snapshot is determined solely by `snapshot_time DESC`, ensuring the most current market sentiment is always returned regardless of which data provider (alternative.me, coinmarketcap, etc.) collected it.

### Health & Documentation
- `GET /` and `GET /health` - Service health checks with database connectivity
- `GET /docs` - Interactive Swagger UI documentation

## Coding Style & Standards
- **Python 3.11+** with comprehensive type hints throughout
- **Ruff**: Code formatting (88-char lines, double quotes) and linting
- **MyPy**: Strict type checking with proper async typing
- **Pylint**: Duplicate code detection with 7-line minimum similarity threshold
- **Naming**: snake_case for modules/functions/vars, PascalCase for classes
- **Private Methods**: Use clear action verb prefixes (see `docs/coding_standards.md`)
- **SQL Parameters**: Always use `:snake_case` format (verified via `scripts/audit_sql_params.py`)
- **Testing**: pytest with asyncio, comprehensive fixtures, minimum 90% coverage
- **Quality Gates**: Pre-commit hooks enforce formatting, linting, type checking, and duplicate detection
- **Standards Reference**: See `docs/coding_standards.md` for comprehensive coding standards including method naming, SQL conventions, and quality gates

## Database Design
- **PostgreSQL** via Supabase with SQLAlchemy async
- **Read-only mode** enforced by configuration with write operation guards
- **Connection pooling** with health checks and connection recycling
- **Parameterized queries** prevent SQL injection vulnerabilities
- **Query registry**: SQL files loaded dynamically for maintainable query management

## Security & Configuration
- **Environment-based config**: Copy `.env.example` → `.env` with Supabase credentials
- **Read-only database**: `DATABASE_READ_ONLY=true` prevents accidental mutations
- **CORS middleware**: Configurable allowed origins for API access
- **Parameterized SQL**: All database queries use bound parameters
- **Connection security**: Proper async session management and cleanup

## Testing Strategy
- **Framework**: pytest + pytest-asyncio for comprehensive async testing
- **Database**: In-memory SQLite with realistic schema for isolated tests
- **Coverage**: HTML and terminal reporting with 90% minimum threshold
- **Fixtures**: Centralized test configuration in `tests/conftest.py`
- **Mocking**: External API dependencies mocked for reliable testing

## Development Workflow
1. **Environment Setup**: Configure `.env` with Supabase credentials
2. **Install Dependencies**: `make install` (uses uv for fast dependency resolution)
3. **Start Development**: `make dev` (FastAPI with hot reload)
4. **Quality Checks**: Pre-commit hooks automatically enforce code standards
5. **Testing**: `make test` generates coverage reports before commits
6. **API Documentation**: Available at `http://localhost:8001/docs`

## Deployment
- **Docker Support**: Multi-stage Dockerfile for production builds
- **Health Monitoring**: Database connectivity and service health endpoints
- **Configuration**: Environment-based configuration for different deployment targets
- **Database**: Supabase hosted PostgreSQL with connection pooling


## Critical Data Integrity Rules

### ⚠️ DO NOT ADD DEDUPLICATION to daily_portfolio_snapshots

**NEVER** add `ROW_NUMBER()`, `PARTITION BY id_raw`, `DISTINCT ON (id_raw)`, or any position-level deduplication to the `daily_portfolio_snapshots` materialized view.

**Why this is WRONG:**
1. DeBank's `id_raw` is **protocol-level**, NOT position-level
2. Multiple distinct positions share the same `id_raw` (e.g., superOETHb and cbBTC both have Morpho id_raw)
3. Multiple ETL pipelines (DeBank, Hyperliquid) have independent timestamps
4. All records in a batch are valid - there's NO duplicate data to remove

**Correct approach:** Keep ALL records from the latest batch per PROTOCOL per day.
See `migrations/015_simplify_daily_portfolio_snapshots.sql` for implementation.

**Regression test:** `tests/test_safeguards_deduplication.py` will FAIL if incorrect dedup is added.
