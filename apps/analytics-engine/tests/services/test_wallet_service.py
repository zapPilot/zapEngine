"""
WalletService tests aligned with APR removal.

Covers token summary retrieval (single and batch) using mocked query results.
"""

from unittest.mock import patch

from sqlalchemy.orm import Session

from src.services.portfolio.wallet_service import WalletService
from src.services.shared.query_service import QueryService
from src.services.shared.value_objects import WalletCategoryBreakdown


def test_get_wallet_token_summary(db_session: Session, test_wallet_address: str):
    query_service = QueryService()
    wallet_service = WalletService(query_service)

    mock_category_data = [
        {
            "wallet_address": test_wallet_address,
            "category": "btc",
            "category_value": 100.0,
            "token_count": 1,
            "percentage": 43.48,
        },
        {
            "wallet_address": test_wallet_address,
            "category": "eth",
            "category_value": 80.0,
            "token_count": 1,
            "percentage": 34.78,
        },
        {
            "wallet_address": test_wallet_address,
            "category": "stablecoins",
            "category_value": 50.0,
            "token_count": 1,
            "percentage": 21.74,
        },
    ]

    with patch.object(query_service, "execute_query", return_value=mock_category_data):
        summary = wallet_service.get_wallet_token_summary(
            db_session, test_wallet_address
        )

    assert summary.total_value == 230.0
    assert summary.token_count == 3
    assert summary.categories["btc"].value == 100.0
    assert summary.categories["eth"].percentage == 34.78
    assert summary.categories["others"].value == 0.0


def test_get_wallet_token_summaries_batch(db_session: Session):
    query_service = QueryService()
    wallet_service = WalletService(query_service)

    wallet_addresses = ["0x1", "0x2"]
    mock_category_data = [
        {
            "wallet_address": "0x1",
            "category": "btc",
            "category_value": 100.0,
            "token_count": 1,
            "percentage": 50.0,
        },
        {
            "wallet_address": "0x1",
            "category": "eth",
            "category_value": 100.0,
            "token_count": 1,
            "percentage": 50.0,
        },
        {
            "wallet_address": "0x2",
            "category": "stablecoins",
            "category_value": 200.0,
            "token_count": 2,
            "percentage": 100.0,
        },
    ]

    with patch.object(query_service, "execute_query", return_value=mock_category_data):
        summaries = wallet_service.get_wallet_token_summaries_batch(
            db_session, wallet_addresses
        )

    assert set(summaries.keys()) == set(wallet_addresses)
    assert summaries["0x1"].total_value == 200.0
    assert summaries["0x2"].categories["stablecoins"].value == 200.0
    assert isinstance(summaries["0x2"].categories["btc"], WalletCategoryBreakdown)
