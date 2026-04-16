"""Tests for ATHTracker component."""

from __future__ import annotations

from datetime import date
from unittest.mock import Mock

import pytest

from src.services.backtesting.constants import ATH_OVERRIDE_COOLDOWN_DAYS
from src.services.backtesting.execution.ath_tracker import ATHTracker
from src.services.backtesting.strategies.base import StrategyContext


@pytest.fixture
def mock_portfolio() -> Mock:
    """Create a mock portfolio."""
    portfolio = Mock()
    portfolio.total_value = Mock(return_value=10000.0)
    return portfolio


@pytest.fixture
def tracker() -> ATHTracker:
    """Create an ATHTracker instance with default settings."""
    return ATHTracker()


class TestInitialize:
    """Tests for ATHTracker.initialize()."""

    def test_initialize_sets_values(self, tracker: ATHTracker) -> None:
        """Test that initialize() sets max values correctly."""
        tracker.initialize(price=5000.0, portfolio_value=10000.0)

        assert tracker.max_price_seen == 5000.0
        assert tracker.max_portfolio_value_seen == 10000.0
        assert tracker.last_override_date is None

    def test_initialize_from_context(
        self, tracker: ATHTracker, mock_portfolio: Mock
    ) -> None:
        """Test that initialize_from_context() extracts values correctly."""
        context = StrategyContext(
            date=date(2025, 1, 1),
            price=5000.0,
            sentiment={"label": "neutral"},
            price_history=[5000.0],
            portfolio=mock_portfolio,
        )

        tracker.initialize_from_context(context)

        assert tracker.max_price_seen == 5000.0
        assert tracker.max_portfolio_value_seen == 10000.0


class TestCheckTokenATH:
    """Tests for ATHTracker.check_token_ath()."""

    def test_new_ath_detected(self, tracker: ATHTracker) -> None:
        """Test that new ATH is detected when price exceeds max."""
        tracker.initialize(price=5000.0, portfolio_value=10000.0)

        result = tracker.check_token_ath(5500.0)

        assert result is True
        assert tracker.max_price_seen == 5500.0

    def test_no_ath_when_price_equals_max(self, tracker: ATHTracker) -> None:
        """Test that ATH is not detected when price equals max."""
        tracker.initialize(price=5000.0, portfolio_value=10000.0)

        result = tracker.check_token_ath(5000.0)

        assert result is False
        assert tracker.max_price_seen == 5000.0

    def test_no_ath_when_price_below_max(self, tracker: ATHTracker) -> None:
        """Test that ATH is not detected when price is below max."""
        tracker.initialize(price=5000.0, portfolio_value=10000.0)

        result = tracker.check_token_ath(4500.0)

        assert result is False
        assert tracker.max_price_seen == 5000.0  # Max unchanged

    def test_consecutive_aths(self, tracker: ATHTracker) -> None:
        """Test consecutive ATH detection."""
        tracker.initialize(price=100.0, portfolio_value=10000.0)

        assert tracker.check_token_ath(110.0) is True
        assert tracker.max_price_seen == 110.0

        assert tracker.check_token_ath(120.0) is True
        assert tracker.max_price_seen == 120.0

        assert tracker.check_token_ath(115.0) is False  # Drop, no ATH
        assert tracker.max_price_seen == 120.0  # Max unchanged


class TestCheckPortfolioATH:
    """Tests for ATHTracker.check_portfolio_ath()."""

    def test_new_ath_detected(self, tracker: ATHTracker) -> None:
        """Test that new ATH is detected when portfolio value exceeds max."""
        tracker.initialize(price=5000.0, portfolio_value=10000.0)

        result = tracker.check_portfolio_ath(10500.0)

        assert result is True
        assert tracker.max_portfolio_value_seen == 10500.0

    def test_no_ath_when_value_equals_max(self, tracker: ATHTracker) -> None:
        """Test that ATH is not detected when portfolio value equals max."""
        tracker.initialize(price=5000.0, portfolio_value=10000.0)

        result = tracker.check_portfolio_ath(10000.0)

        assert result is False
        assert tracker.max_portfolio_value_seen == 10000.0

    def test_no_ath_when_value_below_max(self, tracker: ATHTracker) -> None:
        """Test that ATH is not detected when portfolio value is below max."""
        tracker.initialize(price=5000.0, portfolio_value=10000.0)

        result = tracker.check_portfolio_ath(9500.0)

        assert result is False
        assert tracker.max_portfolio_value_seen == 10000.0


