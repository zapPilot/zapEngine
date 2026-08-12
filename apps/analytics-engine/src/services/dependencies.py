"""
Service dependency injection for FastAPI endpoints.

Provides explicit dependency wiring between concrete service implementations.
"""

import logging
from typing import TYPE_CHECKING, Annotated

from fastapi import Depends
from sqlalchemy.orm import Session

from src.core.database import get_db
from src.services.aggregators.pool_performance_aggregator import (
    PoolPerformanceAggregator,
)
from src.services.analytics.analytics_context import (
    PortfolioAnalyticsContext,
)
from src.services.analytics.analytics_context import (
    get_analytics_context as _get_analytics_context_singleton,
)
from src.services.analytics.dashboard_service import DashboardService
from src.services.analytics.drawdown_analysis_service import DrawdownAnalysisService
from src.services.analytics.risk_metrics_service import RiskMetricsService
from src.services.analytics.rolling_analytics_service import RollingAnalyticsService
from src.services.analytics.trend_analysis_service import TrendAnalysisService
from src.services.market.macro_fear_greed_service import (
    MacroFearGreedDatabaseService,
)
from src.services.market.market_dashboard_service import MarketDashboardService
from src.services.market.market_sentiment_service import MarketSentimentService
from src.services.market.regime_tracking_service import RegimeTrackingService
from src.services.market.sentiment_database_service import SentimentDatabaseService
from src.services.market.stock_price_service import StockPriceService
from src.services.market.token_price_service import TokenPriceService
from src.services.portfolio.borrowing_service import BorrowingService
from src.services.portfolio.canonical_snapshot_service import CanonicalSnapshotService
from src.services.portfolio.landing_page_service import LandingPageService
from src.services.portfolio.pool_performance_service import PoolPerformanceService
from src.services.portfolio.portfolio_snapshot_service import PortfolioSnapshotService
from src.services.portfolio.roi_calculator import ROICalculator
from src.services.portfolio.wallet_service import WalletService
from src.services.shared.query_service import (
    QueryService,
)
from src.services.shared.query_service import (
    get_query_service as _get_query_service_singleton,
)
from src.services.strategy.backtesting_protocol import BacktestingServiceProtocol
from src.services.strategy.strategy_config_management_service import (
    StrategyConfigManagementService,
)
from src.services.strategy.strategy_config_store import StrategyConfigStore
from src.services.strategy.strategy_daily_suggestion_service import (
    StrategyDailySuggestionService,
)
from src.services.yield_return_service import YieldReturnService

if TYPE_CHECKING:
    from src.services.strategy.backtesting_service import BacktestingService

logger = logging.getLogger(__name__)


def get_query_service() -> QueryService:
    """Expose shared QueryService singleton for dependency injection."""
    return _get_query_service_singleton()


def get_strategy_config_store(
    db: Session = Depends(get_db),
) -> StrategyConfigStore:
    """Create StrategyConfigStore instance."""
    return StrategyConfigStore(db)


def get_strategy_config_management_service(
    strategy_config_store: StrategyConfigStore = Depends(get_strategy_config_store),
) -> StrategyConfigManagementService:
    """Create StrategyConfigManagementService instance."""
    return StrategyConfigManagementService(strategy_config_store)


def get_analytics_context() -> PortfolioAnalyticsContext:
    """Expose shared AnalyticsContext singleton for dependency injection."""
    return _get_analytics_context_singleton()


def get_canonical_snapshot_service(
    db: Session = Depends(get_db),
    query_service: QueryService = Depends(get_query_service),
) -> CanonicalSnapshotService:
    """
    Create CanonicalSnapshotService instance.

    Provides single source of truth for snapshot date selection.
    All analytics services should call this FIRST to get the canonical
    "as-of" date before querying snapshot data.
    """
    return CanonicalSnapshotService(db, query_service)


def get_wallet_service(
    query_service: QueryService = Depends(get_query_service),
) -> WalletService:
    """Create WalletService instance with query service dependency."""
    return WalletService(query_service)


