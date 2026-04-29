"""
Service Interface Definitions

Defines abstract base classes (protocols) for all services to enable better
testing, dependency injection, and loose coupling.
"""

from .analytics import (
    DrawdownAnalysisServiceProtocol,
    RiskMetricsServiceProtocol,
    ROICalculatorProtocol,
    RollingAnalyticsServiceProtocol,
    TrendAnalysisServiceProtocol,
    YieldReturnServiceProtocol,
)
from .backtesting import BacktestingServiceProtocol
from .base import QueryServiceProtocol
from .borrowing import BorrowingServiceProtocol
from .market import (
    MacroFearGreedDatabaseServiceProtocol,
    MarketDashboardServiceProtocol,
    MarketSentimentServiceProtocol,
    RegimeTrackingServiceProtocol,
    SentimentDatabaseServiceProtocol,
    StockPriceServiceProtocol,
    TokenPriceServiceProtocol,
)
from .portfolio import (
    DashboardServiceProtocol,
    LandingPageServiceProtocol,
    PoolPerformanceAggregatorProtocol,
    PoolPerformanceServiceProtocol,
    PortfolioAggregatorProtocol,
    PortfolioResponseBuilderProtocol,
)
from .snapshot import (
    CanonicalSnapshotServiceProtocol,
    PortfolioSnapshotServiceProtocol,
)
from .strategy import (
    StrategyConfigManagementServiceProtocol,
    StrategyDailySuggestionServiceProtocol,
    StrategyTradeHistoryStoreProtocol,
)
from .types import (
    PortfolioROIComputed,
    RecommendedROIPeriod,
    ROIWindowData,
)
from .wallet import (
    WalletServiceProtocol,
)

__all__ = [
    "BacktestingServiceProtocol",
    "BorrowingServiceProtocol",
    "CanonicalSnapshotServiceProtocol",
    "DashboardServiceProtocol",
    "DrawdownAnalysisServiceProtocol",
    "LandingPageServiceProtocol",
    "MarketSentimentServiceProtocol",
    "PoolPerformanceAggregatorProtocol",
    "PoolPerformanceServiceProtocol",
    "PortfolioAggregatorProtocol",
    "PortfolioROIComputed",
    "PortfolioResponseBuilderProtocol",
    "PortfolioSnapshotServiceProtocol",
    "QueryServiceProtocol",
    "ROIWindowData",
    "RecommendedROIPeriod",
    "ROICalculatorProtocol",
    "RegimeTrackingServiceProtocol",
    "RiskMetricsServiceProtocol",
    "RollingAnalyticsServiceProtocol",
    "SentimentDatabaseServiceProtocol",
    "TokenPriceServiceProtocol",
    "TrendAnalysisServiceProtocol",
    "WalletServiceProtocol",
    "YieldReturnServiceProtocol",
    "StrategyDailySuggestionServiceProtocol",
    "StrategyConfigManagementServiceProtocol",
    "StrategyTradeHistoryStoreProtocol",
    "MarketDashboardServiceProtocol",
    "StockPriceServiceProtocol",
    "MacroFearGreedDatabaseServiceProtocol",
]
