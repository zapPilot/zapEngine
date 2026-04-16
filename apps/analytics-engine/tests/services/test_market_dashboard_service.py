"""
Unit tests for MarketDashboardService.

Tests cover:
- _map_sentiment_to_regime: boundary values for all 5 regime bands
- get_market_dashboard: data merging, primary timeline, optional enrichments,
  empty price handling, response metadata, and regime derivation from sentiment

All sub-services (token_price_service, sentiment_service) are mocked.
"""

from datetime import date
from unittest.mock import Mock

from src.models.regime_tracking import RegimeId
from src.models.token_price import TokenPriceSnapshot
from src.services.market.market_dashboard_service import MarketDashboardService

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_price_snapshot(d: date, price: float) -> TokenPriceSnapshot:
    """Create a minimal TokenPriceSnapshot for a given date and price."""
    return TokenPriceSnapshot(
        date=d.isoformat(),
        price_usd=price,
        token_symbol="BTC",
    )


def _make_service(
    prices: list[TokenPriceSnapshot] | None = None,
    dma_map: dict[date, float] | None = None,
    ratio_map: dict[date, dict[str, float | bool | None]] | None = None,
    sentiment_rows: list[dict] | None = None,
) -> MarketDashboardService:
    """Construct MarketDashboardService with mocked sub-services."""
    mock_price_service = Mock()
    mock_price_service.get_price_history.return_value = prices or []
    mock_price_service.get_dma_history.return_value = dma_map or {}
    mock_price_service.get_pair_ratio_dma_history.return_value = ratio_map or {}

    mock_sentiment_service = Mock()
    mock_sentiment_service.get_daily_sentiment_aggregates.return_value = (
        sentiment_rows or []
    )

    return MarketDashboardService(mock_price_service, mock_sentiment_service)


# ---------------------------------------------------------------------------
# TestMapSentimentToRegime
# ---------------------------------------------------------------------------


class TestMapSentimentToRegime:
    """Boundary-value tests for _map_sentiment_to_regime static method."""

    def test_extreme_fear_lower_bound(self):
        """Sentiment value 0 should map to extreme fear."""
        assert MarketDashboardService._map_sentiment_to_regime(0) == RegimeId.ef

    def test_extreme_fear_upper_bound(self):
        """Sentiment value 25 should still be extreme fear."""
        assert MarketDashboardService._map_sentiment_to_regime(25) == RegimeId.ef

    def test_fear_lower_bound(self):
        """Sentiment value 26 is the first fear value."""
        assert MarketDashboardService._map_sentiment_to_regime(26) == RegimeId.f

    def test_fear_upper_bound(self):
        """Sentiment value 45 is the last fear value."""
        assert MarketDashboardService._map_sentiment_to_regime(45) == RegimeId.f

    def test_neutral_lower_bound(self):
        """Sentiment value 46 is the first neutral value."""
        assert MarketDashboardService._map_sentiment_to_regime(46) == RegimeId.n

    def test_neutral_upper_bound(self):
        """Sentiment value 54 is the last neutral value."""
        assert MarketDashboardService._map_sentiment_to_regime(54) == RegimeId.n

    def test_greed_lower_bound(self):
        """Sentiment value 55 is the first greed value."""
        assert MarketDashboardService._map_sentiment_to_regime(55) == RegimeId.g

    def test_greed_upper_bound(self):
        """Sentiment value 75 is the last greed value."""
        assert MarketDashboardService._map_sentiment_to_regime(75) == RegimeId.g

    def test_extreme_greed_lower_bound(self):
        """Sentiment value 76 is the first extreme greed value."""
        assert MarketDashboardService._map_sentiment_to_regime(76) == RegimeId.eg

    def test_extreme_greed_upper_bound(self):
        """Sentiment value 100 should map to extreme greed."""
        assert MarketDashboardService._map_sentiment_to_regime(100) == RegimeId.eg


# ---------------------------------------------------------------------------
# TestGetMarketDashboard
# ---------------------------------------------------------------------------


