"""
Unit tests for MarketDashboardService.

Tests cover:
- _map_sentiment_to_regime: boundary values for all 5 regime bands
- get_market_dashboard: registry shape, per-series value population,
  derived indicators (is_above), regime tag, SPY weekend forward-fill,
  and response metadata.

All sub-services are mocked.
"""

from datetime import date
from typing import Any
from unittest.mock import Mock

from src.models.market_dashboard import SeriesFrequency, SeriesKind
from src.models.regime_tracking import RegimeId
from src.models.token_price import TokenPriceSnapshot
from src.services.market.market_dashboard_service import MarketDashboardService


def _make_price_snapshot(
    d: date, price: float, token_symbol: str = "BTC"
) -> TokenPriceSnapshot:
    """Create a minimal TokenPriceSnapshot for a given date and price."""
    return TokenPriceSnapshot(
        date=d.isoformat(),
        price_usd=price,
        token_symbol=token_symbol,
    )


def _make_service(
    prices: list[TokenPriceSnapshot] | None = None,
    eth_prices: list[TokenPriceSnapshot] | None = None,
    btc_dma_map: dict[date, float] | None = None,
    eth_dma_map: dict[date, float] | None = None,
    eth_btc_ratio_map: dict[date, dict[str, Any]] | None = None,
    sentiment_rows: list[dict[str, Any]] | None = None,
    spy_dma_rows: dict[date, dict[str, Any]] | None = None,
    macro_fear_greed_rows: dict[date, dict[str, Any]] | None = None,
    macro_fear_greed_error: Exception | None = None,
) -> MarketDashboardService:
    """Construct MarketDashboardService with mocked sub-services."""
    mock_price_service = Mock()

    def get_price_history_side_effect(*_args: Any, **kwargs: Any):
        token_symbol = str(kwargs.get("token_symbol", "BTC")).upper()
        if token_symbol == "ETH":
            return eth_prices or []
        return prices or []

    def get_dma_history_side_effect(*_args: Any, **kwargs: Any):
        token_symbol = str(kwargs.get("token_symbol", "BTC")).upper()
        if token_symbol == "ETH":
            return eth_dma_map or {}
        return btc_dma_map or {}

    mock_price_service.get_price_history.side_effect = get_price_history_side_effect
    mock_price_service.get_dma_history.side_effect = get_dma_history_side_effect
    mock_price_service.get_pair_ratio_dma_history.return_value = eth_btc_ratio_map or {}

    mock_sentiment_service = Mock()
    mock_sentiment_service.get_daily_sentiment_aggregates.return_value = (
        sentiment_rows or []
    )

    mock_stock_service = Mock()
    mock_stock_service.get_dma_history.return_value = spy_dma_rows or {}

    mock_macro_fear_greed_service = Mock()
    if macro_fear_greed_error is not None:
        mock_macro_fear_greed_service.get_daily_macro_fear_greed.side_effect = (
            macro_fear_greed_error
        )
    else:
        mock_macro_fear_greed_service.get_daily_macro_fear_greed.return_value = (
            macro_fear_greed_rows or {}
        )

    return MarketDashboardService(
        mock_price_service,
        mock_sentiment_service,
        mock_stock_service,
        mock_macro_fear_greed_service,
    )


class TestMapSentimentToRegime:
    """Boundary-value tests for _map_sentiment_to_regime static method."""

    def test_extreme_fear_lower_bound(self):
        assert MarketDashboardService._map_sentiment_to_regime(0) == RegimeId.ef

    def test_extreme_fear_upper_bound(self):
        assert MarketDashboardService._map_sentiment_to_regime(25) == RegimeId.ef

    def test_fear_lower_bound(self):
        assert MarketDashboardService._map_sentiment_to_regime(26) == RegimeId.f

    def test_fear_upper_bound(self):
        assert MarketDashboardService._map_sentiment_to_regime(45) == RegimeId.f

    def test_neutral_lower_bound(self):
        assert MarketDashboardService._map_sentiment_to_regime(46) == RegimeId.n

    def test_neutral_upper_bound(self):
        assert MarketDashboardService._map_sentiment_to_regime(54) == RegimeId.n

    def test_greed_lower_bound(self):
        assert MarketDashboardService._map_sentiment_to_regime(55) == RegimeId.g

    def test_greed_upper_bound(self):
        assert MarketDashboardService._map_sentiment_to_regime(75) == RegimeId.g

    def test_extreme_greed_lower_bound(self):
        assert MarketDashboardService._map_sentiment_to_regime(76) == RegimeId.eg

    def test_extreme_greed_upper_bound(self):
        assert MarketDashboardService._map_sentiment_to_regime(100) == RegimeId.eg


