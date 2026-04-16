"""
Unit tests for WalletService without database dependency.

Provides comprehensive coverage using mocked QueryService to avoid
PostgreSQL fixture requirements.
"""

from typing import Any
from unittest.mock import Mock

from src.services.portfolio.wallet_service import WalletService
from src.services.shared.value_objects import WalletCategoryBreakdown


class MockQueryService:
    """Mock QueryService for unit testing WalletService."""

    def __init__(self, rows: list[dict[str, Any]] | None = None):
        self._rows = rows if rows is not None else []
        self.call_count = 0
        self.last_query_name: str | None = None
        self.last_params: dict[str, Any] | None = None

    def execute_query(
        self, db: Any, query_name: str, params: dict[str, Any] | None = None
    ) -> list[dict[str, Any]]:
        """Record query details and return configured rows."""
        self.call_count += 1
        self.last_query_name = query_name
        self.last_params = params
        return self._rows

    def execute_query_one(self, *_args: Any, **_kwargs: Any) -> dict[str, Any] | None:
        return None


class TestWalletServiceInit:
    """Test WalletService initialization."""

    def test_init_with_query_service(self) -> None:
        """Test that WalletService initializes with a query service."""
        query_service = MockQueryService()
        service = WalletService(query_service)
        assert service.query_service is query_service

    def test_init_stores_query_service_reference(self) -> None:
        """Test that query_service reference is correctly stored."""
        query_service = MockQueryService([{"foo": "bar"}])
        service = WalletService(query_service)
        assert service.query_service._rows == [{"foo": "bar"}]


