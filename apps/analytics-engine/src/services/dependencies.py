"""
Service dependency injection for FastAPI endpoints.

Provides explicit dependency wiring with interface-based design and reduced
coupling between services.
"""

import logging
from typing import Annotated, cast

from fastapi import Depends
from sqlalchemy.orm import Session

from src.core.database import get_db
from src.services.analytics.analytics_context import (
    PortfolioAnalyticsContext,
)
from src.services.analytics.analytics_context import (
    get_analytics_context as _get_analytics_context_singleton,
)
from src.services.interfaces import (
    BacktestingServiceProtocol,
    BorrowingServiceProtocol,
    CanonicalSnapshotServiceProtocol,
    DashboardServiceProtocol,
    DrawdownAnalysisServiceProtocol,
    LandingPageServiceProtocol,
    MacroFearGreedDatabaseServiceProtocol,
    MarketDashboardServiceProtocol,
    MarketSentimentServiceProtocol,
    PoolPerformanceAggregatorProtocol,
    PoolPerformanceServiceProtocol,
    PortfolioSnapshotServiceProtocol,
    QueryServiceProtocol,
    RegimeTrackingServiceProtocol,
    RiskMetricsServiceProtocol,
    ROICalculatorProtocol,
    RollingAnalyticsServiceProtocol,
    SentimentDatabaseServiceProtocol,
    StockPriceServiceProtocol,
    StrategyConfigManagementServiceProtocol,
    StrategyDailySuggestionServiceProtocol,
    TokenPriceServiceProtocol,
    TrendAnalysisServiceProtocol,
    WalletServiceProtocol,
    YieldReturnServiceProtocol,
)
from src.services.shared.query_service import (
    get_query_service as _get_query_service_singleton,
)
from src.services.strategy.strategy_config_store import StrategyConfigStore

logger = logging.getLogger(__name__)


def get_query_service() -> QueryServiceProtocol:
    """Expose shared QueryService singleton for dependency injection."""
    return _get_query_service_singleton()


def get_strategy_config_store(
    db: Session = Depends(get_db),
) -> StrategyConfigStore:
    """Create StrategyConfigStore instance."""
    return StrategyConfigStore(db)


def get_strategy_config_management_service(
    strategy_config_store: StrategyConfigStore = Depends(get_strategy_config_store),
) -> StrategyConfigManagementServiceProtocol:
    """Create StrategyConfigManagementService instance."""
    from src.services.strategy.strategy_config_management_service import (
        StrategyConfigManagementService,
    )

    return StrategyConfigManagementService(strategy_config_store)


def get_analytics_context() -> PortfolioAnalyticsContext:
    """Expose shared AnalyticsContext singleton for dependency injection."""
    return _get_analytics_context_singleton()


def get_canonical_snapshot_service(
    db: Session = Depends(get_db),
    query_service: QueryServiceProtocol = Depends(get_query_service),
) -> CanonicalSnapshotServiceProtocol:
    """
    Create CanonicalSnapshotService instance.

    Provides single source of truth for snapshot date selection.
    All analytics services should call this FIRST to get the canonical
    "as-of" date before querying snapshot data.
    """
    from src.services.portfolio.canonical_snapshot_service import (
        CanonicalSnapshotService,
    )

    return CanonicalSnapshotService(db, query_service)


def get_wallet_service(
    query_service: QueryServiceProtocol = Depends(get_query_service),
) -> WalletServiceProtocol:
    """Create WalletService instance with query service dependency."""
    from src.services.portfolio.wallet_service import WalletService

    return WalletService(query_service)


def get_roi_calculator(
    query_service: QueryServiceProtocol = Depends(get_query_service),
) -> ROICalculatorProtocol:
    """Create ROICalculator with query service dependency."""
    from src.services.portfolio.roi_calculator import ROICalculator

    return ROICalculator(query_service)


def get_trend_analysis_service(
    db: Session = Depends(get_db),
    query_service: QueryServiceProtocol = Depends(get_query_service),
    context: PortfolioAnalyticsContext = Depends(get_analytics_context),
) -> TrendAnalysisServiceProtocol:
    """Create TrendAnalysisService instance with explicit wiring."""
    from src.services.analytics.trend_analysis_service import TrendAnalysisService

    return TrendAnalysisService(db, query_service, context)


def get_risk_metrics_service(
    db: Session = Depends(get_db),
    query_service: QueryServiceProtocol = Depends(get_query_service),
    context: PortfolioAnalyticsContext = Depends(get_analytics_context),
) -> RiskMetricsServiceProtocol:
    """Create RiskMetricsService instance with explicit wiring."""
    from src.services.analytics.risk_metrics_service import RiskMetricsService

    return RiskMetricsService(db, query_service, context)


