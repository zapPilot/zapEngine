from __future__ import annotations

from types import SimpleNamespace

import pytest
from pydantic import BaseModel

from src.services.backtesting import public_params
from src.services.backtesting.constants import (
    STRATEGY_DMA_FGI_PORTFOLIO_RULES,
)


class _CustomPublicParams(BaseModel):
    foo: int = 1


def _public_param_paths(model: type[BaseModel]) -> set[tuple[str, ...]]:
    paths: set[tuple[str, ...]] = set()
    for field_name, field_info in model.model_fields.items():
        annotation = field_info.annotation
        if isinstance(annotation, type) and issubclass(annotation, BaseModel):
            paths.update(
                (field_name, nested_field_name)
                for nested_field_name in annotation.model_fields
            )
            continue
        paths.add((field_name,))
    return paths


def test_dma_field_mapping_covers_all_public_params() -> None:
    expected_paths = _public_param_paths(public_params.DmaGatedFgiPublicParams)
    mapped_paths = {path for _, path in public_params._DMA_FIELD_MAPPING}

    assert mapped_paths == expected_paths


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
            "overextension_threshold_multiplier_greed": 0.67,
            "overextension_threshold_multiplier_extreme_greed": 0.50,
            "fgi_slope_reversal_threshold": -0.07,
            "fgi_slope_recovery_threshold": 0.06,
            "cross_up_fgi_slope_min": 0.0,
            "cross_up_drawdown_amplifier_alpha": 0.5,
            "cross_up_drawdown_amplifier_threshold": 0.15,
            "disabled_rules": ["cross_down_exit"],
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
        "overextension_threshold_multiplier_greed": 0.67,
        "overextension_threshold_multiplier_extreme_greed": 0.50,
        "fgi_slope_reversal_threshold": -0.07,
        "fgi_slope_recovery_threshold": 0.06,
    }
    assert nested["cross_up"] == {
        "fgi_slope_min": 0.0,
        "drawdown_amplifier_alpha": 0.5,
        "drawdown_amplifier_threshold": 0.15,
    }
    assert nested["disabled_rules"] == ["cross_down_exit"]


def test_dma_public_params_round_trip_cross_up_filters() -> None:
    runtime = public_params.public_params_to_runtime_params(
        STRATEGY_DMA_FGI_PORTFOLIO_RULES,
        {
            "cross_up": {
                "fgi_slope_min": 0.05,
                "drawdown_amplifier_alpha": 1.0,
                "drawdown_amplifier_threshold": 0.25,
            }
        },
    )

    assert runtime["cross_up_fgi_slope_min"] == 0.05
    assert runtime["cross_up_drawdown_amplifier_alpha"] == 1.0
    assert runtime["cross_up_drawdown_amplifier_threshold"] == 0.25

    nested = public_params.runtime_params_to_public_params(
        STRATEGY_DMA_FGI_PORTFOLIO_RULES,
        runtime,
    )

    assert nested["cross_up"] == {
        "fgi_slope_min": 0.05,
        "drawdown_amplifier_alpha": 1.0,
        "drawdown_amplifier_threshold": 0.25,
    }


def test_dma_public_params_round_trip_overextension_multipliers() -> None:
    runtime = public_params.public_params_to_runtime_params(
        STRATEGY_DMA_FGI_PORTFOLIO_RULES,
        {
            "top_escape": {
                "overextension_threshold_multiplier_greed": 0.67,
                "overextension_threshold_multiplier_extreme_greed": 0.50,
            }
        },
    )

    assert runtime["overextension_threshold_multiplier_greed"] == 0.67
    assert runtime["overextension_threshold_multiplier_extreme_greed"] == 0.50

    nested = public_params.runtime_params_to_public_params(
        STRATEGY_DMA_FGI_PORTFOLIO_RULES,
        runtime,
    )

    assert nested["top_escape"] == {
        "dma_overextension_threshold": 0.30,
        "overextension_threshold_multiplier_greed": 0.67,
        "overextension_threshold_multiplier_extreme_greed": 0.50,
        "fgi_slope_reversal_threshold": -0.05,
        "fgi_slope_recovery_threshold": 0.05,
    }


def test_dma_public_params_round_trip_disabled_portfolio_rules() -> None:
    runtime = public_params.public_params_to_runtime_params(
        STRATEGY_DMA_FGI_PORTFOLIO_RULES,
        {"disabled_rules": ["spy_latch"]},
    )

    assert runtime["disabled_rules"] == ["spy_latch"]

    nested = public_params.runtime_params_to_public_params(
        STRATEGY_DMA_FGI_PORTFOLIO_RULES,
        runtime,
    )

    assert nested["disabled_rules"] == ["spy_latch"]


def test_normalize_saved_strategy_public_params_rejects_unknown_portfolio_rule() -> (
    None
):
    with pytest.raises(
        ValueError, match="Unsupported portfolio rule names: not_a_rule"
    ):
        public_params.normalize_saved_strategy_public_params(
            STRATEGY_DMA_FGI_PORTFOLIO_RULES,
            {"disabled_rules": ["not_a_rule"]},
        )


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