class TestGetWalletTokenSummary:
    """Tests for get_wallet_token_summary method."""

    def test_returns_wallet_aggregate_with_categories(self) -> None:
        """Test that method returns WalletAggregate with proper categories."""
        mock_data = [
            {
                "wallet_address": "0xABC",
                "category": "btc",
                "category_value": 100.0,
                "token_count": 1,
                "percentage": 40.0,
            },
            {
                "wallet_address": "0xABC",
                "category": "eth",
                "category_value": 150.0,
                "token_count": 2,
                "percentage": 60.0,
            },
        ]
        query_service = MockQueryService(mock_data)
        service = WalletService(query_service)
        db = Mock()

        result = service.get_wallet_token_summary(db, "0xABC")

        assert result.total_value == 250.0
        assert result.token_count == 3
        assert result.categories["btc"].value == 100.0
        assert result.categories["btc"].percentage == 40.0
        assert result.categories["eth"].value == 150.0
        assert result.categories["eth"].percentage == 60.0

    def test_empty_wallet_returns_zero_totals(self) -> None:
        """Test that empty query result returns zero totals."""
        query_service = MockQueryService([])
        service = WalletService(query_service)
        db = Mock()

        result = service.get_wallet_token_summary(db, "0xEmpty")

        assert result.total_value == 0.0
        assert result.token_count == 0
        # Categories should be initialized but empty
        assert isinstance(result.categories["btc"], WalletCategoryBreakdown)
        assert result.categories["btc"].value == 0.0

    def test_unknown_category_is_ignored(self) -> None:
        """Test that unknown categories are handled gracefully."""
        mock_data = [
            {
                "wallet_address": "0xABC",
                "category": "unknown_category",
                "category_value": 50.0,
                "token_count": 1,
                "percentage": 100.0,
            },
        ]
        query_service = MockQueryService(mock_data)
        service = WalletService(query_service)
        db = Mock()

        result = service.get_wallet_token_summary(db, "0xABC")

        # Value is still accumulated in totals
        assert result.total_value == 50.0
        assert result.token_count == 1
        # But standard categories remain at 0
        assert result.categories["btc"].value == 0.0
        assert result.categories["eth"].value == 0.0

    def test_stablecoins_category(self) -> None:
        """Test stablecoins category is correctly processed."""
        mock_data = [
            {
                "wallet_address": "0xABC",
                "category": "stablecoins",
                "category_value": 1000.0,
                "token_count": 3,
                "percentage": 100.0,
            },
        ]
        query_service = MockQueryService(mock_data)
        service = WalletService(query_service)
        db = Mock()

        result = service.get_wallet_token_summary(db, "0xABC")

        assert result.categories["stablecoins"].value == 1000.0
        assert result.categories["stablecoins"].percentage == 100.0

    def test_others_category(self) -> None:
        """Test 'others' category is correctly processed."""
        mock_data = [
            {
                "wallet_address": "0xABC",
                "category": "others",
                "category_value": 500.0,
                "token_count": 5,
                "percentage": 50.0,
            },
        ]
        query_service = MockQueryService(mock_data)
        service = WalletService(query_service)
        db = Mock()

        result = service.get_wallet_token_summary(db, "0xABC")

        assert result.categories["others"].value == 500.0
        assert result.categories["others"].percentage == 50.0

    def test_calls_correct_query(self) -> None:
        """Test that the correct query name and params are used."""
        query_service = MockQueryService([])
        service = WalletService(query_service)
        db = Mock()
        wallet_address = "0xTestWallet"

        service.get_wallet_token_summary(db, wallet_address)

        assert query_service.last_query_name == "get_wallet_token_categories"
        assert query_service.last_params == {"wallet_address": wallet_address.lower()}

    def test_missing_percentage_defaults_to_zero(self) -> None:
        """Test that missing percentage field defaults to 0.0."""
        mock_data = [
            {
                "wallet_address": "0xABC",
                "category": "btc",
                "category_value": 100.0,
                "token_count": 1,
                # percentage is missing
            },
        ]
        query_service = MockQueryService(mock_data)
        service = WalletService(query_service)
        db = Mock()

        result = service.get_wallet_token_summary(db, "0xABC")

        assert result.categories["btc"].percentage == 0.0

    def test_null_percentage_defaults_to_zero(self) -> None:
        """Test that null percentage field defaults to 0.0."""
        mock_data = [
            {
                "wallet_address": "0xABC",
                "category": "btc",
                "category_value": 100.0,
                "token_count": 1,
                "percentage": None,
            },
        ]
        query_service = MockQueryService(mock_data)
        service = WalletService(query_service)
        db = Mock()

        result = service.get_wallet_token_summary(db, "0xABC")

        assert result.categories["btc"].percentage == 0.0

    def test_multiple_categories_accumulate_correctly(self) -> None:
        """Test all four categories with proper accumulation."""
        mock_data = [
            {
                "wallet_address": "0x1",
                "category": "btc",
                "category_value": 100.0,
                "token_count": 1,
                "percentage": 25.0,
            },
            {
                "wallet_address": "0x1",
                "category": "eth",
                "category_value": 100.0,
                "token_count": 1,
                "percentage": 25.0,
            },
            {
                "wallet_address": "0x1",
                "category": "stablecoins",
                "category_value": 100.0,
                "token_count": 1,
                "percentage": 25.0,
            },
            {
                "wallet_address": "0x1",
                "category": "others",
                "category_value": 100.0,
                "token_count": 1,
                "percentage": 25.0,
            },
        ]
        query_service = MockQueryService(mock_data)
        service = WalletService(query_service)
        db = Mock()

        result = service.get_wallet_token_summary(db, "0x1")

        assert result.total_value == 400.0
        assert result.token_count == 4
        for category in ["btc", "eth", "stablecoins", "others"]:
            assert result.categories[category].value == 100.0
            assert result.categories[category].percentage == 25.0


