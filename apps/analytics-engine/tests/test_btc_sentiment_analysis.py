"""
Unit tests for BTC Price & Sentiment Analysis Script

Tests data alignment logic, service method integration, and edge cases.
"""

import sys
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path
from unittest.mock import MagicMock, patch

from sqlalchemy.orm import Session

# Add market scripts to path
sys.path.insert(0, str(Path(__file__).parent.parent / "scripts" / "market"))

from analyze_btc_sentiment import align_data  # noqa: E402

from src.services.market.sentiment_database_service import SentimentDatabaseService


class TestAlignData:
    """Test data alignment logic for BTC and sentiment data."""

    def test_align_data_common_dates(self) -> None:
        """Test basic alignment with overlapping dates."""
        # Arrange
        base_date = date(2024, 1, 1)
        btc_data = [
            {"snapshot_date": base_date, "price": 40000.0},
            {"snapshot_date": base_date + timedelta(days=1), "price": 41000.0},
            {"snapshot_date": base_date + timedelta(days=2), "price": 42000.0},
        ]
        sentiment_data = [
            {"snapshot_date": base_date, "avg_sentiment": Decimal("50.0")},
            {
                "snapshot_date": base_date + timedelta(days=1),
                "avg_sentiment": Decimal("55.0"),
            },
            {
                "snapshot_date": base_date + timedelta(days=2),
                "avg_sentiment": Decimal("60.0"),
            },
        ]

        # Act
        aligned_dates, btc_prices, sentiment_values = align_data(
            btc_data, sentiment_data
        )

        # Assert
        assert len(aligned_dates) == 3
        assert len(btc_prices) == 3
        assert len(sentiment_values) == 3
        assert aligned_dates[0] == base_date
        assert btc_prices[0] == 40000.0
        assert sentiment_values[0] == 50.0

    def test_align_data_no_overlap(self) -> None:
        """Test handling of zero common dates."""
        # Arrange
        btc_data = [{"snapshot_date": date(2024, 1, 1), "price": 40000.0}]
        sentiment_data = [
            {"snapshot_date": date(2024, 2, 1), "avg_sentiment": Decimal("50.0")}
        ]

        # Act
        aligned_dates, btc_prices, sentiment_values = align_data(
            btc_data, sentiment_data
        )

        # Assert
        assert len(aligned_dates) == 0
        assert len(btc_prices) == 0
        assert len(sentiment_values) == 0

    def test_align_data_min_length_constraint(self) -> None:
        """Test that minimum length constraint is applied correctly."""
        # Arrange - BTC has 4 records, sentiment has 3, but only 2 overlap
        base_date = date(2024, 1, 1)
        btc_data = [
            {"snapshot_date": base_date, "price": 40000.0},
            {"snapshot_date": base_date + timedelta(days=1), "price": 41000.0},
            {"snapshot_date": base_date + timedelta(days=2), "price": 42000.0},
            {"snapshot_date": base_date + timedelta(days=3), "price": 43000.0},
        ]
        sentiment_data = [
            {"snapshot_date": base_date, "avg_sentiment": Decimal("50.0")},
            {
                "snapshot_date": base_date + timedelta(days=2),
                "avg_sentiment": Decimal("60.0"),
            },
            {
                "snapshot_date": base_date + timedelta(days=4),
                "avg_sentiment": Decimal("70.0"),
            },
        ]

        # Act
        aligned_dates, btc_prices, sentiment_values = align_data(
            btc_data, sentiment_data
        )

        # Assert - min(4, 3) = 3, but only 2 dates overlap
        assert len(aligned_dates) == 2  # Only 2 common dates
        assert aligned_dates[0] == base_date
        assert aligned_dates[1] == base_date + timedelta(days=2)

    def test_align_data_missing_days(self) -> None:
        """Test handling of gaps in data."""
        # Arrange - BTC has days 1,2,4 and sentiment has days 1,3,4
        base_date = date(2024, 1, 1)
        btc_data = [
            {"snapshot_date": base_date, "price": 40000.0},
            {"snapshot_date": base_date + timedelta(days=1), "price": 41000.0},
            {"snapshot_date": base_date + timedelta(days=3), "price": 43000.0},
        ]
        sentiment_data = [
            {"snapshot_date": base_date, "avg_sentiment": Decimal("50.0")},
            {
                "snapshot_date": base_date + timedelta(days=2),
                "avg_sentiment": Decimal("60.0"),
            },
            {
                "snapshot_date": base_date + timedelta(days=3),
                "avg_sentiment": Decimal("70.0"),
            },
        ]

        # Act
        aligned_dates, btc_prices, sentiment_values = align_data(
            btc_data, sentiment_data
        )

        # Assert - Only days 1 and 4 are common
        assert len(aligned_dates) == 2
        assert aligned_dates[0] == base_date
        assert aligned_dates[1] == base_date + timedelta(days=3)
        assert btc_prices[0] == 40000.0
        assert btc_prices[1] == 43000.0
        assert sentiment_values[0] == 50.0
        assert sentiment_values[1] == 70.0

    def test_align_data_empty_btc(self) -> None:
        """Test handling of empty BTC data."""
        # Arrange
        btc_data: list[dict] = []
        sentiment_data = [
            {"snapshot_date": date(2024, 1, 1), "avg_sentiment": Decimal("50.0")}
        ]

        # Act
        aligned_dates, btc_prices, sentiment_values = align_data(
            btc_data, sentiment_data
        )

        # Assert
        assert len(aligned_dates) == 0
        assert len(btc_prices) == 0
        assert len(sentiment_values) == 0

    def test_align_data_empty_sentiment(self) -> None:
        """Test handling of empty sentiment data."""
        # Arrange
        btc_data = [{"snapshot_date": date(2024, 1, 1), "price": 40000.0}]
        sentiment_data: list[dict] = []

        # Act
        aligned_dates, btc_prices, sentiment_values = align_data(
            btc_data, sentiment_data
        )

        # Assert
        assert len(aligned_dates) == 0
        assert len(btc_prices) == 0
        assert len(sentiment_values) == 0


