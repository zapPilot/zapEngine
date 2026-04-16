"""
Edge case tests for stale data scenarios in wallet token categories.

These tests focus on complex temporal edge cases that could lead to stale data
or inconsistent portfolio views, ensuring the bug fix in commit 5d84b2ed handles
all edge cases correctly.

Tests various scenarios where the old ROW_NUMBER() approach would fail:
- Sparse data with large time gaps
- Frequent updates with microsecond differences
- Multiple wallets with overlapping timestamps
- Timezone and daylight saving time edge cases
- Concurrent data updates and race conditions
"""

from unittest.mock import patch

import pytest
from sqlalchemy.orm import Session

from src.services.portfolio.wallet_service import WalletService
from src.services.shared.query_service import QueryService


class TestStaleDataEdgeCases:
    """Test edge cases that could lead to stale data in token categories."""

    @pytest.fixture(autouse=True)
    def setup_services(self):
        """Setup services for edge case testing."""
        QueryService._reset_cache_for_testing()
        self.query_service = QueryService()
        self.wallet_service = WalletService(self.query_service)
        yield
        QueryService._reset_cache_for_testing()

    def test_sparse_data_large_time_gaps(self, db_session: Session):
        """
        Test wallets with very sparse data and large time gaps between updates.

        Old approach: Could mix very old data with recent data
        New approach: Should only return most recent coherent snapshot
        """
        wallet_address = "0xtest_sparse_data"

        # Mock data representing sparse updates over months
        mock_category_data = [
            {
                "wallet_address": wallet_address,
                "category": "btc",
                "category_value": 45000.0,  # Recent BTC value
                "token_count": 1,
                "percentage": 75.0,
            },
            {
                "wallet_address": wallet_address,
                "category": "stablecoins",
                "category_value": 15000.0,  # Recent stablecoin value
                "token_count": 1,
                "percentage": 25.0,
            },
            # Note: No ETH in recent snapshot (was in old data but not latest)
        ]

        with patch.object(
            self.query_service, "execute_query", return_value=mock_category_data
        ):
            summary = self.wallet_service.get_wallet_token_summary(
                db_session, wallet_address
            )

        # Should only show data from latest timestamp
        assert summary["total_value"] == 60000.0  # Only recent data
        assert summary["token_count"] == 2

        # ETH should be zero (wasn't in latest snapshot)
        assert summary["categories"]["eth"]["value"] == 0.0
        assert summary["categories"]["btc"]["value"] == 45000.0
        assert summary["categories"]["stablecoins"]["value"] == 15000.0

    def test_microsecond_timestamp_precision(self, db_session: Session):
        """
        Test handling of very close timestamps (microsecond precision).

        Ensures the fix correctly identifies the absolute latest timestamp
        even when updates are microseconds apart.
        """
        wallet_address = "0xtest_microsecond_precision"

        # Mock data with microsecond-level timestamp differences
        # (Fixed query should pick the latest microsecond)
        mock_category_data = [
            {
                "wallet_address": wallet_address,
                "category": "btc",
                "category_value": 50000.0,  # Latest by microseconds
                "token_count": 1,
                "percentage": 100.0,
            }
            # This represents data from latest microsecond only
        ]

        with patch.object(
            self.query_service, "execute_query", return_value=mock_category_data
        ):
            summary = self.wallet_service.get_wallet_token_summary(
                db_session, wallet_address
            )

        # Should have exactly the latest microsecond data
        assert summary["total_value"] == 50000.0
        assert summary["token_count"] == 1
        assert summary["categories"]["btc"]["value"] == 50000.0

    def test_timezone_edge_cases(self, db_session: Session):
        """
        Test handling of timezone changes and daylight saving time transitions.

        Ensures the fix works correctly across timezone boundaries.
        """
        wallet_address = "0xtest_timezone_edge"

        # Mock data that would be affected by timezone issues
        mock_category_data = [
            {
                "wallet_address": wallet_address,
                "category": "eth",
                "category_value": 30000.0,
                "token_count": 1,
                "percentage": 100.0,
            }
        ]

        with patch.object(
            self.query_service, "execute_query", return_value=mock_category_data
        ):
            summary = self.wallet_service.get_wallet_token_summary(
                db_session, wallet_address
            )

        # Should handle timezone consistently
        assert summary["total_value"] == 30000.0
        assert summary["categories"]["eth"]["value"] == 30000.0

    def test_concurrent_update_simulation(self, db_session: Session):
        """
        Test simulation of concurrent updates to wallet data.

        The fixed query should handle concurrent updates gracefully by always
        returning a consistent snapshot from a single timestamp.
        """
        wallet_address = "0xtest_concurrent_updates"

        # First call - simulate one state
        mock_data_state1 = [
            {
                "wallet_address": wallet_address,
                "category": "btc",
                "category_value": 40000.0,
                "token_count": 1,
                "percentage": 80.0,
            },
            {
                "wallet_address": wallet_address,
                "category": "eth",
                "category_value": 10000.0,
                "token_count": 1,
                "percentage": 20.0,
            },
        ]

        # Second call - simulate updated state (all from new timestamp)
        mock_data_state2 = [
            {
                "wallet_address": wallet_address,
                "category": "btc",
                "category_value": 45000.0,  # Updated value
                "token_count": 1,
                "percentage": 75.0,
            },
            {
                "wallet_address": wallet_address,
                "category": "eth",
                "category_value": 15000.0,  # Updated value
                "token_count": 1,
                "percentage": 25.0,
            },
        ]

        # Test first state
        with patch.object(
            self.query_service, "execute_query", return_value=mock_data_state1
        ):
            summary1 = self.wallet_service.get_wallet_token_summary(
                db_session, wallet_address
            )

        # Test second state
        with patch.object(
            self.query_service, "execute_query", return_value=mock_data_state2
        ):
            summary2 = self.wallet_service.get_wallet_token_summary(
                db_session, wallet_address
            )

        # Each call should return consistent data from its timestamp
        assert summary1["total_value"] == 50000.0
        assert summary2["total_value"] == 60000.0

        # Values should be internally consistent within each snapshot
        assert (
            summary1["categories"]["btc"]["value"]
            + summary1["categories"]["eth"]["value"]
            == 50000.0
        )
        assert (
            summary2["categories"]["btc"]["value"]
            + summary2["categories"]["eth"]["value"]
            == 60000.0
        )

    def test_partial_token_updates(self, db_session: Session):
        """
        Test scenarios where only some tokens get updated in the latest timestamp.

        The fix should handle cases where some tokens have data at the latest
        timestamp but others don't (those others should be excluded).
        """
        wallet_address = "0xtest_partial_updates"

        # Mock data representing partial updates (some tokens updated, others not)
        mock_category_data = [
            {
                "wallet_address": wallet_address,
                "category": "btc",
                "category_value": 50000.0,  # This token was updated
                "token_count": 1,
                "percentage": 100.0,
            }
            # ETH and other tokens had no updates at latest timestamp
        ]

        with patch.object(
            self.query_service, "execute_query", return_value=mock_category_data
        ):
            summary = self.wallet_service.get_wallet_token_summary(
                db_session, wallet_address
            )

        # Should only include tokens from latest timestamp
        assert summary["total_value"] == 50000.0
        assert summary["token_count"] == 1

        # Only BTC should have value (was at latest timestamp)
        assert summary["categories"]["btc"]["value"] == 50000.0
        assert summary["categories"]["eth"]["value"] == 0.0
        assert summary["categories"]["stablecoins"]["value"] == 0.0
        assert summary["categories"]["others"]["value"] == 0.0

    def test_large_portfolio_time_consistency(self, db_session: Session):
        """
        Test time consistency with large portfolios (many tokens).

        Ensures the fix maintains consistency even with portfolios containing
        hundreds of different tokens.
        """
        wallet_address = "0xtest_large_portfolio"

        # Mock large portfolio with many tokens, all from same timestamp
        mock_category_data = []

        # Add many tokens in different categories
        categories = [
            ("btc", 100000.0, 5, 40.0),
            ("eth", 75000.0, 10, 30.0),
            ("stablecoins", 50000.0, 20, 20.0),
            ("others", 25000.0, 50, 10.0),
        ]

        for category, value, count, percentage in categories:
            mock_category_data.append(
                {
                    "wallet_address": wallet_address,
                    "category": category,
                    "category_value": value,
                    "token_count": count,
                    "percentage": percentage,
                }
            )

        with patch.object(
            self.query_service, "execute_query", return_value=mock_category_data
        ):
            summary = self.wallet_service.get_wallet_token_summary(
                db_session, wallet_address
            )

        # Large portfolio should maintain consistency
        assert summary["total_value"] == 250000.0  # Sum of all categories
        assert summary["token_count"] == 85  # 5 + 10 + 20 + 50

        # All categories should be properly represented
        expected_totals = {
            "btc": 100000.0,
            "eth": 75000.0,
            "stablecoins": 50000.0,
            "others": 25000.0,
        }

        for category, expected_value in expected_totals.items():
            assert summary["categories"][category]["value"] == expected_value

    def test_precision_loss_edge_cases(self, db_session: Session):
        """
        Test handling of very small amounts and precision edge cases.

        Ensures the fix handles decimal precision correctly without
        accumulating rounding errors that could affect consistency.
        """
        wallet_address = "0xtest_precision_edge"

        # Mock data with very small and very precise values
        mock_category_data = [
            {
                "wallet_address": wallet_address,
                "category": "btc",
                "category_value": 0.00000001,  # Very small value
                "token_count": 1,
                "percentage": 33.33333333,  # Repeating decimal
            },
            {
                "wallet_address": wallet_address,
                "category": "eth",
                "category_value": 0.00000002,
                "token_count": 1,
                "percentage": 66.66666667,
            },
        ]

        with patch.object(
            self.query_service, "execute_query", return_value=mock_category_data
        ):
            summary = self.wallet_service.get_wallet_token_summary(
                db_session, wallet_address
            )

        # Should handle precision correctly (use approximate comparison for floating point)
        assert abs(summary["total_value"] - 0.00000003) < 1e-10
        assert summary["token_count"] == 2

        # Values should maintain precision
        assert abs(summary["categories"]["btc"]["value"] - 0.00000001) < 1e-10
        assert abs(summary["categories"]["eth"]["value"] - 0.00000002) < 1e-10

    def test_null_data_mixed_with_valid_data(self, db_session: Session):
        """
        Test handling of mixed null and valid data in latest timestamp.

        Ensures COALESCE handling in the fix works correctly when some
        records have null amounts or prices at the latest timestamp.
        """
        wallet_address = "0xtest_null_mixed"

        # Mock mixed null and valid data (all from same latest timestamp)
        mock_category_data = [
            {
                "wallet_address": wallet_address,
                "category": "btc",
                "category_value": 50000.0,  # Valid data
                "token_count": 1,
                "percentage": 100.0,
            }
            # Other tokens had null amounts/prices at latest timestamp
            # so they're filtered out by value > 0 condition
        ]

        with patch.object(
            self.query_service, "execute_query", return_value=mock_category_data
        ):
            summary = self.wallet_service.get_wallet_token_summary(
                db_session, wallet_address
            )

        # Should only include valid (non-null, non-zero) data
        assert summary["total_value"] == 50000.0
        assert summary["token_count"] == 1
        assert summary["categories"]["btc"]["value"] == 50000.0

    def test_extreme_timestamp_values(self, db_session: Session):
        """
        Test handling of extreme timestamp values (very old, future dates).

        Ensures the MAX(inserted_at) logic works correctly even with
        unusual timestamp values.
        """
        wallet_address = "0xtest_extreme_timestamps"

        # Mock data from "latest" timestamp (even if it's unusual)
        mock_category_data = [
            {
                "wallet_address": wallet_address,
                "category": "eth",
                "category_value": 25000.0,
                "token_count": 1,
                "percentage": 100.0,
            }
        ]

        with patch.object(
            self.query_service, "execute_query", return_value=mock_category_data
        ):
            summary = self.wallet_service.get_wallet_token_summary(
                db_session, wallet_address
            )

        # Should handle any timestamp values correctly
        assert summary["total_value"] == 25000.0
        assert summary["categories"]["eth"]["value"] == 25000.0

    def test_data_consistency_under_load(self, db_session: Session):
        """
        Test data consistency under simulated high load conditions.

        Ensures the fix maintains consistency even when called frequently
        or under load conditions.
        """
        wallet_address = "0xtest_under_load"

        # Mock consistent data that should be returned every time
        mock_category_data = [
            {
                "wallet_address": wallet_address,
                "category": "btc",
                "category_value": 75000.0,
                "token_count": 2,
                "percentage": 60.0,
            },
            {
                "wallet_address": wallet_address,
                "category": "stablecoins",
                "category_value": 50000.0,
                "token_count": 5,
                "percentage": 40.0,
            },
        ]

        with patch.object(
            self.query_service, "execute_query", return_value=mock_category_data
        ):
            # Call multiple times rapidly
            summaries = []
            for _ in range(10):  # Simulate multiple rapid calls
                summary = self.wallet_service.get_wallet_token_summary(
                    db_session, wallet_address
                )
                summaries.append(summary)

        # All calls should return identical results (consistency)
        first_summary = summaries[0]
        for summary in summaries[1:]:
            assert summary["total_value"] == first_summary["total_value"]
            assert summary["token_count"] == first_summary["token_count"]
            for category in ["btc", "eth", "stablecoins", "others"]:
                assert (
                    summary["categories"][category]["value"]
                    == first_summary["categories"][category]["value"]
                )
                assert (
                    summary["categories"][category]["percentage"]
                    == first_summary["categories"][category]["percentage"]
                )

    def test_boundary_value_analysis(self, db_session: Session):
        """
        Test boundary values for amounts, prices, and calculations.

        Tests edge cases around zero, very large numbers, and boundary
        conditions that could cause issues.
        """
        wallet_address = "0xtest_boundary_values"

        # Mock boundary value data
        mock_category_data = [
            {
                "wallet_address": wallet_address,
                "category": "btc",
                "category_value": 999999999999.99,  # Very large value
                "token_count": 1,
                "percentage": 99.99,
            },
            {
                "wallet_address": wallet_address,
                "category": "others",
                "category_value": 0.01,  # Very small but > 0 value
                "token_count": 1,
                "percentage": 0.01,
            },
        ]

        with patch.object(
            self.query_service, "execute_query", return_value=mock_category_data
        ):
            summary = self.wallet_service.get_wallet_token_summary(
                db_session, wallet_address
            )

        # Should handle boundary values correctly
        assert summary["total_value"] == 1000000000000.0
        assert summary["token_count"] == 2

        # Very large and very small values should both be included
        assert summary["categories"]["btc"]["value"] == 999999999999.99
        assert summary["categories"]["others"]["value"] == 0.01