class TestProcessATHEvent:
    """Tests for ATHTracker.process_ath_event()."""

    def test_token_ath_only(self, tracker: ATHTracker, mock_portfolio: Mock) -> None:
        """Test detection of token ATH only."""
        tracker.initialize(price=5000.0, portfolio_value=10000.0)
        mock_portfolio.total_value = Mock(return_value=10000.0)  # No portfolio ATH

        context = StrategyContext(
            date=date(2025, 1, 2),
            price=5500.0,  # Token ATH
            sentiment={"label": "neutral"},
            price_history=[5000.0, 5500.0],
            portfolio=mock_portfolio,
        )

        result = tracker.process_ath_event(context)

        assert result == "token_ath"
        assert tracker.current_ath_event == "token_ath"

    def test_portfolio_ath_only(
        self, tracker: ATHTracker, mock_portfolio: Mock
    ) -> None:
        """Test detection of portfolio ATH only."""
        tracker.initialize(price=5000.0, portfolio_value=10000.0)
        mock_portfolio.total_value = Mock(return_value=10500.0)  # Portfolio ATH

        context = StrategyContext(
            date=date(2025, 1, 2),
            price=5000.0,  # No token ATH
            sentiment={"label": "neutral"},
            price_history=[5000.0, 5000.0],
            portfolio=mock_portfolio,
        )

        result = tracker.process_ath_event(context)

        assert result == "portfolio_ath"
        assert tracker.current_ath_event == "portfolio_ath"

    def test_both_ath(self, tracker: ATHTracker, mock_portfolio: Mock) -> None:
        """Test detection of both token and portfolio ATH."""
        tracker.initialize(price=5000.0, portfolio_value=10000.0)
        mock_portfolio.total_value = Mock(return_value=11000.0)  # Portfolio ATH

        context = StrategyContext(
            date=date(2025, 1, 2),
            price=5500.0,  # Token ATH
            sentiment={"label": "neutral"},
            price_history=[5000.0, 5500.0],
            portfolio=mock_portfolio,
        )

        result = tracker.process_ath_event(context)

        assert result == "both_ath"
        assert tracker.current_ath_event == "both_ath"

    def test_no_ath(self, tracker: ATHTracker, mock_portfolio: Mock) -> None:
        """Test when no ATH is detected."""
        tracker.initialize(price=5000.0, portfolio_value=10000.0)
        mock_portfolio.total_value = Mock(return_value=9500.0)  # No portfolio ATH

        context = StrategyContext(
            date=date(2025, 1, 2),
            price=4500.0,  # No token ATH
            sentiment={"label": "neutral"},
            price_history=[5000.0, 4500.0],
            portfolio=mock_portfolio,
        )

        result = tracker.process_ath_event(context)

        assert result is None
        assert tracker.current_ath_event is None