class TestSeriesRegistry:
    """The series registry shipped on every response."""

    def test_registry_contains_expected_series(self):
        service = _make_service()
        result = service.get_market_dashboard(days=1)

        assert set(result.series.keys()) == {
            "btc",
            "eth",
            "spy",
            "eth_btc",
            "fgi",
            "macro_fear_greed",
        }

    def test_registry_descriptors_have_required_fields(self):
        service = _make_service()
        result = service.get_market_dashboard(days=1)

        btc = result.series["btc"]
        assert btc.kind == SeriesKind.asset
        assert btc.unit == "usd"
        assert btc.label == "BTC"
        assert btc.frequency == SeriesFrequency.daily

        eth = result.series["eth"]
        assert eth.kind == SeriesKind.asset
        assert eth.unit == "usd"
        assert eth.label == "ETH"
        assert eth.frequency == SeriesFrequency.daily

        spy = result.series["spy"]
        assert spy.frequency == SeriesFrequency.weekdays

        fgi = result.series["fgi"]
        assert fgi.kind == SeriesKind.gauge
        assert fgi.scale == (0.0, 100.0)

        macro_fgi = result.series["macro_fear_greed"]
        assert macro_fgi.kind == SeriesKind.gauge
        assert macro_fgi.unit == "score"
        assert macro_fgi.frequency == SeriesFrequency.daily
        assert macro_fgi.scale == (0.0, 100.0)


