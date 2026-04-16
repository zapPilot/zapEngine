"""
Tests for classify_token_category database function.

Validates that the token categorization function works correctly
in the test database environment.
"""

from sqlalchemy import text
from sqlalchemy.orm import Session


class TestClassifyTokenCategory:
    """Test suite for classify_token_category function."""

    def test_classify_btc_tokens(self, db_session: Session):
        """Test BTC token categorization."""
        btc_symbols = ["BTC", "WBTC", "TBTC", "renBTC", "btc", "wbtc"]

        for symbol in btc_symbols:
            result = db_session.execute(
                text("SELECT classify_token_category(:symbol) as category"),
                {"symbol": symbol},
            ).fetchone()

            assert result is not None
            assert result[0] == "btc", f"Expected 'btc' for {symbol}, got {result[0]}"

    def test_classify_eth_tokens(self, db_session: Session):
        """Test ETH token categorization."""
        eth_symbols = ["ETH", "WETH", "stETH", "rETH", "eth", "weth"]

        for symbol in eth_symbols:
            result = db_session.execute(
                text("SELECT classify_token_category(:symbol) as category"),
                {"symbol": symbol},
            ).fetchone()

            assert result is not None
            assert result[0] == "eth", f"Expected 'eth' for {symbol}, got {result[0]}"

    def test_classify_stablecoins(self, db_session: Session):
        """Test stablecoin categorization."""
        stablecoin_symbols = [
            "USDC",
            "USDT",
            "DAI",
            "BUSD",
            "TUSD",
            "USDP",
            "FRAX",
            "usdc",
            "dai",
        ]

        for symbol in stablecoin_symbols:
            result = db_session.execute(
                text("SELECT classify_token_category(:symbol) as category"),
                {"symbol": symbol},
            ).fetchone()

            assert result is not None
            assert result[0] == "stablecoins", (
                f"Expected 'stablecoins' for {symbol}, got {result[0]}"
            )

    def test_classify_other_tokens(self, db_session: Session):
        """Test other token categorization."""
        other_symbols = ["AAVE", "UNI", "LINK", "CRV", "SNX", "random_token"]

        for symbol in other_symbols:
            result = db_session.execute(
                text("SELECT classify_token_category(:symbol) as category"),
                {"symbol": symbol},
            ).fetchone()

            assert result is not None
            assert result[0] == "others", (
                f"Expected 'others' for {symbol}, got {result[0]}"
            )

    def test_classify_null_symbol(self, db_session: Session):
        """Test NULL symbol handling."""
        result = db_session.execute(
            text("SELECT classify_token_category(NULL) as category")
        ).fetchone()

        assert result is not None
        assert result[0] == "others"

    def test_classify_empty_symbol(self, db_session: Session):
        """Test empty string handling."""
        result = db_session.execute(
            text("SELECT classify_token_category(:symbol) as category"), {"symbol": ""}
        ).fetchone()

        assert result is not None
        assert result[0] == "others"

    def test_case_insensitivity(self, db_session: Session):
        """Test that categorization is case-insensitive."""
        test_cases = [
            ("ETH", "eth"),
            ("eth", "eth"),
            ("EtH", "eth"),
            ("USDC", "stablecoins"),
            ("usdc", "stablecoins"),
            ("UsDc", "stablecoins"),
        ]

        for symbol, expected_category in test_cases:
            result = db_session.execute(
                text("SELECT classify_token_category(:symbol) as category"),
                {"symbol": symbol},
            ).fetchone()

            assert result is not None
            assert result[0] == expected_category, (
                f"Expected '{expected_category}' for {symbol}, got {result[0]}"
            )