def get_borrowing_service(
    db: Session = Depends(get_db),
    query_service: QueryServiceProtocol = Depends(get_query_service),
    canonical_snapshot_service: CanonicalSnapshotServiceProtocol = Depends(
        get_canonical_snapshot_service
    ),
) -> BorrowingServiceProtocol:
    """
    Create BorrowingService instance with dependency injection.

    Unified service for all borrowing analytics (positions + risk).
    """
    from src.services.portfolio.borrowing_service import BorrowingService

    return BorrowingService(db, query_service, canonical_snapshot_service)


def get_drawdown_analysis_service(
    db: Session = Depends(get_db),
    query_service: QueryServiceProtocol = Depends(get_query_service),
    context: PortfolioAnalyticsContext = Depends(get_analytics_context),
) -> DrawdownAnalysisServiceProtocol:
    """Create DrawdownAnalysisService instance with explicit wiring."""
    from src.services.analytics.drawdown_analysis_service import DrawdownAnalysisService

    return cast(
        DrawdownAnalysisServiceProtocol,
        DrawdownAnalysisService(db, query_service, context),
    )


def get_rolling_analytics_service(
    db: Session = Depends(get_db),
    query_service: QueryServiceProtocol = Depends(get_query_service),
    context: PortfolioAnalyticsContext = Depends(get_analytics_context),
) -> RollingAnalyticsServiceProtocol:
    """Create RollingAnalyticsService instance with explicit wiring."""
    from src.services.analytics.rolling_analytics_service import (
        RollingAnalyticsService,
    )

    return cast(
        RollingAnalyticsServiceProtocol,
        RollingAnalyticsService(db, query_service, context),
    )


def get_yield_return_service(
    db: Session = Depends(get_db),
    query_service: QueryServiceProtocol = Depends(get_query_service),
    context: PortfolioAnalyticsContext = Depends(get_analytics_context),
) -> YieldReturnServiceProtocol:
    """Create YieldReturnService instance with explicit wiring."""
    from src.services.yield_return_service import YieldReturnService

    return YieldReturnService(db, query_service, context)


def get_pool_performance_aggregator() -> PoolPerformanceAggregatorProtocol:
    """Create PoolPerformanceAggregator instance."""
    from src.services.aggregators.pool_performance_aggregator import (
        PoolPerformanceAggregator,
    )

    return PoolPerformanceAggregator()


def get_pool_performance_service(
    db: Session = Depends(get_db),
    query_service: QueryServiceProtocol = Depends(get_query_service),
    aggregator: PoolPerformanceAggregatorProtocol = Depends(
        get_pool_performance_aggregator
    ),
) -> PoolPerformanceServiceProtocol:
    """Create PoolPerformanceService with aggregator dependency."""
    from src.services.portfolio.pool_performance_service import PoolPerformanceService

    return PoolPerformanceService(db, query_service, aggregator)


def get_portfolio_snapshot_service(
    db: Session = Depends(get_db),
    query_service: QueryServiceProtocol = Depends(get_query_service),
    trend_service: TrendAnalysisServiceProtocol = Depends(get_trend_analysis_service),
) -> PortfolioSnapshotServiceProtocol:
    """Create PortfolioSnapshotService dependency."""
    from src.services.portfolio.portfolio_snapshot_service import (
        PortfolioSnapshotService,
    )

    return PortfolioSnapshotService(db, query_service, trend_service)


def get_sentiment_database_service(
    db: Session = Depends(get_db),
    query_service: QueryServiceProtocol = Depends(get_query_service),
) -> SentimentDatabaseServiceProtocol:
    """Create SentimentDatabaseService instance for database sentiment queries."""
    from src.services.market.sentiment_database_service import SentimentDatabaseService

    return SentimentDatabaseService(db, query_service)


def get_token_price_service(
    db: Session = Depends(get_db),
    query_service: QueryServiceProtocol = Depends(get_query_service),
) -> TokenPriceServiceProtocol:
    """Create TokenPriceService instance for token historical price queries."""
    from src.services.market.token_price_service import TokenPriceService

    return TokenPriceService(db, query_service)


def get_market_sentiment_service(
    db_service: SentimentDatabaseServiceProtocol = Depends(
        get_sentiment_database_service
    ),
) -> MarketSentimentServiceProtocol:
    """Create MarketSentimentService instance with database-first approach."""
    from src.core.config import settings
    from src.services.market.market_sentiment_service import MarketSentimentService

    return MarketSentimentService(
        db_service=db_service,
        use_database=settings.use_sentiment_database,
    )


def get_regime_tracking_service(
    db: Session = Depends(get_db),
    query_service: QueryServiceProtocol = Depends(get_query_service),
) -> RegimeTrackingServiceProtocol:
    """Create RegimeTrackingService instance for regime transition tracking."""
    from src.services.market.regime_tracking_service import RegimeTrackingService

    return RegimeTrackingService(db, query_service)


