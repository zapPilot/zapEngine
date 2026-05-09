from __future__ import annotations

from types import SimpleNamespace

import pytest
from pydantic import BaseModel

from src.services.backtesting import public_params
from src.services.backtesting.constants import (
    STRATEGY_DMA_FGI_HIERARCHICAL_MINIMUM,
    STRATEGY_DMA_FGI_PORTFOLIO_RULES,
    STRATEGY_ETH_BTC_ROTATION,
)


class _CustomPublicParams(BaseModel):
    foo: int = 1


def test_unknown_strategy_public_param_helpers_return_raw_params() -> None:
    raw = {"free_form": "kept"}

    assert public_params.supports_nested_public_params("custom") is False
    assert public_params.normalize_nested_public_params("custom", raw) == raw
    assert public_params.public_params_to_runtime_params("custom", raw) == raw
    assert public_params.runtime_params_to_public_params("custom", raw) == raw
    assert public_params.normalize_saved_strategy_public_params("custom", raw) == raw


def test_dma_runtime_params_to_public_params_groups_sections() -> None:
    nested = public_params.runtime_params_to_public_params(
        STRATEGY_DMA_FGI_PORTFOLIO_RULES,
        {
            "cross_cooldown_days": 12,
            "cross_on_touch": False,
            "pacing_k": 3.0,
            "pacing_r_max": 0.8,
            "buy_sideways_window_days": 4,
            "buy_sideways_max_range": 0.03,
            "buy_leg_caps": [0.02, 0.04],
            "min_trade_interval_days": 3,
            "max_trades_7d": 2,
            "max_trades_30d": 6,
            "dma_overextension_threshold": 0.25,
            "fgi_slope_reversal_threshold": -0.07,
            "fgi_slope_recovery_threshold": 0.06,
        },
    )

    assert nested["signal"] == {"cross_cooldown_days": 12, "cross_on_touch": False}
    assert nested["trade_quota"] == {
        "min_trade_interval_days": 3,
        "max_trades_7d": 2,
        "max_trades_30d": 6,
    }
    assert nested["top_escape"] == {
        "dma_overextension_threshold": 0.25,
        "fgi_slope_reversal_threshold": -0.07,
        "fgi_slope_recovery_threshold": 0.06,
    }


def test_eth_btc_runtime_params_to_public_params_includes_rotation_section() -> None:
    nested = public_params.runtime_params_to_public_params(
        STRATEGY_ETH_BTC_ROTATION,
        {
            "ratio_cross_cooldown_days": 9,
            "rotation_neutral_band": 0.04,
            "rotation_max_deviation": 0.18,
            "rotation_drift_threshold": 0.02,
            "rotation_cooldown_days": 5,
        },
    )

    assert nested["signal"]["ratio_cross_cooldown_days"] == 9
    assert nested["rotation"] == {"drift_threshold": 0.02, "cooldown_days": 5}


def test_hierarchical_runtime_params_to_public_params_uses_rotation_contract() -> None:
    nested = public_params.runtime_params_to_public_params(
        STRATEGY_DMA_FGI_HIERARCHICAL_MINIMUM,
        {
            "rotation_neutral_band": 0.03,
            "rotation_max_deviation": 0.15,
            "rotation_drift_threshold": 0.01,
            "rotation_cooldown_days": 8,
        },
    )

    assert nested["signal"]["rotation_neutral_band"] == pytest.approx(0.03)
    assert nested["rotation"]["cooldown_days"] == 8


def test_public_param_helpers_return_normalized_payload_for_custom_family(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    recipe = SimpleNamespace(
        public_params_model=_CustomPublicParams,
        param_family="custom_family",
    )
    monkeypatch.setattr(public_params, "_get_recipe", lambda _strategy_id: recipe)

    assert public_params.public_params_to_runtime_params("custom", {"foo": 3}) == {
        "foo": 3
    }
    assert public_params.runtime_params_to_public_params("custom", {"bar": 4}) == {
        "bar": 4
    }
