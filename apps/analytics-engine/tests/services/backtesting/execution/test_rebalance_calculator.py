"""Tests for two-bucket rebalance calculations."""

from __future__ import annotations

from unittest.mock import Mock

import pytest

from src.services.backtesting.execution.rebalance_calculator import RebalanceCalculator
from src.services.backtesting.strategies.base import StrategyContext


class TestCalculateDeltas:
    def test_basic_delta_calculation(self) -> None:
        result = RebalanceCalculator.calculate_deltas(
            total_value=10_000.0,
            target_allocation={"spot": 0.6, "stable": 0.4},
            current_values={"spot": 5_000.0, "stable": 5_000.0},
        )
        assert result == {
            "spot": pytest.approx(1_000.0),
            "stable": pytest.approx(-1_000.0),
        }

    def test_missing_current_values_default_to_zero(self) -> None:
        result = RebalanceCalculator.calculate_deltas(
            total_value=10_000.0,
            target_allocation={"spot": 0.5, "stable": 0.5},
            current_values={"spot": 5_000.0},
        )
        assert result == {"spot": pytest.approx(0.0), "stable": pytest.approx(5_000.0)}


class TestCalculateDeltasFromContext:
    def test_extracts_values_from_context(self) -> None:
        mock_portfolio = Mock()
        mock_portfolio.total_value.return_value = 10_000.0
        mock_portfolio.bucket_values.return_value = {"spot": 5_000.0, "stable": 5_000.0}

        context = StrategyContext(
            date=Mock(),
            price=100.0,
            sentiment=None,
            price_history=[],
            portfolio=mock_portfolio,
        )

        result = RebalanceCalculator.calculate_deltas_from_context(
            context,
            target_allocation={"spot": 0.6, "stable": 0.4},
        )
        assert result == {
            "spot": pytest.approx(1_000.0),
            "stable": pytest.approx(-1_000.0),
        }


class TestCalculateCurrentAllocation:
    def test_basic_allocation_calculation(self) -> None:
        result = RebalanceCalculator.calculate_current_allocation(
            balances={"spot_balance": 1.0, "stable_balance": 5_000.0},
            price=5_000.0,
        )
        assert result == {"spot": pytest.approx(0.5), "stable": pytest.approx(0.5)}

    def test_zero_total_value_falls_back_to_stable(self) -> None:
        result = RebalanceCalculator.calculate_current_allocation(
            balances={"spot_balance": 0.0, "stable_balance": 0.0},
            price=5_000.0,
        )
        assert result == {"spot": 0.0, "stable": 1.0}


class TestCalculateCurrentAllocationFromContext:
    def test_uses_snapshot_balances(self) -> None:
        mock_portfolio = Mock()
        mock_portfolio.snapshot.return_value = {
            "spot_balance": 1.0,
            "stable_balance": 5_000.0,
        }

        context = StrategyContext(
            date=Mock(),
            price=5_000.0,
            sentiment=None,
            price_history=[],
            portfolio=mock_portfolio,
        )

        result = RebalanceCalculator.calculate_current_allocation_from_context(context)
        assert result == {"spot": pytest.approx(0.5), "stable": pytest.approx(0.5)}


class TestCalculateDrift:
    def test_basic_drift_calculation(self) -> None:
        result = RebalanceCalculator.calculate_drift(
            current={"spot": 0.6, "stable": 0.4},
            target={"spot": 0.5, "stable": 0.5},
        )
        assert result == pytest.approx(0.1)

    def test_missing_keys_are_normalized(self) -> None:
        result = RebalanceCalculator.calculate_drift(
            current={"spot": 0.5},
            target={"spot": 0.5, "stable": 0.5},
        )
        assert result == pytest.approx(0.5)


class TestNormalizeTargetAllocation:
    def test_zero_total_with_stable_key(self) -> None:
        result = RebalanceCalculator._normalize_target_allocation(
            {"spot": 0.0, "stable": 0.0}
        )
        assert result["stable"] == 1.0
        assert result["spot"] == 0.0

    def test_zero_total_without_stable_key(self) -> None:
        result = RebalanceCalculator._normalize_target_allocation(
            {"spot": 0.0, "lp": 0.0}
        )
        assert result == {"stable": 1.0}