class TestGetMarketDashboard:
    """Tests for the get_market_dashboard orchestration method."""

    def test_btc_value_and_dma_indicator(self):
        d = date(2025, 1, 15)
        prices = [_make_price_snapshot(d, 95000.0)]
        btc_dma_map = {d: 85000.0}

        service = _make_service(prices=prices, btc_dma_map=btc_dma_map)
        result = service.get_market_dashboard(days=30)

        snapshot = result.snapshots[0]
        assert snapshot.snapshot_date == d
        btc = snapshot.values["btc"]
        assert btc.value == 95000.0
        assert btc.indicators["dma_200"].value == 85000.0
        assert btc.indicators["dma_200"].is_above is True  # 95000 > 85000

    def test_btc_below_dma_sets_is_above_false(self):
        d = date(2025, 1, 15)
        prices = [_make_price_snapshot(d, 80000.0)]
        btc_dma_map = {d: 85000.0}

        service = _make_service(prices=prices, btc_dma_map=btc_dma_map)
        result = service.get_market_dashboard(days=30)

        assert result.snapshots[0].values["btc"].indicators["dma_200"].is_above is False

    def test_btc_no_dma_omits_indicator(self):
        d = date(2025, 1, 20)
        prices = [_make_price_snapshot(d, 92000.0)]

        service = _make_service(prices=prices, btc_dma_map={})
        result = service.get_market_dashboard(days=30)

        btc = result.snapshots[0].values["btc"]
        assert btc.value == 92000.0
        assert "dma_200" not in btc.indicators

    def test_eth_value_and_dma_indicator(self):
        d = date(2025, 1, 15)
        prices = [_make_price_snapshot(d, 95000.0)]
        eth_prices = [_make_price_snapshot(d, 3100.0, token_symbol="ETH")]
        eth_dma_map = {d: 2900.0}

        service = _make_service(
            prices=prices,
            eth_prices=eth_prices,
            eth_dma_map=eth_dma_map,
        )
        result = service.get_market_dashboard(days=30)

        eth = result.snapshots[0].values["eth"]
        assert eth.value == 3100.0
        assert eth.indicators["dma_200"].value == 2900.0
        assert eth.indicators["dma_200"].is_above is True

    def test_eth_value_present_but_dma_none(self):
        d = date(2025, 1, 15)
        prices = [_make_price_snapshot(d, 95000.0)]
        eth_prices = [_make_price_snapshot(d, 2800.0, token_symbol="ETH")]

        service = _make_service(prices=prices, eth_prices=eth_prices)
        result = service.get_market_dashboard(days=30)

        eth = result.snapshots[0].values["eth"]
        assert eth.value == 2800.0
        assert "dma_200" not in eth.indicators

    def test_spy_populated_when_data_present(self):
        d = date(2025, 1, 15)
        prices = [_make_price_snapshot(d, 95000.0)]
        spy_rows = {d: {"price_usd": 600.0, "dma_200": 580.0, "is_above_dma": True}}

        service = _make_service(prices=prices, spy_dma_rows=spy_rows)
        result = service.get_market_dashboard(days=30)

        spy = result.snapshots[0].values["spy"]
        assert spy.value == 600.0
        assert spy.indicators["dma_200"].value == 580.0
        assert spy.indicators["dma_200"].is_above is True

    def test_spy_missing_omits_value(self):
        d = date(2025, 1, 15)
        prices = [_make_price_snapshot(d, 95000.0)]

        service = _make_service(prices=prices, spy_dma_rows={})
        result = service.get_market_dashboard(days=30)

        assert "spy" not in result.snapshots[0].values

    def test_spy_value_present_but_dma_none(self):
        """Early-backfill case: SPY price exists but DMA hasn't been computed yet."""
        d = date(2025, 1, 15)
        prices = [_make_price_snapshot(d, 95000.0)]
        spy_rows = {d: {"price_usd": 600.0, "dma_200": None, "is_above_dma": None}}

        service = _make_service(prices=prices, spy_dma_rows=spy_rows)
        result = service.get_market_dashboard(days=30)

        spy = result.snapshots[0].values["spy"]
        assert spy.value == 600.0
        assert "dma_200" not in spy.indicators

    def test_spy_is_above_none_passes_through(self):
        """is_above_dma=None upstream must remain None (not coerced to False)."""
        d = date(2025, 1, 15)
        prices = [_make_price_snapshot(d, 95000.0)]
        spy_rows = {d: {"price_usd": 600.0, "dma_200": 580.0, "is_above_dma": None}}

        service = _make_service(prices=prices, spy_dma_rows=spy_rows)
        result = service.get_market_dashboard(days=30)

        spy = result.snapshots[0].values["spy"]
        assert spy.indicators["dma_200"].value == 580.0
        assert spy.indicators["dma_200"].is_above is None

    def test_spy_forward_filled_across_weekend(self):
        """SPY data on Friday should fill into Saturday/Sunday BTC dates."""
        friday = date(2025, 1, 17)
        saturday = date(2025, 1, 18)
        sunday = date(2025, 1, 19)
        prices = [
            _make_price_snapshot(friday, 95000.0),
            _make_price_snapshot(saturday, 96000.0),
            _make_price_snapshot(sunday, 97000.0),
        ]
        spy_rows = {
            friday: {"price_usd": 600.0, "dma_200": 580.0, "is_above_dma": True}
        }

        service = _make_service(prices=prices, spy_dma_rows=spy_rows)
        result = service.get_market_dashboard(days=30)

        assert result.snapshots[0].values["spy"].value == 600.0
        assert result.snapshots[1].values["spy"].value == 600.0  # forward-filled
        assert result.snapshots[2].values["spy"].value == 600.0  # forward-filled

    def test_eth_btc_ratio_value_present_but_dma_none(self):
        """Pair-ratio with no DMA yet (e.g., insufficient ETH history)."""
        d = date(2025, 1, 15)
        prices = [_make_price_snapshot(d, 95000.0)]
        ratio_map = {d: {"ratio": 0.0532, "dma_200": None, "is_above_dma": None}}

        service = _make_service(prices=prices, eth_btc_ratio_map=ratio_map)
        result = service.get_market_dashboard(days=30)

        eth_btc = result.snapshots[0].values["eth_btc"]
        assert eth_btc.value == 0.0532
        assert "dma_200" not in eth_btc.indicators

    def test_eth_btc_ratio_populated(self):
        d = date(2025, 1, 15)
        prices = [_make_price_snapshot(d, 95000.0)]
        ratio_map = {d: {"ratio": 0.0532, "dma_200": 0.0498, "is_above_dma": True}}

        service = _make_service(prices=prices, eth_btc_ratio_map=ratio_map)
        result = service.get_market_dashboard(days=30)

        eth_btc = result.snapshots[0].values["eth_btc"]
        assert eth_btc.value == 0.0532
        assert eth_btc.indicators["dma_200"].value == 0.0498
        assert eth_btc.indicators["dma_200"].is_above is True

    def test_fgi_carries_regime_tag(self):
        d = date(2025, 1, 15)
        prices = [_make_price_snapshot(d, 95000.0)]
        sentiment_rows = [{"snapshot_date": d, "avg_sentiment": 45.0}]

        service = _make_service(prices=prices, sentiment_rows=sentiment_rows)
        result = service.get_market_dashboard(days=30)

        fgi = result.snapshots[0].values["fgi"]
        assert fgi.value == 45.0
        assert fgi.tags["regime"] == "f"

    def test_fgi_omitted_when_no_sentiment(self):
        d = date(2025, 1, 15)
        prices = [_make_price_snapshot(d, 95000.0)]

        service = _make_service(prices=prices, sentiment_rows=[])
        result = service.get_market_dashboard(days=30)

        assert "fgi" not in result.snapshots[0].values

    def test_macro_fear_greed_populated_when_data_present(self):
        d = date(2025, 1, 15)
        prices = [_make_price_snapshot(d, 95000.0)]
        macro_rows = {
            d: {
                "score": 34.0,
                "label": "fear",
                "source": "cnn_fear_greed_unofficial",
                "updated_at": "2025-01-15T12:00:00+00:00",
                "raw_rating": "Fear",
            }
        }

        service = _make_service(prices=prices, macro_fear_greed_rows=macro_rows)
        result = service.get_market_dashboard(days=30)

        macro_fgi = result.snapshots[0].values["macro_fear_greed"]
        assert macro_fgi.value == 34.0
        assert macro_fgi.tags == {
            "label": "Fear",
            "regime": "fear",
            "source": "cnn_fear_greed_unofficial",
        }

    def test_macro_fear_greed_forward_fills_sparse_rows(self):
        first = date(2025, 1, 15)
        second = date(2025, 1, 16)
        prices = [
            _make_price_snapshot(first, 95000.0),
            _make_price_snapshot(second, 96000.0),
        ]
        macro_rows = {
            first: {
                "score": 34.0,
                "label": "fear",
                "source": "cnn_fear_greed_unofficial",
                "updated_at": "2025-01-15T12:00:00+00:00",
                "raw_rating": None,
            }
        }

        service = _make_service(prices=prices, macro_fear_greed_rows=macro_rows)
        result = service.get_market_dashboard(days=30)

        assert result.snapshots[0].values["macro_fear_greed"].value == 34.0
        assert result.snapshots[1].values["macro_fear_greed"].value == 34.0
        assert result.snapshots[1].values["macro_fear_greed"].tags["label"] == "fear"

    def test_macro_fear_greed_omitted_when_service_fails(self):
        d = date(2025, 1, 15)
        prices = [_make_price_snapshot(d, 95000.0)]

        service = _make_service(
            prices=prices,
            macro_fear_greed_error=RuntimeError("macro down"),
        )
        result = service.get_market_dashboard(days=30)

        assert "macro_fear_greed" not in result.snapshots[0].values

    def test_sentiment_string_date_is_parsed(self):
        d = date(2025, 3, 1)
        prices = [_make_price_snapshot(d, 88000.0)]
        sentiment_rows = [{"snapshot_date": "2025-03-01", "avg_sentiment": 75.0}]

        service = _make_service(prices=prices, sentiment_rows=sentiment_rows)
        result = service.get_market_dashboard(days=30)

        fgi = result.snapshots[0].values["fgi"]
        assert fgi.value == 75.0
        assert fgi.tags["regime"] == "g"

    def test_empty_prices_returns_empty_snapshots(self):
        service = _make_service()
        result = service.get_market_dashboard(days=30)

        assert result.meta.count == 0
        assert result.snapshots == []
        # Series registry is still present even with empty snapshots
        assert "btc" in result.series

    def test_meta_contents(self):
        d = date(2025, 1, 1)
        prices = [_make_price_snapshot(d, 100000.0)]
        service = _make_service(prices=prices)

        result = service.get_market_dashboard(days=90)

        assert result.meta.days_requested == 90
        assert result.meta.count == 1
        assert result.meta.primary_series == "btc"

    def test_multiple_dates_preserve_order(self):
        dates = [date(2025, 1, d) for d in range(1, 4)]
        prices = [
            _make_price_snapshot(d, float(80000 + i * 1000))
            for i, d in enumerate(dates)
        ]
        service = _make_service(prices=prices)

        result = service.get_market_dashboard(days=7)

        assert [s.snapshot_date for s in result.snapshots] == dates
