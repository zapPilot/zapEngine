"""Tests for v3 compare date range calculation logic."""

from __future__ import annotations

from datetime import date, timedelta
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.models.backtesting import (
    BacktestCompareConfigV3,
    BacktestCompareRequestV3,
    BacktestResponse,
)
from src.services.backtesting.strategy_registry import get_strategy_recipe
from src.services.strategy.backtesting_service import BacktestingService
from tests.services.backtesting.support import compare_request, price_row, price_series

DMA_WARMUP_DAYS = get_strategy_recipe("dma_gated_fgi").warmup_lookback_days


@pytest.fixture
def mock_deps() -> dict[str, MagicMock]:
    return {
        "db": MagicMock(),
        "token_price_service": MagicMock(),
        "sentiment_service": MagicMock(),
    }


@pytest.fixture
def service(mock_deps: dict[str, MagicMock]) -> BacktestingService:
    return BacktestingService(**mock_deps)


def _setup_compare_service(
    service: BacktestingService,
    monkeypatch: pytest.MonkeyPatch,
    *,
    prices: list[dict[str, object]] | None = None,
    sentiments: dict[date, dict[str, object]] | None = None,
) -> MagicMock:
    service.data_provider.fetch_token_prices = AsyncMock(
        return_value=prices
        or [
            price_row(date(2024, 9, 15), price=100.0, dma_200=95.0),
            price_row(date(2024, 12, 31), price=110.0, dma_200=105.0),
            price_row(date.today(), price=120.0, dma_200=115.0),
        ]
    )
    service.data_provider.fetch_sentiments = AsyncMock(return_value=sentiments or {})
    mock_runner = MagicMock(return_value=BacktestResponse(strategies={}, timeline=[]))
    monkeypatch.setattr(
        "src.services.strategy.backtesting_service.run_compare_v3_on_data",
        mock_runner,
    )
    return mock_runner


class TestBacktestingDatePriority:
    """Test date range calculation priority in BacktestingService."""

    @pytest.mark.asyncio
    async def test_explicit_dates_take_precedence_over_days(self, service, monkeypatch):
        _setup_compare_service(service, monkeypatch)

        request = compare_request(
            start_date=date(2024, 9, 15),
            end_date=date(2024, 9, 20),
            days=100,
        )

        await service.run_compare_v3(request)

        call_args = service.data_provider.fetch_token_prices.call_args
        assert call_args[0][0] == "BTC"
        assert call_args[0][1] == date(2024, 9, 1)
        assert call_args[0][2] == date(2024, 9, 20)

    @pytest.mark.asyncio
    async def test_start_date_plus_days_calculates_end_date(self, service, monkeypatch):
        _setup_compare_service(service, monkeypatch)

        request = compare_request(
            start_date=date(2024, 9, 15),
            days=5,
        )

        await service.run_compare_v3(request)

        call_args = service.data_provider.fetch_token_prices.call_args
        assert call_args[0][0] == "BTC"
        assert call_args[0][1] == date(2024, 9, 1)
        assert call_args[0][2] == date(2024, 9, 20)

    @pytest.mark.asyncio
    async def test_end_date_plus_days_calculates_start_date(self, service, monkeypatch):
        _setup_compare_service(service, monkeypatch)

        request = compare_request(
            end_date=date(2024, 9, 20),
            days=5,
        )

        await service.run_compare_v3(request)

        call_args = service.data_provider.fetch_token_prices.call_args
        assert call_args[0][0] == "BTC"
        assert call_args[0][1] == date(2024, 9, 1)
        assert call_args[0][2] == date(2024, 9, 20)

    @pytest.mark.asyncio
    async def test_only_days_uses_today_as_end(self, service, monkeypatch):
        _setup_compare_service(service, monkeypatch)

        days = 30
        request = compare_request(token_symbol="BTC", days=days)

        await service.run_compare_v3(request)

        expected_end = date.today()
        user_start = expected_end - timedelta(days=days)
        expected_fetch_start = user_start - timedelta(days=DMA_WARMUP_DAYS)

        call_args = service.data_provider.fetch_token_prices.call_args
        assert call_args[0][0] == "BTC"
        assert call_args[0][1] == expected_fetch_start
        assert call_args[0][2] == expected_end

    @pytest.mark.asyncio
    async def test_no_params_defaults_to_90_days(self, service, monkeypatch):
        _setup_compare_service(service, monkeypatch)

        request = BacktestCompareRequestV3(
            token_symbol="BTC",
            total_capital=10_000.0,
            configs=[
                BacktestCompareConfigV3(
                    config_id="dma_gated_fgi_default",
                    strategy_id="dma_gated_fgi",
                    params={},
                )
            ],
        )

        await service.run_compare_v3(request)

        expected_end = date.today()
        user_start = expected_end - timedelta(days=90)
        expected_fetch_start = user_start - timedelta(days=DMA_WARMUP_DAYS)

        call_args = service.data_provider.fetch_token_prices.call_args
        assert call_args[0][0] == "BTC"
        assert call_args[0][1] == expected_fetch_start
        assert call_args[0][2] == expected_end

    @pytest.mark.asyncio
    async def test_only_start_date_uses_90_day_default(self, service, monkeypatch):
        _setup_compare_service(service, monkeypatch)

        request = compare_request(
            token_symbol="BTC",
            start_date=date(2024, 6, 1),
        )

        await service.run_compare_v3(request)

        call_args = service.data_provider.fetch_token_prices.call_args
        assert call_args[0][1] == date(2024, 5, 18)
        assert call_args[0][2] == date.today()

    @pytest.mark.asyncio
    async def test_only_end_date_uses_90_day_default(self, service, monkeypatch):
        _setup_compare_service(service, monkeypatch)

        request = compare_request(
            token_symbol="BTC",
            end_date=date(2024, 12, 31),
        )

        await service.run_compare_v3(request)

        user_start = date(2024, 12, 31) - timedelta(days=90)
        expected_fetch_start = user_start - timedelta(days=DMA_WARMUP_DAYS)

        call_args = service.data_provider.fetch_token_prices.call_args
        assert call_args[0][1] == expected_fetch_start
        assert call_args[0][2] == date(2024, 12, 31)