class TestGetMarketDashboard:
    """Tests for the get_market_dashboard orchestration method."""

    def test_merges_price_dma_sentiment(self):
        """All three data sources should be merged into a single MarketDashboardPoint."""
        d = date(2025, 1, 15)
        prices = [_make_price_snapshot(d, 95000.0)]
        dma_map = {d: 85000.0}
        ratio_map = {d: {"ratio": 0.0532, "dma_200": 0.0498, "is_above_dma": True}}
        sentiment_rows = [{"snapshot_date": d, "avg_sentiment": 45.0}]

        service = _make_service(prices, dma_map, ratio_map, sentiment_rows)
        result = service.get_market_dashboard(days=30, token_symbol="BTC")

        assert result.count == 1
        snapshot = result.snapshots[0]
        assert snapshot.snapshot_date == d
        assert snapshot.price_usd == 95000.0
        assert snapshot.dma_200 == 85000.0
        assert snapshot.sentiment_value == 45
        assert snapshot.regime == RegimeId.f
        assert snapshot.eth_btc_relative_strength is not None
        assert snapshot.eth_btc_relative_strength.ratio == 0.0532
        assert snapshot.eth_btc_relative_strength.dma_200 == 0.0498
        assert snapshot.eth_btc_relative_strength.is_above_dma is True

    def test_price_is_primary_timeline(self):
        """Only dates present in price history should appear in snapshots."""
        price_date = date(2025, 1, 10)
        extra_date = date(2025, 1, 11)  # only in dma/sentiment, not in prices

        prices = [_make_price_snapshot(price_date, 90000.0)]
        dma_map = {price_date: 80000.0, extra_date: 81000.0}
        sentiment_rows = [
            {"snapshot_date": price_date, "avg_sentiment": 50.0},
            {"snapshot_date": extra_date, "avg_sentiment": 60.0},
        ]

        service = _make_service(prices, dma_map, None, sentiment_rows)
        result = service.get_market_dashboard(days=30, token_symbol="BTC")

        assert result.count == 1
        assert result.snapshots[0].snapshot_date == price_date

    def test_missing_dma_date_is_null(self):
        """A date absent from dma_map should produce dma_200=None."""
        d = date(2025, 1, 20)
        prices = [_make_price_snapshot(d, 92000.0)]
        # No DMA data for this date
        dma_map: dict[date, float] = {}
        sentiment_rows = [{"snapshot_date": d, "avg_sentiment": 55.0}]

        service = _make_service(prices, dma_map, None, sentiment_rows)
        result = service.get_market_dashboard(days=30, token_symbol="BTC")

        assert result.snapshots[0].dma_200 is None

    def test_missing_sentiment_date_is_null(self):
        """A date absent from sentiment data should produce sentiment_value=None, regime=None."""
        d = date(2025, 1, 25)
        prices = [_make_price_snapshot(d, 93000.0)]
        dma_map = {d: 82000.0}
        # No sentiment data for this date
        sentiment_rows: list[dict] = []

        service = _make_service(prices, dma_map, None, sentiment_rows)
        result = service.get_market_dashboard(days=30, token_symbol="BTC")

        assert result.snapshots[0].sentiment_value is None
        assert result.snapshots[0].regime is None

    def test_missing_ratio_date_is_null(self):
        """A date absent from ratio data should produce eth_btc_relative_strength=None."""
        d = date(2025, 1, 26)
        prices = [_make_price_snapshot(d, 94000.0)]
        dma_map = {d: 83000.0}
        sentiment_rows = [{"snapshot_date": d, "avg_sentiment": 58.0}]

        service = _make_service(prices, dma_map, None, sentiment_rows)
        result = service.get_market_dashboard(days=30, token_symbol="BTC")

        assert result.snapshots[0].eth_btc_relative_strength is None

    def test_empty_price_returns_empty_snapshots(self):
        """When price history is empty, response should have count=0 and no snapshots."""
        service = _make_service(prices=[], dma_map={}, sentiment_rows=[])
        result = service.get_market_dashboard(days=30, token_symbol="BTC")

        assert result.count == 0
        assert result.snapshots == []

    def test_response_metadata(self):
        """Response should carry correct metadata: token_symbol uppercased, days_requested set."""
        d = date(2025, 1, 1)
        prices = [_make_price_snapshot(d, 100000.0)]
        service = _make_service(prices)

        result = service.get_market_dashboard(days=90, token_symbol="ETH")

        assert result.token_symbol == "ETH"
        assert result.days_requested == 90
        assert result.count == len(result.snapshots)

    def test_regime_derived_from_sentiment(self):
        """Sentiment value of 20 should derive regime='ef' in the snapshot."""
        d = date(2025, 2, 1)
        prices = [_make_price_snapshot(d, 80000.0)]
        sentiment_rows = [{"snapshot_date": d, "avg_sentiment": 20.0}]

        service = _make_service(prices, sentiment_rows=sentiment_rows)
        result = service.get_market_dashboard(days=30, token_symbol="BTC")

        snapshot = result.snapshots[0]
        assert snapshot.sentiment_value == 20
        assert snapshot.regime == RegimeId.ef

    def test_sentiment_string_date_is_parsed(self):
        """sentiment_rows with snapshot_date as ISO string should be parsed correctly."""
        d = date(2025, 3, 1)
        prices = [_make_price_snapshot(d, 88000.0)]
        # snapshot_date as string instead of date object
        sentiment_rows = [{"snapshot_date": "2025-03-01", "avg_sentiment": 75.0}]

        service = _make_service(prices, sentiment_rows=sentiment_rows)
        result = service.get_market_dashboard(days=30, token_symbol="BTC")

        snapshot = result.snapshots[0]
        assert snapshot.sentiment_value == 75
        assert snapshot.regime == RegimeId.g

    def test_multiple_price_dates_preserve_order(self):
        """Snapshots should follow the order returned by price history."""
        dates = [date(2025, 1, d) for d in range(1, 4)]
        prices = [
            _make_price_snapshot(d, float(80000 + i * 1000))
            for i, d in enumerate(dates)
        ]

        service = _make_service(prices)
        result = service.get_market_dashboard(days=7, token_symbol="BTC")

        assert result.count == 3
        for i, expected_date in enumerate(dates):
            assert result.snapshots[i].snapshot_date == expected_date
