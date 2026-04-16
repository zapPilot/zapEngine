"""Simple tests for dependency helper constructors."""

from unittest.mock import Mock

from src.services.dependencies import (
    get_analytics_context,
    get_drawdown_analysis_service,
    get_query_service,
    get_risk_metrics_service,
    get_roi_calculator,
    get_rolling_analytics_service,
    get_trend_analysis_service,
    get_yield_return_service,
)


def test_get_analytics_context_returns_instance():
    """Verify get_analytics_context returns a context instance."""
    context = get_analytics_context()
    assert context is not None


def test_get_analytics_context_caches_single_instance():
    """Repeated calls should return the same cached context instance."""
    first = get_analytics_context()
    second = get_analytics_context()
    assert first is second


def test_get_roi_calculator_returns_instance():
    """Verify get_roi_calculator creates ROICalculator instance."""
    mock_query_service = Mock()
    roi_calculator = get_roi_calculator(query_service=mock_query_service)
    assert roi_calculator is not None
    assert hasattr(roi_calculator, "compute_portfolio_roi")


def test_get_trend_analysis_service_returns_instance():
    """Verify get_trend_analysis_service creates service instance."""
    service = get_trend_analysis_service(
        db=Mock(),
        query_service=Mock(),
        context=get_analytics_context(),
    )
    assert service is not None
    assert hasattr(service, "get_portfolio_trend")


def test_get_risk_metrics_service_returns_instance():
    """Verify get_risk_metrics_service creates service instance."""
    service = get_risk_metrics_service(
        db=Mock(),
        query_service=Mock(),
        context=get_analytics_context(),
    )
    assert service is not None
    assert hasattr(service, "calculate_portfolio_volatility")


def test_get_drawdown_analysis_service_returns_instance():
    """Verify get_drawdown_analysis_service creates service instance."""
    service = get_drawdown_analysis_service(
        db=Mock(),
        query_service=Mock(),
        context=get_analytics_context(),
    )
    assert service is not None
    assert hasattr(service, "get_enhanced_drawdown_analysis")


def test_get_rolling_analytics_service_returns_instance():
    """Verify get_rolling_analytics_service creates service instance."""
    service = get_rolling_analytics_service(
        db=Mock(),
        query_service=Mock(),
        context=get_analytics_context(),
    )
    assert service is not None
    assert hasattr(service, "get_rolling_sharpe_analysis")


def test_get_yield_return_service_returns_instance():
    """Verify get_yield_return_service creates service instance."""
    service = get_yield_return_service(
        db=Mock(),
        query_service=Mock(),
        context=get_analytics_context(),
    )
    assert service is not None
    assert hasattr(service, "get_daily_yield_returns")


def test_get_query_service_matches_module_singleton():
    """Ensure dependency helper reuses QueryService singleton."""
    from src.services.shared.query_service import get_query_service as module_singleton

    assert get_query_service() is module_singleton()
