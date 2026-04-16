"""Tests for TrendAnalysisService coverage."""

from unittest.mock import Mock, patch

from sqlalchemy.orm import Session

from src.services.analytics.trend_analysis_service import TrendAnalysisService


class TestTrendAnalysisServiceCoverage:
    def test_calculate_trend_summary_empty_aggregates(self):
        """Test _calculate_trend_summary handles case where _ensure_aggregates returns empty."""
        query_service = Mock()
        db = Mock(spec=Session)
        service = TrendAnalysisService(db, query_service)

        # Mock _ensure_aggregates to return empty list even if input is not empty
        # This simulates a filtering case or malformed data that results in no aggregates
        service._ensure_aggregates = Mock(return_value=[])

        result = service._calculate_trend_summary(["some_data"])

        assert result["data_points"] == 1  # Length of input
        assert result["latest_value"] == 0.0
        assert result["change_usd"] == 0.0

    def test_build_daily_totals_empty_aggregates(self):
        """Test _build_daily_totals handles case where _ensure_aggregates returns empty."""
        query_service = Mock()
        db = Mock(spec=Session)
        service = TrendAnalysisService(db, query_service)

        service._ensure_aggregates = Mock(return_value=[])

        result = service._build_daily_totals(["some_data"])

        assert result == []

    @patch("src.services.analytics.trend_analysis_service.db_manager")
    def test_get_portfolio_trend_with_session_local(self, mock_db_manager):
        """Test get_portfolio_trend uses db_manager.SessionLocal if available."""
        # Setup mocks
        query_service = Mock()
        db = Mock(spec=Session)
        service = TrendAnalysisService(db, query_service)

        # Mock SessionLocal
        mock_session = Mock(spec=Session)
        mock_db_manager.SessionLocal.return_value.__enter__.return_value = mock_session

        # Mock payload and dependencies to avoid actual logic execution failure
        with patch.object(service, "_fetch_category_trend_payload") as mock_fetch:
            # Setup payload return to avoid AttributeError
            mock_payload = Mock()
            mock_payload.rows = []
            mock_fetch.return_value = mock_payload

            # Execute
            service.get_portfolio_trend(user_id="user-123", days=30)

            # Verify SessionLocal was used
            mock_db_manager.SessionLocal.assert_called()

    def test_validate_aggregates_integrity_error(self):
        """Test _validate_aggregates raises DataIntegrityError on invalid data."""
        from datetime import date

        import pytest

        from src.core.exceptions import DataIntegrityError
        from src.services.transformers.category_data_transformer import (
            CategoryDailyAggregate,
        )

        service = TrendAnalysisService(Mock(), Mock())

        # Test None total_value_usd
        bad_agg_none = CategoryDailyAggregate(
            date=date.today(),
            total_value_usd=None,  # type: ignore
            category_totals={},
            rows=[],
            protocols=[],
        )

        with pytest.raises(DataIntegrityError, match="NULL total_value_usd"):
            service._validate_aggregates([bad_agg_none], "user-123")

        # Test negative total_value_usd
        bad_agg_neg = CategoryDailyAggregate(
            date=date.today(),
            total_value_usd=-100.0,
            category_totals={},
            rows=[],
            protocols=[],
        )

        with pytest.raises(DataIntegrityError, match="negative"):
            service._validate_aggregates([bad_agg_neg], "user-123")
