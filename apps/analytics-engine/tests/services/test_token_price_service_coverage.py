"""Tests for TokenPriceService coverage."""

from datetime import date, datetime
from unittest.mock import Mock, patch

import pytest
from sqlalchemy.orm import Session

from src.services.market.token_price_service import TokenPriceService


class TestTokenPriceServiceCoverage:
    def test_init_with_no_query_service(self):
        """Test TokenPriceService initialization with no query_service."""
        db = Mock(spec=Session)
        with patch("src.services.dependencies.get_query_service") as mock_get:
            mock_query_service = Mock()
            mock_get.return_value = mock_query_service

            service = TokenPriceService(db, query_service=None)

            assert service.query_service == mock_query_service
            mock_get.assert_called_once()

    def test_get_latest_price_error(self):
        """Test error handling in get_latest_price."""
        query_service = Mock()
        db = Mock(spec=Session)
        service = TokenPriceService(db, query_service)

        query_service.execute_query_one.side_effect = Exception("DB Error")

        with pytest.raises(Exception, match="DB Error"):
            service.get_latest_price("BTC")

    def test_get_price_for_date_error(self):
        """Test error handling in get_price_for_date."""
        query_service = Mock()
        db = Mock(spec=Session)
        service = TokenPriceService(db, query_service)

        query_service.execute_query_one.side_effect = Exception("DB Error")

        with pytest.raises(Exception, match="DB Error"):
            service.get_price_for_date("2024-01-01", "BTC")

    def test_get_snapshot_count_error(self):
        """Test error handling in get_snapshot_count."""
        query_service = Mock()
        db = Mock(spec=Session)
        service = TokenPriceService(db, query_service)

        query_service.execute_query_one.side_effect = Exception("DB Error")

        with pytest.raises(Exception, match="DB Error"):
            service.get_snapshot_count("BTC")


class TestCoerceDmaSnapshotDate:
    """Tests for _coerce_dma_snapshot_date — lines 62 and 66."""

    def test_datetime_input_returns_date(self):
        """Line 62: datetime input → returns .date()"""
        dt = datetime(2024, 3, 15, 10, 30, 0)
        result = TokenPriceService._coerce_dma_snapshot_date(dt)
        assert result == date(2024, 3, 15)

    def test_str_input_returns_date(self):
        """Line 66: str input → returns date.fromisoformat()"""
        result = TokenPriceService._coerce_dma_snapshot_date("2024-03-15")
        assert result == date(2024, 3, 15)

    def test_date_input_returns_same(self):
        """date input passes through unchanged."""
        d = date(2024, 3, 15)
        result = TokenPriceService._coerce_dma_snapshot_date(d)
        assert result == d

    def test_invalid_type_raises(self):
        """Invalid type raises ValueError."""
        with pytest.raises(ValueError):
            TokenPriceService._coerce_dma_snapshot_date(20240315)


class TestCoercePositiveFloat:
    """Tests for _coerce_positive_float — lines 75 and 90."""

    def test_none_raises_value_error(self):
        """Line 75: None input raises ValueError."""
        with pytest.raises(ValueError, match="Invalid price_usd value"):
            TokenPriceService._coerce_positive_float(
                None, date(2024, 1, 1), "price_usd"
            )

    def test_nan_raises_value_error(self):
        """Line 90: NaN raises ValueError."""
        with pytest.raises(ValueError, match="Invalid ratio_value value"):
            TokenPriceService._coerce_positive_float(
                float("nan"), date(2024, 1, 1), "ratio_value"
            )

    def test_inf_raises_value_error(self):
        """Line 90: Infinite value raises ValueError."""
        with pytest.raises(ValueError):
            TokenPriceService._coerce_positive_float(
                float("inf"), date(2024, 1, 1), "ratio_value"
            )

    def test_zero_raises_value_error(self):
        """Line 90: Zero raises ValueError (must be strictly positive)."""
        with pytest.raises(ValueError):
            TokenPriceService._coerce_positive_float(0.0, date(2024, 1, 1), "price_usd")

    def test_negative_raises_value_error(self):
        """Line 90: Negative value raises ValueError."""
        with pytest.raises(ValueError):
            TokenPriceService._coerce_positive_float(
                -1.0, date(2024, 1, 1), "price_usd"
            )

    def test_valid_positive_float_returns(self):
        """Valid positive float passes through."""
        result = TokenPriceService._coerce_positive_float(
            42500.0, date(2024, 1, 1), "price_usd"
        )
        assert result == 42500.0


class TestCoerceOptionalBool:
    """Tests for _coerce_optional_bool — lines 116, 120, 122."""

    def test_int_truthy_returns_true(self):
        """Line 116: non-zero int → True."""
        assert TokenPriceService._coerce_optional_bool(1) is True

    def test_int_falsy_returns_false(self):
        """Line 116: zero int → False."""
        assert TokenPriceService._coerce_optional_bool(0) is False

    def test_float_truthy_returns_true(self):
        """Line 116: non-zero float → True."""
        assert TokenPriceService._coerce_optional_bool(1.0) is True

    def test_string_true_variants(self):
        """Line 120: 't', 'true', '1' → True."""
        for val in ("t", "true", "True", "TRUE", "1", " true "):
            assert TokenPriceService._coerce_optional_bool(val) is True, (
                f"Expected True for {val!r}"
            )

    def test_string_false_variants(self):
        """Line 122: 'f', 'false', '0' → False."""
        for val in ("f", "false", "False", "FALSE", "0", " false "):
            assert TokenPriceService._coerce_optional_bool(val) is False, (
                f"Expected False for {val!r}"
            )

    def test_none_returns_none(self):
        """None → None."""
        assert TokenPriceService._coerce_optional_bool(None) is None

    def test_bool_passthrough(self):
        """bool values pass through unchanged."""
        assert TokenPriceService._coerce_optional_bool(True) is True
        assert TokenPriceService._coerce_optional_bool(False) is False

    def test_invalid_string_raises(self):
        """Unrecognised string raises ValueError."""
        with pytest.raises(ValueError):
            TokenPriceService._coerce_optional_bool("maybe")