class TestCalculateDeltasFromContextNonDictValues:
    def test_non_dict_values_for_keys_falls_back(self) -> None:
        mock_portfolio = Mock()
        mock_portfolio.total_value.return_value = 10_000.0
        mock_portfolio.values_for_allocation_keys.return_value = "not_a_dict"
        mock_portfolio.bucket_values.return_value = {"spot": 5_000.0, "stable": 5_000.0}

        context = StrategyContext(
            date=Mock(),
            price=100.0,
            sentiment=None,
            price_history=[],
            portfolio=mock_portfolio,
        )

        result = RebalanceCalculator.calculate_deltas_from_context(
            context,
            target_allocation={"spot": 0.5, "stable": 0.5},
        )
        assert result == {
            "spot": pytest.approx(0.0),
            "stable": pytest.approx(0.0),
        }

    def test_no_values_for_keys_falls_back_to_bucket_values(self) -> None:
        mock_portfolio = Mock(spec=[])
        mock_portfolio.total_value = Mock(return_value=10_000.0)
        mock_portfolio.bucket_values = Mock(
            return_value={"spot": 5_000.0, "stable": 5_000.0}
        )

        context = StrategyContext(
            date=Mock(),
            price=100.0,
            sentiment=None,
            price_history=[],
            portfolio=mock_portfolio,
        )

        result = RebalanceCalculator.calculate_deltas_from_context(
            context,
            target_allocation={"spot": 0.5, "stable": 0.5},
        )
        assert result == {
            "spot": pytest.approx(0.0),
            "stable": pytest.approx(0.0),
        }


class TestCurrentAllocationFromContextEdgeCases:
    def test_with_bucket_values_and_no_target(self) -> None:
        mock_portfolio = Mock()
        mock_portfolio.bucket_values.return_value = {"spot": 5_000.0, "stable": 5_000.0}
        mock_portfolio.total_value.return_value = 10_000.0
        # Remove snapshot to force bucket_values path
        del mock_portfolio.snapshot

        context = StrategyContext(
            date=Mock(),
            price=100.0,
            sentiment=None,
            price_history=[],
            portfolio=mock_portfolio,
        )

        result = RebalanceCalculator.calculate_current_allocation_from_context(context)
        assert result["spot"] == pytest.approx(0.5)
        assert result["stable"] == pytest.approx(0.5)

    def test_non_dict_bucket_values_falls_back_to_snapshot(self) -> None:
        mock_portfolio = Mock()
        mock_portfolio.bucket_values.return_value = "not_a_dict"
        mock_portfolio.snapshot.return_value = {
            "spot_balance": 1.0,
            "stable_balance": 5_000.0,
        }

        context = StrategyContext(
            date=Mock(),
            price=5_000.0,
            sentiment=None,
            price_history=[],
            portfolio=mock_portfolio,
        )

        result = RebalanceCalculator.calculate_current_allocation_from_context(context)
        assert result["spot"] == pytest.approx(0.5)
        assert result["stable"] == pytest.approx(0.5)

    def test_with_target_allocation_and_non_dict_values(self) -> None:
        mock_portfolio = Mock()
        mock_portfolio.total_value.return_value = 10_000.0
        mock_portfolio.values_for_allocation_keys.return_value = "not_a_dict"
        mock_portfolio.bucket_values.return_value = {"spot": 5_000.0, "stable": 5_000.0}

        context = StrategyContext(
            date=Mock(),
            price=100.0,
            sentiment=None,
            price_history=[],
            portfolio=mock_portfolio,
        )

        result = RebalanceCalculator.calculate_current_allocation_from_context(
            context,
            target_allocation={"spot": 0.5, "stable": 0.5},
        )
        assert result["spot"] == pytest.approx(0.5)
        assert result["stable"] == pytest.approx(0.5)

    def test_with_target_allocation_and_no_values_for_keys(self) -> None:
        mock_portfolio = Mock(spec=[])
        mock_portfolio.total_value = Mock(return_value=10_000.0)
        mock_portfolio.bucket_values = Mock(
            return_value={"spot": 5_000.0, "stable": 5_000.0}
        )

        context = StrategyContext(
            date=Mock(),
            price=100.0,
            sentiment=None,
            price_history=[],
            portfolio=mock_portfolio,
        )

        result = RebalanceCalculator.calculate_current_allocation_from_context(
            context,
            target_allocation={"spot": 0.5, "stable": 0.5},
        )
        assert result["spot"] == pytest.approx(0.5)
        assert result["stable"] == pytest.approx(0.5)

    def test_price_map_resolved_for_snapshot_path(self) -> None:
        mock_portfolio = Mock()
        mock_portfolio.bucket_values.return_value = "not_a_dict"
        mock_portfolio.snapshot.return_value = {
            "spot_balance": 1.0,
            "stable_balance": 5_000.0,
        }

        context = StrategyContext(
            date=Mock(),
            price={"btc": 5_000.0},
            sentiment=None,
            price_history=[],
            portfolio=mock_portfolio,
        )

        result = RebalanceCalculator.calculate_current_allocation_from_context(context)
        assert result["spot"] == pytest.approx(0.5)
        assert result["stable"] == pytest.approx(0.5)