class TestBacktestingRegressionBug:
    @pytest.mark.asyncio
    async def test_user_start_date_is_respected_with_days(self, service, monkeypatch):
        _setup_compare_service(
            service,
            monkeypatch,
            prices=[
                price_row(date(2024, 9, 15), price=100.0, dma_200=95.0),
                price_row(date.today(), price=120.0, dma_200=115.0),
            ],
        )

        request = compare_request(
            token_symbol="BTC",
            total_capital=10_000,
            days=5,
            start_date=date(2024, 9, 15),
        )

        await service.run_compare_v3(request)

        call_args = service.data_provider.fetch_token_prices.call_args
        fetch_start_date = call_args[0][1]
        fetch_end_date = call_args[0][2]

        assert fetch_start_date == date(2024, 9, 1)
        assert fetch_end_date == date(2024, 9, 20)
        assert fetch_start_date.year == 2024
        assert fetch_end_date.year == 2024


class TestBacktestingPrimerDays:
    @pytest.mark.asyncio
    async def test_primer_days_fetches_earlier_data(self, service, monkeypatch):
        _setup_compare_service(
            service,
            monkeypatch,
            prices=price_series(date(2024, 8, 18), 25),
        )

        request = compare_request(
            token_symbol="BTC",
            total_capital=10_000,
            days=10,
            start_date=date(2024, 9, 1),
        )

        await service.run_compare_v3(request)

        call_args = service.data_provider.fetch_token_prices.call_args
        fetch_start = call_args[0][1]
        fetch_end = call_args[0][2]

        assert fetch_start == date(2024, 8, 18)
        assert fetch_end == date(2024, 9, 11)

    @pytest.mark.asyncio
    async def test_user_start_date_passed_to_simulation(self, service, monkeypatch):
        mock_runner = _setup_compare_service(
            service,
            monkeypatch,
            prices=price_series(date(2024, 8, 18), 25),
        )

        user_start = date(2024, 9, 1)
        request = compare_request(
            token_symbol="BTC",
            total_capital=10_000,
            days=10,
            start_date=user_start,
        )

        await service.run_compare_v3(request)

        call_kwargs = mock_runner.call_args.kwargs
        assert call_kwargs["user_start_date"] == user_start
        strategy_ids = [cfg.strategy_id for cfg in call_kwargs["request"].configs]
        assert strategy_ids == ["dca_classic", "dma_gated_fgi"]

    @pytest.mark.asyncio
    async def test_output_timeline_excludes_primer_days(self, service):
        primer_days = DMA_WARMUP_DAYS
        user_start = date(2024, 9, 1)
        user_days = 10
        fetch_start = user_start - timedelta(days=primer_days)

        prices = price_series(fetch_start, primer_days + user_days + 1)
        sentiments = {
            fetch_start + timedelta(days=i): {"value": 50, "label": "neutral"}
            for i in range(primer_days + user_days + 1)
        }

        service.data_provider.fetch_token_prices = AsyncMock(return_value=prices)
        service.data_provider.fetch_sentiments = AsyncMock(return_value=sentiments)

        request = compare_request(
            token_symbol="BTC",
            total_capital=10_000,
            days=user_days,
            start_date=user_start,
        )

        result = await service.run_compare_v3(request)

        timeline = result.timeline
        if timeline:
            first_date = timeline[0].market.date
            assert first_date >= user_start
            assert first_date != fetch_start