def get_roi_calculator(
    query_service: QueryService = Depends(get_query_service),
) -> ROICalculator:
    """Create ROICalculator with query service dependency."""
    return ROICalculator(query_service)


def get_trend_analysis_service(
    db: Session = Depends(get_db),
    query_service: QueryService = Depends(get_query_service),
    context: PortfolioAnalyticsContext = Depends(get_analytics_context),
) -> TrendAnalysisService:
    """Create TrendAnalysisService instance with explicit wiring."""
    return TrendAnalysisService(db, query_service, context)


def get_risk_metrics_service(
    db: Session = Depends(get_db),
    query_service: QueryService = Depends(get_query_service),
    context: PortfolioAnalyticsContext = Depends(get_analytics_context),
) -> RiskMetricsService:
    """Create RiskMetricsService instance with explicit wiring."""
    return RiskMetricsService(db, query_service, context)


def get_borrowing_service(
    db: Session = Depends(get_db),
    query_service: QueryService = Depends(get_query_service),
    canonical_snapshot_service: CanonicalSnapshotService = Depends(
        get_canonical_snapshot_service
    ),
) -> BorrowingService:
    """
    Create BorrowingService instance with dependency injection.

    Unified service for all borrowing analytics (positions + risk).
    """
    return BorrowingService(db, query_service, canonical_snapshot_service)


def get_drawdown_analysis_service(
    db: Session = Depends(get_db),
    query_service: QueryService = Depends(get_query_service),
    context: PortfolioAnalyticsContext = Depends(get_analytics_context),
) -> DrawdownAnalysisService:
    """Create DrawdownAnalysisService instance with explicit wiring."""
    return DrawdownAnalysisService(db, query_service, context)


def get_rolling_analytics_service(
    db: Session = Depends(get_db),
    query_service: QueryService = Depends(get_query_service),
    context: PortfolioAnalyticsContext = Depends(get_analytics_context),
) -> RollingAnalyticsService:
    """Create RollingAnalyticsService instance with explicit wiring."""
    return RollingAnalyticsService(db, query_service, context)


def get_yield_return_service(
    db: Session = Depends(get_db),
    query_service: QueryService = Depends(get_query_service),
    context: PortfolioAnalyticsContext = Depends(get_analytics_context),
) -> YieldReturnService:
    """Create YieldReturnService instance with explicit wiring."""
    return YieldReturnService(db, query_service, context)


def get_pool_performance_aggregator() -> PoolPerformanceAggregator:
    """Create PoolPerformanceAggregator instance."""
    return PoolPerformanceAggregator()


def get_pool_performance_service(
    db: Session = Depends(get_db),
    query_service: QueryService = Depends(get_query_service),
    aggregator: PoolPerformanceAggregator = Depends(get_pool_performance_aggregator),
) -> PoolPerformanceService:
    """Create PoolPerformanceService with aggregator dependency."""
    return PoolPerformanceService(db, query_service, aggregator)


def get_portfolio_snapshot_service(
    db: Session = Depends(get_db),
    query_service: QueryService = Depends(get_query_service),
    trend_service: TrendAnalysisService = Depends(get_trend_analysis_service),
) -> PortfolioSnapshotService:
    """Create PortfolioSnapshotService dependency."""
    return PortfolioSnapshotService(db, query_service, trend_service)


def get_sentiment_database_service(
    db: Session = Depends(get_db),
    query_service: QueryService = Depends(get_query_service),
) -> SentimentDatabaseService:
    """Create SentimentDatabaseService instance for database sentiment queries."""
    return SentimentDatabaseService(db, query_service)


def get_token_price_service(
    db: Session = Depends(get_db),
    query_service: QueryService = Depends(get_query_service),
) -> TokenPriceService:
    """Create TokenPriceService instance for token historical price queries."""
    return TokenPriceService(db, query_service)


def get_market_sentiment_service(
    db_service: SentimentDatabaseService = Depends(get_sentiment_database_service),
) -> MarketSentimentService:
    """Create MarketSentimentService instance with database-first approach."""
    from src.core.config import settings

    return MarketSentimentService(
        db_service=db_service,
        use_database=settings.use_sentiment_database,
    )