class TestGetWalletTokenSummariesBatch:
    """Tests for get_wallet_token_summaries_batch method."""

    def test_empty_wallet_list_returns_empty_dict(self) -> None:
        """Test that empty wallet list returns empty dictionary."""
        query_service = MockQueryService([])
        service = WalletService(query_service)
        db = Mock()

        result = service.get_wallet_token_summaries_batch(db, [])

        assert result == {}
        # Query should NOT be called for empty wallet list
        assert query_service.call_count == 0

    def test_single_wallet_returns_correct_summary(self) -> None:
        """Test batch with single wallet returns correct summary."""
        mock_data = [
            {
                "wallet_address": "0xABC",
                "category": "btc",
                "category_value": 500.0,
                "token_count": 2,
                "percentage": 100.0,
            },
        ]
        query_service = MockQueryService(mock_data)
        service = WalletService(query_service)
        db = Mock()

        result = service.get_wallet_token_summaries_batch(db, ["0xABC"])

        assert "0xabc" in result
        assert result["0xabc"].total_value == 500.0
        assert result["0xabc"].token_count == 2

    def test_multiple_wallets_with_different_categories(self) -> None:
        """Test batch with multiple wallets returns separate summaries."""
        mock_data = [
            {
                "wallet_address": "0x111",
                "category": "btc",
                "category_value": 100.0,
                "token_count": 1,
                "percentage": 50.0,
            },
            {
                "wallet_address": "0x111",
                "category": "eth",
                "category_value": 100.0,
                "token_count": 1,
                "percentage": 50.0,
            },
            {
                "wallet_address": "0x222",
                "category": "stablecoins",
                "category_value": 500.0,
                "token_count": 3,
                "percentage": 100.0,
            },
        ]
        query_service = MockQueryService(mock_data)
        service = WalletService(query_service)
        db = Mock()

        result = service.get_wallet_token_summaries_batch(db, ["0x111", "0x222"])

        # Check wallet 0x111
        assert result["0x111"].total_value == 200.0
        assert result["0x111"].token_count == 2
        assert result["0x111"].categories["btc"].value == 100.0
        assert result["0x111"].categories["eth"].value == 100.0

        # Check wallet 0x222
        assert result["0x222"].total_value == 500.0
        assert result["0x222"].token_count == 3
        assert result["0x222"].categories["stablecoins"].value == 500.0

    def test_calls_correct_batch_query(self) -> None:
        """Test that the correct batch query is called with all addresses."""
        query_service = MockQueryService([])
        service = WalletService(query_service)
        db = Mock()
        addresses = ["0xA", "0xB", "0xC"]

        service.get_wallet_token_summaries_batch(db, addresses)

        assert query_service.last_query_name == "get_wallet_token_categories_batch"
        assert query_service.last_params == {
            "wallet_addresses": [addr.lower() for addr in addresses]
        }

    def test_wallets_not_in_result_have_zero_totals(self) -> None:
        """Test wallets with no data still appear with zero totals."""
        # Query returns data only for 0x111, not 0x222
        mock_data = [
            {
                "wallet_address": "0x111",
                "category": "btc",
                "category_value": 100.0,
                "token_count": 1,
                "percentage": 100.0,
            },
        ]
        query_service = MockQueryService(mock_data)
        service = WalletService(query_service)
        db = Mock()

        result = service.get_wallet_token_summaries_batch(db, ["0x111", "0x222"])

        # 0x222 should be in result with zero values
        assert "0x222" in result
        assert result["0x222"].total_value == 0.0
        assert result["0x222"].token_count == 0

    def test_ignores_unknown_wallet_addresses_in_result(self) -> None:
        """Test that extra wallet addresses in result (not in input) are ignored."""
        mock_data = [
            {
                "wallet_address": "0x111",
                "category": "btc",
                "category_value": 100.0,
                "token_count": 1,
                "percentage": 100.0,
            },
            {
                "wallet_address": "0xUnknown",
                "category": "btc",
                "category_value": 999.0,
                "token_count": 99,
                "percentage": 100.0,
            },
        ]
        query_service = MockQueryService(mock_data)
        service = WalletService(query_service)
        db = Mock()

        result = service.get_wallet_token_summaries_batch(db, ["0x111"])

        # Only requested wallet should be in result
        assert set(result.keys()) == {"0x111"}
        assert "0xUnknown" not in result

    def test_missing_percentage_defaults_to_zero(self) -> None:
        """Test that missing percentage defaults to 0.0 in batch mode."""
        mock_data = [
            {
                "wallet_address": "0x111",
                "category": "btc",
                "category_value": 100.0,
                "token_count": 1,
            },
        ]
        query_service = MockQueryService(mock_data)
        service = WalletService(query_service)
        db = Mock()

        result = service.get_wallet_token_summaries_batch(db, ["0x111"])

        assert result["0x111"].categories["btc"].percentage == 0.0

    def test_null_percentage_defaults_to_zero(self) -> None:
        """Test that null percentage defaults to 0.0 in batch mode."""
        mock_data = [
            {
                "wallet_address": "0x111",
                "category": "btc",
                "category_value": 100.0,
                "token_count": 1,
                "percentage": None,
            },
        ]
        query_service = MockQueryService(mock_data)
        service = WalletService(query_service)
        db = Mock()

        result = service.get_wallet_token_summaries_batch(db, ["0x111"])

        assert result["0x111"].categories["btc"].percentage == 0.0

    def test_unknown_category_in_batch_ignored(self) -> None:
        """Test that unknown categories don't break batch processing."""
        mock_data = [
            {
                "wallet_address": "0x111",
                "category": "btc",
                "category_value": 100.0,
                "token_count": 1,
                "percentage": 50.0,
            },
            {
                "wallet_address": "0x111",
                "category": "unknown",
                "category_value": 100.0,
                "token_count": 1,
                "percentage": 50.0,
            },
        ]
        query_service = MockQueryService(mock_data)
        service = WalletService(query_service)
        db = Mock()

        result = service.get_wallet_token_summaries_batch(db, ["0x111"])

        # BTC should be captured
        assert result["0x111"].categories["btc"].value == 100.0
        # Total should include both (unknown is still counted)
        assert result["0x111"].total_value == 200.0
        assert result["0x111"].token_count == 2

    def test_all_wallets_initialized_with_empty_categories(self) -> None:
        """Test that all requested wallets get proper WalletCategoryBreakdown objects."""
        query_service = MockQueryService([])
        service = WalletService(query_service)
        db = Mock()
        wallets = ["0x1", "0x2", "0x3"]

        result = service.get_wallet_token_summaries_batch(db, wallets)

        for wallet in wallets:
            assert wallet in result
            for category in ["btc", "eth", "stablecoins", "others"]:
                assert isinstance(
                    result[wallet].categories[category], WalletCategoryBreakdown
                )


