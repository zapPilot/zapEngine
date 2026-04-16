"""
Pydantic models for API request/response validation.
"""

from .analytics_responses import (
    AllocationTimeseriesResponse,
    CategoryAllocationDataPoint,
    DailyTrendDataPoint,
    DrawdownDataPoint,
    EnhancedDrawdownAnalysisResponse,
    MaxDrawdownResponse,
    PeriodInfo,
    PortfolioTrendResponse,
    PortfolioVolatilityResponse,
    RollingSharpeAnalysisResponse,
    RollingSharpeDataPoint,
    RollingVolatilityAnalysisResponse,
    RollingVolatilityDataPoint,
    SharpeRatioResponse,
    UnderwaterPeriod,
    UnderwaterRecoveryAnalysisResponse,
)
from .portfolio import (
    CategoryAllocation,
    CategorySummaryDebt,
    PortfolioAllocation,
    PortfolioResponse,
    PortfolioROI,
    WalletTokenSummary,
)

__all__ = [
    # Portfolio models
    "CategoryAllocation",
    "CategorySummaryDebt",
    "PortfolioROI",
    "PortfolioAllocation",
    "PortfolioResponse",
    "WalletTokenSummary",
    # Analytics response models
    "PeriodInfo",
    "PortfolioVolatilityResponse",
    "SharpeRatioResponse",
    "MaxDrawdownResponse",
    "DailyTrendDataPoint",
    "PortfolioTrendResponse",
    "CategoryAllocationDataPoint",
    "AllocationTimeseriesResponse",
    "DrawdownDataPoint",
    "EnhancedDrawdownAnalysisResponse",
    "UnderwaterPeriod",
    "UnderwaterRecoveryAnalysisResponse",
    "RollingSharpeDataPoint",
    "RollingSharpeAnalysisResponse",
    "RollingVolatilityDataPoint",
    "RollingVolatilityAnalysisResponse",
]
