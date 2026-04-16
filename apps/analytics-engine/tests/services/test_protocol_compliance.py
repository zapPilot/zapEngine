from src.services.analytics.trend_analysis_service import TrendAnalysisService
from src.services.interfaces import (
    PoolPerformanceServiceProtocol,
    ROICalculatorProtocol,
    TrendAnalysisServiceProtocol,
    YieldReturnServiceProtocol,
)
from src.services.portfolio.pool_performance_service import PoolPerformanceService
from src.services.portfolio.roi_calculator import ROICalculator
from src.services.yield_return_service import YieldReturnService


def test_pool_performance_service_implements_protocol():
    """Verify PoolPerformanceService implements PoolPerformanceServiceProtocol."""
    # Check explicit inheritance
    assert PoolPerformanceServiceProtocol in PoolPerformanceService.__mro__
    # Check method existence
    assert hasattr(PoolPerformanceService, "get_pool_performance")


def test_roi_calculator_implements_protocol():
    """Verify ROICalculator implements ROICalculatorProtocol."""
    assert ROICalculatorProtocol in ROICalculator.__mro__
    assert hasattr(ROICalculator, "compute_portfolio_roi")


def test_trend_analysis_service_implements_protocol():
    """Verify TrendAnalysisService implements TrendAnalysisServiceProtocol."""
    assert TrendAnalysisServiceProtocol in TrendAnalysisService.__mro__
    assert hasattr(TrendAnalysisService, "get_portfolio_trend")


def test_yield_return_service_implements_protocol():
    """Verify YieldReturnService implements YieldReturnServiceProtocol."""
    assert YieldReturnServiceProtocol in YieldReturnService.__mro__
    assert hasattr(YieldReturnService, "get_daily_yield_returns")