def get_stock_price_service(
    db: Session = Depends(get_db),
    query_service: QueryServiceProtocol = Depends(get_query_service),
) -> StockPriceServiceProtocol:
    """Create StockPriceService instance for SPY price data."""
    from src.services.market.stock_price_service import StockPriceService

    return StockPriceService(db, query_service)


def get_macro_fear_greed_database_service(
    db: Session = Depends(get_db),
    query_service: QueryServiceProtocol = Depends(get_query_service),
) -> MacroFearGreedDatabaseServiceProtocol:
    """Create read-only MacroFearGreedDatabaseService dependency."""
    from src.services.market.macro_fear_greed_service import (
        MacroFearGreedDatabaseService,
    )

    return MacroFearGreedDatabaseService(db, query_service)


def get_market_dashboard_service(
    token_price_service: TokenPriceServiceProtocol = Depends(get_token_price_service),
    sentiment_service: SentimentDatabaseServiceProtocol = Depends(
        get_sentiment_database_service
    ),
    stock_price_service: StockPriceServiceProtocol = Depends(get_stock_price_service),
    macro_fear_greed_service: MacroFearGreedDatabaseServiceProtocol = Depends(
        get_macro_fear_greed_database_service
    ),
) -> MarketDashboardServiceProtocol:
    """Create MarketDashboardService instance for aggregated market data."""
    from src.services.market.market_dashboard_service import MarketDashboardService

    return MarketDashboardService(
        token_price_service,
        sentiment_service,
        stock_price_service,
        macro_fear_greed_service,
    )


def get_backtesting_service(
    db: Session = Depends(get_db),
    token_price_service: TokenPriceServiceProtocol = Depends(get_token_price_service),
    sentiment_service: SentimentDatabaseServiceProtocol = Depends(
        get_sentiment_database_service
    ),
    stock_price_service: StockPriceServiceProtocol = Depends(get_stock_price_service),
    macro_fear_greed_service: MacroFearGreedDatabaseServiceProtocol = Depends(
        get_macro_fear_greed_database_service
    ),
) -> BacktestingServiceProtocol:
    """Create BacktestingService instance for DCA strategy comparison."""
    from src.services.strategy.backtesting_service import (
        BacktestingService,  # pragma: no cover
    )
    from src.services.strategy.strategy_config_store import StrategyConfigStore

    return BacktestingService(
        db,
        token_price_service,
        sentiment_service,
        strategy_config_store=StrategyConfigStore(db),
        stock_price_service=stock_price_service,
        macro_fear_greed_service=macro_fear_greed_service,
    )  # pragma: no cover


def get_landing_page_service(
    db: Session = Depends(get_db),
    wallet_service: WalletServiceProtocol = Depends(get_wallet_service),
    query_service: QueryServiceProtocol = Depends(get_query_service),
    roi_calculator: ROICalculatorProtocol = Depends(get_roi_calculator),
    portfolio_snapshot_service: PortfolioSnapshotServiceProtocol = Depends(
        get_portfolio_snapshot_service
    ),
    pool_performance_service: PoolPerformanceServiceProtocol = Depends(
        get_pool_performance_service
    ),
    canonical_snapshot_service: CanonicalSnapshotServiceProtocol = Depends(
        get_canonical_snapshot_service
    ),
    borrowing_service: BorrowingServiceProtocol = Depends(get_borrowing_service),
) -> LandingPageServiceProtocol:
    """Create LandingPageService with canonical snapshot consistency and borrowing risk."""
    from src.services.portfolio.landing_page_service import LandingPageService

    return LandingPageService(
        db=db,
        wallet_service=wallet_service,
        query_service=query_service,
        roi_calculator=roi_calculator,
        portfolio_snapshot_service=portfolio_snapshot_service,
        pool_performance_service=pool_performance_service,
        canonical_snapshot_service=canonical_snapshot_service,
        borrowing_service=borrowing_service,
    )


def get_dashboard_service(
    trend_service: TrendAnalysisServiceProtocol = Depends(get_trend_analysis_service),
    risk_service: RiskMetricsServiceProtocol = Depends(get_risk_metrics_service),
    drawdown_service: DrawdownAnalysisServiceProtocol = Depends(
        get_drawdown_analysis_service
    ),
    rolling_service: RollingAnalyticsServiceProtocol = Depends(
        get_rolling_analytics_service
    ),
    canonical_snapshot_service: CanonicalSnapshotServiceProtocol = Depends(
        get_canonical_snapshot_service
    ),
) -> DashboardServiceProtocol:
    """Create DashboardService aggregating all analytics services with canonical snapshot consistency."""
    from src.services.analytics.dashboard_service import DashboardService

    return DashboardService(
        trend_service=trend_service,
        risk_service=risk_service,
        drawdown_service=drawdown_service,
        rolling_service=rolling_service,
        canonical_snapshot_service=canonical_snapshot_service,
    )


