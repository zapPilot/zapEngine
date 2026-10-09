"""Focused tests for small runtime modules that otherwise lack direct coverage."""

from unittest.mock import sentinel

from src.core.filter_utils import normalize_filter
from src.services.market.query_backed_service import QueryBackedMarketService


def test_normalize_filter_covers_empty_cleaning_and_sorting() -> None:
    assert normalize_filter(None) == "all"
    assert normalize_filter([]) == "all"
    assert normalize_filter(["", "   "]) == "all"
    assert normalize_filter([" ETH ", "btc", "AAVE"]) == "aave,btc,eth"


def test_query_backed_market_service_accepts_an_injected_query_service() -> None:
    service = QueryBackedMarketService(sentinel.db, sentinel.query_service)

    assert service.db is sentinel.db
    assert service.query_service is sentinel.query_service


def test_query_backed_market_service_resolves_the_default(monkeypatch) -> None:
    from src.services import dependencies

    monkeypatch.setattr(
        dependencies,
        "get_query_service",
        lambda: sentinel.default_query_service,
    )

    service = QueryBackedMarketService(sentinel.db)

    assert service.db is sentinel.db
    assert service.query_service is sentinel.default_query_service