class TestSentimentDatabaseService:
    """Test SentimentDatabaseService.get_daily_sentiment_aggregates method."""

    def test_get_daily_sentiment_aggregates(self, mocker: MagicMock) -> None:
        """Test daily sentiment aggregates with mock DB."""
        # Arrange
        mock_db = mocker.MagicMock(spec=Session)
        mock_query_service = mocker.MagicMock()
        mock_query_service.execute_query.return_value = [
            {
                "snapshot_date": date(2024, 1, 1),
                "avg_sentiment": Decimal("50.00"),
                "min_sentiment": 45,
                "max_sentiment": 55,
                "snapshot_count": 144,
                "primary_classification": "Neutral",
            },
            {
                "snapshot_date": date(2024, 1, 2),
                "avg_sentiment": Decimal("60.00"),
                "min_sentiment": 55,
                "max_sentiment": 65,
                "snapshot_count": 144,
                "primary_classification": "Greed",
            },
        ]

        service = SentimentDatabaseService(mock_db, mock_query_service)

        # Act
        result = service.get_daily_sentiment_aggregates(
            start_date=date(2024, 1, 1), end_date=date(2024, 1, 2)
        )

        # Assert
        assert len(result) == 2
        assert result[0]["snapshot_date"] == date(2024, 1, 1)
        assert result[0]["avg_sentiment"] == Decimal("50.00")
        assert result[1]["primary_classification"] == "Greed"
        mock_query_service.execute_query.assert_called_once()

    def test_get_daily_sentiment_aggregates_date_range(self, mocker: MagicMock) -> None:
        """Test date range filtering in daily aggregates."""
        # Arrange
        mock_db = mocker.MagicMock(spec=Session)
        mock_query_service = mocker.MagicMock()
        mock_query_service.execute_query.return_value = []

        service = SentimentDatabaseService(mock_db, mock_query_service)
        start = date(2024, 1, 1)
        end = date(2024, 1, 31)

        # Act
        service.get_daily_sentiment_aggregates(start_date=start, end_date=end)

        # Assert - Verify query was called with correct parameters
        call_args = mock_query_service.execute_query.call_args
        assert call_args[0][2]["start_date"] == start
        assert call_args[0][2]["end_date"] == end

    def test_get_daily_sentiment_aggregates_empty_result(
        self, mocker: MagicMock
    ) -> None:
        """Test handling of no data scenario."""
        # Arrange
        mock_db = mocker.MagicMock(spec=Session)
        mock_query_service = mocker.MagicMock()
        mock_query_service.execute_query.return_value = []

        service = SentimentDatabaseService(mock_db, mock_query_service)

        # Act
        result = service.get_daily_sentiment_aggregates()

        # Assert
        assert result == []

    def test_get_daily_sentiment_aggregates_no_date_filter(
        self, mocker: MagicMock
    ) -> None:
        """Test fetching all data without date filters."""
        # Arrange
        mock_db = mocker.MagicMock(spec=Session)
        mock_query_service = mocker.MagicMock()
        mock_query_service.execute_query.return_value = [
            {
                "snapshot_date": date(2024, 1, 1),
                "avg_sentiment": Decimal("50.00"),
                "min_sentiment": 45,
                "max_sentiment": 55,
                "snapshot_count": 144,
                "primary_classification": "Neutral",
            }
        ]

        service = SentimentDatabaseService(mock_db, mock_query_service)

        # Act
        result = service.get_daily_sentiment_aggregates()

        # Assert
        assert len(result) == 1
        call_args = mock_query_service.execute_query.call_args
        assert call_args[0][2]["start_date"] is None
        assert call_args[0][2]["end_date"] is None


class TestChartGeneration:
    """Test chart generation functions."""

    @patch("analyze_btc_sentiment.plt.savefig")
    @patch("analyze_btc_sentiment.plt.tight_layout")
    @patch("analyze_btc_sentiment.plt.title")
    @patch("analyze_btc_sentiment.plt.setp")
    @patch("analyze_btc_sentiment.plt.subplots")
    def test_chart_generation(
        self,
        mock_subplots: MagicMock,
        mock_setp: MagicMock,
        mock_title: MagicMock,
        mock_tight_layout: MagicMock,
        mock_savefig: MagicMock,
    ) -> None:
        """Test that chart generation calls matplotlib correctly."""
        from analyze_btc_sentiment import create_chart

        # Arrange
        mock_ax1 = MagicMock()
        mock_ax2 = MagicMock()
        mock_ax1.twinx.return_value = mock_ax2
        mock_ax1.plot.return_value = [MagicMock()]
        mock_ax2.plot.return_value = [MagicMock()]
        mock_subplots.return_value = (MagicMock(), mock_ax1)

        dates = [date(2024, 1, 1), date(2024, 1, 2)]
        btc_prices = [40000.0, 41000.0]
        sentiment_values = [50.0, 55.0]

        # Act
        create_chart(dates, btc_prices, sentiment_values, "test_output.png")

        # Assert
        mock_savefig.assert_called_once_with(
            "test_output.png", dpi=300, bbox_inches="tight"
        )
        mock_ax1.plot.assert_called_once()
        mock_ax2.plot.assert_called_once()
        mock_tight_layout.assert_called_once()