def get_regime_tracking_service(
    db: Session = Depends(get_db),
    query_service: QueryService = Depends(get_query_service),
) -> RegimeTrackingService:
    """Create RegimeTrackingService instance for regime transition tracking."""
    return RegimeTrackingService(db, query_service)


def get_stock_price_service(
    db: Session = Depends(get_db),
    query_service: QueryService = Depends(get_query_service),
) -> StockPriceService:
    """Create StockPriceService instance for SPY price data."""
    return StockPriceService(db, query_service)


def get_macro_fear_greed_database_service(
    db: Session = Depends(get_db),
    query_service: QueryService = Depends(get_query_service),
) -> MacroFearGreedDatabaseService:
    """Create read-only MacroFearGreedDatabaseService dependency."""
    return MacroFearGreedDatabaseService(db, query_service)


def get_market_dashboard_service(
    token_price_service: TokenPriceService = Depends(get_token_price_service),
    sentiment_service: SentimentDatabaseService = Depends(
        get_sentiment_database_service
    ),
    stock_price_service: StockPriceService = Depends(get_stock_price_service),
    macro_fear_greed_service: MacroFearGreedDatabaseService = Depends(
        get_macro_fear_greed_database_service
    ),
) -> MarketDashboardService:
    """Create MarketDashboardService instance for aggregated market data."""
    return MarketDashboardService(
        token_price_service,
        sentiment_service,
        stock_price_service,
        macro_fear_greed_service,
    )


def build_backtesting_service(
    db: Session,
    *,
    token_price_service: TokenPriceService | None = None,
    sentiment_service: SentimentDatabaseService | None = None,
    stock_price_service: StockPriceService | None = None,
    macro_fear_greed_service: MacroFearGreedDatabaseService | None = None,
) -> "BacktestingService":
    """Assemble a BacktestingService — the single construction point.

    FastAPI's :func:`get_backtesting_service` passes its Depends-injected
    sub-services in; non-FastAPI callers (attribution scripts, Optuna search)
    pass nothing and get a fresh stack built directly from ``db`` and the shared
    QueryService.
    """
    from src.services.strategy.backtesting_service import BacktestingService

    query_service = get_query_service()
    return BacktestingService(  # pragma: no cover
        db,
        token_price_service or TokenPriceService(db, query_service),
        sentiment_service or SentimentDatabaseService(db, query_service),
        strategy_config_store=StrategyConfigStore(db),
        stock_price_service=stock_price_service or StockPriceService(db, query_service),
        macro_fear_greed_service=macro_fear_greed_service
        or MacroFearGreedDatabaseService(db, query_service),
    )


# jscpd:ignore-start
# Reason: FastAPI dependency providers repeat DI signatures for explicit wiring.
def get_backtesting_service(
    db: Session = Depends(get_db),
    token_price_service: TokenPriceService = Depends(get_token_price_service),
    sentiment_service: SentimentDatabaseService = Depends(
        get_sentiment_database_service
    ),
    stock_price_service: StockPriceService = Depends(get_stock_price_service),
    macro_fear_greed_service: MacroFearGreedDatabaseService = Depends(
        get_macro_fear_greed_database_service
    ),
) -> BacktestingServiceProtocol:
    """Create BacktestingService instance for DCA strategy comparison."""
    return build_backtesting_service(  # pragma: no cover
        db,
        token_price_service=token_price_service,
        sentiment_service=sentiment_service,
        stock_price_service=stock_price_service,
        macro_fear_greed_service=macro_fear_greed_service,
    )


# jscpd:ignore-end