# Foundational service dependencies
CanonicalSnapshotServiceDep = Annotated[
    CanonicalSnapshotServiceProtocol, Depends(get_canonical_snapshot_service)
]

# Specialized analytics service dependencies
TrendAnalysisServiceDep = Annotated[
    TrendAnalysisServiceProtocol, Depends(get_trend_analysis_service)
]
RiskMetricsServiceDep = Annotated[
    RiskMetricsServiceProtocol, Depends(get_risk_metrics_service)
]  # Used by DashboardService
DrawdownAnalysisServiceDep = Annotated[
    DrawdownAnalysisServiceProtocol, Depends(get_drawdown_analysis_service)
]  # Used by DashboardService
RollingAnalyticsServiceDep = Annotated[
    RollingAnalyticsServiceProtocol, Depends(get_rolling_analytics_service)
]  # Used by DashboardService
YieldReturnServiceDep = Annotated[
    YieldReturnServiceProtocol, Depends(get_yield_return_service)
]
PoolPerformanceServiceDep = Annotated[
    PoolPerformanceServiceProtocol, Depends(get_pool_performance_service)
]
PortfolioSnapshotServiceDep = Annotated[
    PortfolioSnapshotServiceProtocol, Depends(get_portfolio_snapshot_service)
]
MarketSentimentServiceDep = Annotated[
    MarketSentimentServiceProtocol, Depends(get_market_sentiment_service)
]
SentimentDatabaseServiceDep = Annotated[
    SentimentDatabaseServiceProtocol, Depends(get_sentiment_database_service)
]
TokenPriceServiceDep = Annotated[
    TokenPriceServiceProtocol, Depends(get_token_price_service)
]
DashboardServiceDep = Annotated[
    DashboardServiceProtocol, Depends(get_dashboard_service)
]
RegimeTrackingServiceDep = Annotated[
    RegimeTrackingServiceProtocol, Depends(get_regime_tracking_service)
]
BorrowingServiceDep = Annotated[
    BorrowingServiceProtocol, Depends(get_borrowing_service)
]
MarketDashboardServiceDep = Annotated[
    MarketDashboardServiceProtocol, Depends(get_market_dashboard_service)
]
BacktestingServiceDep = Annotated[
    BacktestingServiceProtocol, Depends(get_backtesting_service)
]


def get_strategy_daily_suggestion_service(
    db: Session = Depends(get_db),
    landing_page_service: LandingPageServiceProtocol = Depends(
        get_landing_page_service
    ),
    regime_tracking_service: RegimeTrackingServiceProtocol = Depends(
        get_regime_tracking_service
    ),
    sentiment_service: SentimentDatabaseServiceProtocol = Depends(
        get_sentiment_database_service
    ),
    token_price_service: TokenPriceServiceProtocol = Depends(get_token_price_service),
    canonical_snapshot_service: CanonicalSnapshotServiceProtocol = Depends(
        get_canonical_snapshot_service
    ),
    stock_price_service: StockPriceServiceProtocol = Depends(get_stock_price_service),
    macro_fear_greed_service: MacroFearGreedDatabaseServiceProtocol = Depends(
        get_macro_fear_greed_database_service
    ),
) -> StrategyDailySuggestionServiceProtocol:
    """Create StrategyDailySuggestionService with dependency injection."""
    from src.services.strategy.strategy_config_store import StrategyConfigStore
    from src.services.strategy.strategy_daily_suggestion_service import (
        StrategyDailySuggestionService,
    )
    from src.services.strategy.strategy_trade_history_store import (
        StrategyTradeHistoryStore,
    )

    return StrategyDailySuggestionService(
        landing_page_service=landing_page_service,
        regime_tracking_service=regime_tracking_service,
        sentiment_service=sentiment_service,
        token_price_service=token_price_service,
        canonical_snapshot_service=canonical_snapshot_service,
        strategy_config_store=StrategyConfigStore(db),
        trade_history_store=StrategyTradeHistoryStore(db),
        stock_price_service=stock_price_service,
        macro_fear_greed_service=macro_fear_greed_service,
    )


StrategyDailySuggestionServiceDep = Annotated[
    StrategyDailySuggestionServiceProtocol,
    Depends(get_strategy_daily_suggestion_service),
]
StrategyConfigManagementServiceDep = Annotated[
    StrategyConfigManagementServiceProtocol,
    Depends(get_strategy_config_management_service),
]
