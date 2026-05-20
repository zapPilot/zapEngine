from __future__ import annotations

from datetime import date, datetime
from unittest.mock import MagicMock

import pytest

from src.services.market.stock_price_service import StockPriceService
from src.services.shared.query_names import QUERY_NAMES
from src.services.shared.query_service import QueryService


def _service_with_rows(
    rows: list[dict[str, object]],
) -> tuple[StockPriceService, MagicMock]:
    query_service = MagicMock(spec=QueryService)
    query_service.execute_query.return_value = rows
    return StockPriceService(MagicMock(), query_service), query_service


def test_get_dma_history_coerces_rows_and_preserves_null_dma() -> None:
    service, query_service = _service_with_rows(
        [
            {
                "snapshot_date": datetime(2026, 4, 29, 12),
                "price_usd": "510.5",
                "dma_200": None,
                "is_above_dma": None,
            },
            {
                "snapshot_date": "2026-04-30",
                "price_usd": 511.0,
                "dma_200": 480.0,
                "is_above_dma": 1,
            },
        ]
    )

    result = service.get_dma_history(date(2026, 4, 1), date(2026, 4, 30))

    assert result == {
        date(2026, 4, 29): {
            "price_usd": 510.5,
            "dma_200": None,
            "is_above_dma": None,
        },
        date(2026, 4, 30): {
            "price_usd": 511.0,
            "dma_200": 480.0,
            "is_above_dma": True,
        },
    }
    query_service.execute_query.assert_called_once_with(
        service.db,
        QUERY_NAMES.STOCK_PRICE_DMA_HISTORY,
        {"start_date": date(2026, 4, 1), "end_date": date(2026, 4, 30)},
    )


def test_get_dma_history_rejects_invalid_snapshot_date() -> None:
    service, _ = _service_with_rows(
        [{"snapshot_date": object(), "price_usd": 511.0, "dma_200": 480.0}]
    )

    with pytest.raises(ValueError, match="Invalid snapshot_date"):
        service.get_dma_history(date(2026, 4, 1), date(2026, 4, 30))


@pytest.mark.parametrize(
    ("field_name", "row", "message"),
    [
        (
            "price_usd",
            {"snapshot_date": date(2026, 4, 29), "price_usd": 0.0},
            "price_usd must be positive",
        ),
        (
            "price_usd",
            {"snapshot_date": date(2026, 4, 29), "price_usd": "not-a-number"},
            "Invalid price_usd value",
        ),
        (
            "dma_200",
            {
                "snapshot_date": date(2026, 4, 29),
                "price_usd": 511.0,
                "dma_200": float("inf"),
            },
            "dma_200 must be positive",
        ),
    ],
)
def test_get_dma_history_rejects_invalid_numeric_fields(
    field_name: str,
    row: dict[str, object],
    message: str,
) -> None:
    service, _ = _service_with_rows([row])

    with pytest.raises(ValueError, match=message):
        service.get_dma_history(date(2026, 4, 1), date(2026, 4, 30))


def test_get_dma_history_reraises_query_failure() -> None:
    query_service = MagicMock(spec=QueryService)
    query_service.execute_query.side_effect = RuntimeError("db down")
    service = StockPriceService(MagicMock(), query_service)

    with pytest.raises(RuntimeError, match="db down"):
        service.get_dma_history(date(2026, 4, 1), date(2026, 4, 30), symbol="QQQ")