class TestIsOverrideAllowed:
    """Tests for ATHTracker.is_override_allowed()."""

    def test_allowed_when_no_previous_override(self, tracker: ATHTracker) -> None:
        """Test that override is allowed when there's no previous override."""
        tracker.initialize(price=5000.0, portfolio_value=10000.0)

        assert tracker.is_override_allowed(date(2025, 1, 1)) is True

    def test_allowed_after_cooldown_expired(self, tracker: ATHTracker) -> None:
        """Test that override is allowed after cooldown expires."""
        tracker.initialize(price=5000.0, portfolio_value=10000.0)
        tracker.last_override_date = date(2025, 1, 1)
        tracker.cooldown_days = 7

        # Day 8 - cooldown expired
        assert tracker.is_override_allowed(date(2025, 1, 8)) is True

    def test_not_allowed_during_cooldown(self, tracker: ATHTracker) -> None:
        """Test that override is not allowed during cooldown."""
        tracker.initialize(price=5000.0, portfolio_value=10000.0)
        tracker.last_override_date = date(2025, 1, 1)
        tracker.cooldown_days = 7

        # Day 5 - still in cooldown
        assert tracker.is_override_allowed(date(2025, 1, 5)) is False

    def test_allowed_on_exact_cooldown_day(self, tracker: ATHTracker) -> None:
        """Test that override is allowed on the exact day cooldown expires."""
        tracker.initialize(price=5000.0, portfolio_value=10000.0)
        tracker.last_override_date = date(2025, 1, 1)
        tracker.cooldown_days = 7

        # Exactly 7 days later
        assert tracker.is_override_allowed(date(2025, 1, 8)) is True


class TestATHCooldownActive:
    """Tests for lines 71-74: ATH detected but cooldown active → debug log."""

    def test_ath_detected_during_cooldown_logs_and_still_returns_event(
        self,
        tracker: ATHTracker,
        mock_portfolio: Mock,
        caplog: pytest.LogCaptureFixture,
    ) -> None:
        """Lines 71-74: when ATH fires but cooldown is active, debug msg is logged."""
        import logging

        tracker.initialize(price=5000.0, portfolio_value=10000.0)
        # Simulate a previous override date so cooldown is active
        tracker.last_override_date = date(2025, 1, 1)
        tracker.cooldown_days = 30  # 30-day cooldown

        # Portfolio returns a new ATH value
        mock_portfolio.total_value = Mock(return_value=11000.0)

        context = StrategyContext(
            date=date(
                2025, 1, 5
            ),  # only 4 days after last override → still in cooldown
            price=5500.0,  # token ATH
            sentiment={"label": "neutral"},
            price_history=[5000.0, 5500.0],
            portfolio=mock_portfolio,
        )

        with caplog.at_level(
            logging.DEBUG, logger="src.services.backtesting.execution.ath_tracker"
        ):
            result = tracker.process_ath_event(context)

        assert result == "both_ath"
        assert any("cooldown active" in record.message for record in caplog.records)


class TestDefaultCooldownDays:
    """Tests for default cooldown days configuration."""

    def test_default_cooldown_matches_constant(self) -> None:
        """Test that default cooldown matches ATH_OVERRIDE_COOLDOWN_DAYS constant."""
        tracker = ATHTracker()

        assert tracker.cooldown_days == ATH_OVERRIDE_COOLDOWN_DAYS

    def test_custom_cooldown_days(self) -> None:
        """Test that custom cooldown days can be set."""
        tracker = ATHTracker(cooldown_days=14)

        assert tracker.cooldown_days == 14


class TestATHEventProperty:
    """Tests for current_ath_event property."""

    def test_initial_value_is_none(self, tracker: ATHTracker) -> None:
        """Test that initial ATH event is None."""
        assert tracker.current_ath_event is None

    def test_property_reflects_process_result(
        self, tracker: ATHTracker, mock_portfolio: Mock
    ) -> None:
        """Test that property reflects the result of process_ath_event()."""
        tracker.initialize(price=5000.0, portfolio_value=10000.0)
        mock_portfolio.total_value = Mock(return_value=10000.0)

        # No ATH
        context1 = StrategyContext(
            date=date(2025, 1, 1),
            price=4500.0,
            sentiment={"label": "neutral"},
            price_history=[5000.0, 4500.0],
            portfolio=mock_portfolio,
        )
        tracker.process_ath_event(context1)
        assert tracker.current_ath_event is None

        # Token ATH
        context2 = StrategyContext(
            date=date(2025, 1, 2),
            price=5500.0,
            sentiment={"label": "neutral"},
            price_history=[5000.0, 4500.0, 5500.0],
            portfolio=mock_portfolio,
        )
        tracker.process_ath_event(context2)
        assert tracker.current_ath_event == "token_ath"