class TestWalletServiceEdgeCases:
    """Edge case tests for WalletService."""

    def test_very_large_category_value(self) -> None:
        """Test handling of very large USD values."""
        mock_data = [
            {
                "wallet_address": "0xWhale",
                "category": "btc",
                "category_value": 999_999_999.99,
                "token_count": 1,
                "percentage": 100.0,
            },
        ]
        query_service = MockQueryService(mock_data)
        service = WalletService(query_service)
        db = Mock()

        result = service.get_wallet_token_summary(db, "0xWhale")

        assert result.total_value == 999_999_999.99
        assert result.categories["btc"].value == 999_999_999.99

    def test_very_small_category_value(self) -> None:
        """Test handling of very small (dust) USD values."""
        mock_data = [
            {
                "wallet_address": "0xDust",
                "category": "eth",
                "category_value": 0.000001,
                "token_count": 1,
                "percentage": 100.0,
            },
        ]
        query_service = MockQueryService(mock_data)
        service = WalletService(query_service)
        db = Mock()

        result = service.get_wallet_token_summary(db, "0xDust")

        assert result.total_value == 0.000001
        assert result.categories["eth"].value == 0.000001

    def test_zero_token_count(self) -> None:
        """Test handling of zero token count."""
        mock_data = [
            {
                "wallet_address": "0xZero",
                "category": "btc",
                "category_value": 0.0,
                "token_count": 0,
                "percentage": 0.0,
            },
        ]
        query_service = MockQueryService(mock_data)
        service = WalletService(query_service)
        db = Mock()

        result = service.get_wallet_token_summary(db, "0xZero")

        assert result.total_value == 0.0
        assert result.token_count == 0

    def test_high_token_count(self) -> None:
        """Test handling of high token counts."""
        mock_data = [
            {
                "wallet_address": "0xDegen",
                "category": "others",
                "category_value": 1000.0,
                "token_count": 500,
                "percentage": 100.0,
            },
        ]
        query_service = MockQueryService(mock_data)
        service = WalletService(query_service)
        db = Mock()

        result = service.get_wallet_token_summary(db, "0xDegen")

        assert result.token_count == 500

    def test_batch_with_many_wallets(self) -> None:
        """Test batch processing with many wallets."""
        wallet_count = 50
        wallets = [f"0x{i:040x}" for i in range(wallet_count)]
        mock_data = [
            {
                "wallet_address": wallet,
                "category": "btc",
                "category_value": float(i),
                "token_count": 1,
                "percentage": 100.0,
            }
            for i, wallet in enumerate(wallets)
        ]
        query_service = MockQueryService(mock_data)
        service = WalletService(query_service)
        db = Mock()

        result = service.get_wallet_token_summaries_batch(db, wallets)

        assert len(result) == wallet_count
        for i, wallet in enumerate(wallets):
            assert result[wallet].total_value == float(i)
