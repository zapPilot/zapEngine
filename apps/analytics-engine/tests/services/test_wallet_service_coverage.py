"""Tests for WalletService coverage."""

from unittest.mock import Mock

from sqlalchemy.orm import Session

from src.services.portfolio.wallet_service import WalletService


class TestWalletServiceCoverage:
    def test_verify_wallet_ownership_true(self):
        """Test verify_wallet_ownership returns True when wallet exists."""
        query_service = Mock()
        wallet_service = WalletService(query_service)
        db = Mock(spec=Session)

        # Mock executed query result
        query_service.execute_query.return_value = [
            {"wallet_address": "0x123abc"},
            {"wallet_address": "0x456def"},
        ]

        result = wallet_service.verify_wallet_ownership(db, "user-uuid", "0x123abc")

        assert result is True
        query_service.execute_query.assert_called_once_with(
            db, "get_user_wallets", {"user_id": "user-uuid"}
        )

    def test_verify_wallet_ownership_false(self):
        """Test verify_wallet_ownership returns False when wallet does not exist."""
        query_service = Mock()
        wallet_service = WalletService(query_service)
        db = Mock(spec=Session)

        # Mock executed query result
        query_service.execute_query.return_value = [
            {"wallet_address": "0x123abc"},
        ]

        result = wallet_service.verify_wallet_ownership(db, "user-uuid", "0x999zzz")

        assert result is False