def get_landing_page_service(
    db: Session = Depends(get_db),
    wallet_service: WalletService = Depends(get_wallet_service),
    query_service: QueryService = Depends(get_query_service),
    roi_calculator: ROICalculator = Depends(get_roi_calculator),
    portfolio_snapshot_service: PortfolioSnapshotService = Depends(
        get_portfolio_snapshot_service
    ),
    pool_performance_service: PoolPerformanceService = Depends(
        get_pool_performance_service
    ),
    canonical_snapshot_service: CanonicalSnapshotService = Depends(
        get_canonical_snapshot_service
    ),
    borrowing_service: BorrowingService = Depends(get_borrowing_service),
) -> LandingPageService:
    """Create LandingPageService with canonical snapshot consistency and borrowing risk."""
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
    trend_service: TrendAnalysisService = Depends(get_trend_analysis_service),
    risk_service: RiskMetricsService = Depends(get_risk_metrics_service),
    drawdown_service: DrawdownAnalysisService = Depends(get_drawdown_analysis_service),
    rolling_service: RollingAnalyticsService = Depends(get_rolling_analytics_service),
    canonical_snapshot_service: CanonicalSnapshotService = Depends(
        get_canonical_snapshot_service
    ),
) -> DashboardService:
    """Create DashboardService aggregating all analytics services with canonical snapshot consistency."""
    return DashboardService(
        trend_service=trend_service,
        risk_service=risk_service,
        drawdown_service=drawdown_service,
        rolling_service=rolling_service,
        canonical_snapshot_service=canonical_snapshot_service,
    )


# Foundational service dependencies
CanonicalSnapshotServiceDep = Annotated[
    CanonicalSnapshotService, Depends(get_canonical_snapshot_service)
]

# Specialized analytics service dependencies
TrendAnalysisServiceDep = Annotated[
    TrendAnalysisService, Depends(get_trend_analysis_service)
]
RiskMetricsServiceDep = Annotated[
    RiskMetricsService, Depends(get_risk_metrics_service)
]  # Used by DashboardService
DrawdownAnalysisServiceDep = Annotated[
    DrawdownAnalysisService, Depends(get_drawdown_analysis_service)
]  # Used by DashboardService
RollingAnalyticsServiceDep = Annotated[
    RollingAnalyticsService, Depends(get_rolling_analytics_service)
]  # Used by DashboardService
YieldReturnServiceDep = Annotated[YieldReturnService, Depends(get_yield_return_service)]
PortfolioSnapshotServiceDep = Annotated[
    PortfolioSnapshotService, Depends(get_portfolio_snapshot_service)
]
MarketSentimentServiceDep = Annotated[
    MarketSentimentService, Depends(get_market_sentiment_service)
]
TokenPriceServiceDep = Annotated[TokenPriceService, Depends(get_token_price_service)]
DashboardServiceDep = Annotated[DashboardService, Depends(get_dashboard_service)]
RegimeTrackingServiceDep = Annotated[
    RegimeTrackingService, Depends(get_regime_tracking_service)
]
BorrowingServiceDep = Annotated[BorrowingService, Depends(get_borrowing_service)]
MarketDashboardServiceDep = Annotated[
    MarketDashboardService, Depends(get_market_dashboard_service)
]
BacktestingServiceDep = Annotated[
    BacktestingServiceProtocol, Depends(get_backtesting_service)
]


def get_strategy_daily_suggestion_service(
    db: Session = Depends(get_db),
    landing_page_service: LandingPageService = Depends(get_landing_page_service),
    regime_tracking_service: RegimeTrackingService = Depends(
        get_regime_tracking_service
    ),
    sentiment_service: SentimentDatabaseService = Depends(
        get_sentiment_database_service
    ),
    token_price_service: TokenPriceService = Depends(get_token_price_service),
    canonical_snapshot_service: CanonicalSnapshotService = Depends(
        get_canonical_snapshot_service
    ),
    stock_price_service: StockPriceService = Depends(get_stock_price_service),
    macro_fear_greed_service: MacroFearGreedDatabaseService = Depends(
        get_macro_fear_greed_database_service
    ),
) -> StrategyDailySuggestionService:
    """Create StrategyDailySuggestionService with dependency injection."""
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
    StrategyDailySuggestionService,
    Depends(get_strategy_daily_suggestion_service),
]
StrategyConfigManagementServiceDep = Annotated[
    StrategyConfigManagementService,
    Depends(get_strategy_config_management_service),
]
