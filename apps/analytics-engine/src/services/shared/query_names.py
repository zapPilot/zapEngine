"""Central registry for SQL query identifiers used across services.

Keeping these in one place prevents typos and simplifies refactors when
SQL filenames or query loader keys change.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class QueryNames:
    """Canonical SQL query identifiers loaded by ``QueryService``."""

    # Category trend queries with conditional routing:
    # - MV: Fast path for bundle queries (all wallets) - 5-15ms
    # - BY_USER_ID: Accurate path for wallet-specific queries - 150-250ms
    PORTFOLIO_CATEGORY_TREND_MV: str = "get_portfolio_category_trend_from_mv"
    PORTFOLIO_CATEGORY_TREND_BY_USER_ID: str = "get_portfolio_category_trend_by_user_id"

    PORTFOLIO_YIELD_SNAPSHOTS: str = "portfolio_snapshots_for_yield_returns"

    # Token Price Queries
    TOKEN_PRICE_HISTORY: str = "get_token_price_history"
    TOKEN_PRICE_DMA_HISTORY: str = "get_token_price_dma_history"
    TOKEN_PAIR_RATIO_DMA_HISTORY: str = "get_token_pair_ratio_dma_history"
    TOKEN_LATEST_PRICE: str = "get_latest_token_price"
    TOKEN_PRICE_BY_DATE: str = "get_token_price_by_date"
    TOKEN_SNAPSHOT_COUNT: str = "get_token_snapshot_count"

    # Stock Price Queries (S&P500)
    STOCK_PRICE_DMA_HISTORY: str = "get_stock_price_dma_history"

    # Sentiment Queries
    SENTIMENT_CURRENT: str = "get_current_sentiment"
    SENTIMENT_HISTORY: str = "get_sentiment_history"
    SENTIMENT_AT_TIME: str = "get_sentiment_at_time"
    SENTIMENT_DAILY_AGGREGATES: str = "get_daily_sentiment_aggregates"

    # Macro Fear & Greed Queries (CNN US equity FGI)
    MACRO_FEAR_GREED_CURRENT: str = "get_current_macro_fear_greed"
    MACRO_FEAR_GREED_DAILY: str = "get_daily_macro_fear_greed"

    # Regime Queries
    REGIME_HISTORY: str = "get_regime_history"

    # Portfolio Analytics Queries
    BORROWING_POSITIONS_BY_USER: str = "get_borrowing_positions_by_user"
    POOL_PERFORMANCE_BY_USER: str = "get_pool_performance_by_user"
    PORTFOLIO_DAILY_RETURNS: str = "get_portfolio_daily_returns"
    PORTFOLIO_DRAWDOWN_UNIFIED: str = "get_portfolio_drawdown_unified"
    PORTFOLIO_ROLLING_METRICS: str = "get_portfolio_rolling_metrics"
    USER_WALLETS: str = "get_user_wallets"
    WALLET_TOKEN_CATEGORIES: str = "get_wallet_token_categories"
    WALLET_TOKEN_CATEGORIES_BATCH: str = "get_wallet_token_categories_batch"

    # Canonical Snapshot Queries
    CANONICAL_SNAPSHOT_DATE: str = "get_canonical_snapshot_date"


# Convenience singleton for import ergonomics
QUERY_NAMES = QueryNames()
