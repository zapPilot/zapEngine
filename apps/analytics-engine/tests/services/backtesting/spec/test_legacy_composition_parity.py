"""Whatever the old rule composition could build, a spec can build, day for day.

A saved config used to be a recipe plus public params: ``enabled_rules`` (the
default rules when unset) minus ``disabled_rules`` picked rules out of a universe
of the six default rules, twelve research rules and the SPY latch; three trade
quota limits became a guard; two greed multipliers tuned the trim rule. The
cutover deletes all of that, so the spec format has to be able to say every
combination. Each one is built both ways here, run side by side through the
compare path the API uses, and every field of every day's state has to be
identical.

The one thing the two do not share is the *list* of rules in the trace: the old
strategy evaluates the rules it was not asked for too and reports them as
unmatched, a spec only has its own, and the old trace lists the SPY latch at its
priority among the rules while a spec lists it after them, where it applies.
Entries are compared by name for the rules the spec names.

A spec always has a deciding rule, so the combinations with none (an overlay
alone, or no rule at all) are out: such a strategy never trades.
"""

from __future__ import annotations

from dataclasses import replace
from typing import Any

import pytest

from src.config.strategy_presets import resolve_seed_strategy_config
from src.models.backtesting import BacktestResponse
from src.services.backtesting.lab.synthetic import Scenario, synthetic_market
from src.services.backtesting.portfolio_rules import (
    DEFAULT_PORTFOLIO_RULES,
    MINIMAL_BASELINE_PORTFOLIO_RULE_NAMES,
)
from src.services.backtesting.portfolio_rules.technical_experiments import (
    TECHNICAL_EXPERIMENT_RULES,
)
from src.services.backtesting.spec import StrategySpec
from src.services.backtesting.strategy_registry import (
    ResolvedSavedStrategyConfig,
    resolve_saved_strategy_config,
    resolve_spec_strategy_config,
)
from tests.services.backtesting.spec.helpers import spec_for_params
from tests.services.backtesting.support.synthetic_runs import (
    DEFAULT_CONFIG_ID,
    run_resolved_compare,
)

LEGACY = "legacy_"
SPEC = "spec_"
DAYS = 260
MARKETS: list[tuple[Scenario, int]] = [("regimes", 1), ("stress", 2), ("stress", 3)]
DEFAULT_NAMES = [rule.name for rule in DEFAULT_PORTFOLIO_RULES]
RESEARCH_NAMES = [rule.name for rule in TECHNICAL_EXPERIMENT_RULES]
SINGLES = [
    "rsi_overbought_dca_sell",
    "volatility_spike_dca_sell",
    "bollinger_lower_band_dca_buy",
    "breakout_20d_dca_buy",
]


def _params(
    *,
    enabled: list[str] | None = None,
    disabled: list[str] | None = None,
    quota: tuple[int | None, int | None, int | None] = (None, None, None),
    greed: tuple[float, float] = (0.50, 0.33),
) -> dict[str, Any]:
    return {
        "trade_quota": dict(
            zip(
                ("min_trade_interval_days", "max_trades_7d", "max_trades_30d"),
                quota,
                strict=True,
            )
        ),
        "top_escape": {
            "overextension_threshold_multiplier_greed": greed[0],
            "overextension_threshold_multiplier_extreme_greed": greed[1],
        },
        "disabled_rules": disabled or [],
        "enabled_rules": enabled,
    }


COMBINATIONS: dict[str, dict[str, Any]] = {
    "default": _params(),
    **{
        f"without_{name}": _params(disabled=[name])
        for name in (
            "cross_down_exit",
            "eth_btc_deviation_dca",
            "fgi_downshift_dca_sell",
        )
    },
    **{
        f"default_plus_{name}": _params(enabled=[*DEFAULT_NAMES, name])
        for name in RESEARCH_NAMES
    },
    **{f"only_{name}": _params(enabled=[name]) for name in SINGLES},
    "default_plus_spy_latch": _params(enabled=[*DEFAULT_NAMES, "spy_latch"]),
    "everything": _params(enabled=[*DEFAULT_NAMES, *RESEARCH_NAMES, "spy_latch"]),
    "minimal_baseline": _params(enabled=sorted(MINIMAL_BASELINE_PORTFOLIO_RULE_NAMES)),
    "disabled_beats_enabled": _params(
        enabled=["cross_down_exit", "cross_up_equal_weight"],
        disabled=["cross_up_equal_weight"],
    ),
    "quota_all_limits": _params(quota=(20, 1, 2)),
    "quota_with_everything": _params(
        enabled=[*DEFAULT_NAMES, *RESEARCH_NAMES, "spy_latch"], quota=(None, 2, None)
    ),
    "calmer_greed": _params(greed=(1.0, 1.0)),
}
SPECS: dict[str, StrategySpec] = {
    name: spec_for_params(params) for name, params in COMBINATIONS.items()
}


def _resolved(name: str) -> list[ResolvedSavedStrategyConfig]:
    saved = resolve_seed_strategy_config(DEFAULT_CONFIG_ID).model_copy(
        update={"params": COMBINATIONS[name]}, deep=True
    )
    return [
        replace(resolve_saved_strategy_config(saved), request_config_id=LEGACY + name),
        replace(
            resolve_spec_strategy_config(SPECS[name], config_id=SPEC + name),
            request_config_id=SPEC + name,
        ),
    ]


def _states(response: BacktestResponse, name: str, key: str) -> list[dict[str, Any]]:
    spec = SPECS[name]
    named = {rule.id for rule in spec.rules} | {item.id for item in spec.overlays}
    states = []
    for point in response.timeline:
        state = point.strategies[key].model_dump(mode="json")
        details = state["decision"]["details"]
        if "portfolio_rule_matches" in details:
            details["portfolio_rule_matches"] = sorted(
                (
                    entry
                    for entry in details["portfolio_rule_matches"]
                    if entry["rule_name"] in named
                ),
                key=lambda entry: entry["rule_name"],
            )
        states.append({"date": point.market.date.isoformat(), **state})
    return states


@pytest.fixture(scope="module")
def runs() -> dict[tuple[Scenario, int], BacktestResponse]:
    resolved = [config for name in COMBINATIONS for config in _resolved(name)]
    responses = {}
    for scenario, seed in MARKETS:
        market = synthetic_market(seed=seed, scenario=scenario, days=DAYS)
        responses[(scenario, seed)] = run_resolved_compare(
            prices=market.prices,
            sentiments=market.sentiments,
            start=market.user_start_date,
            end=market.prices[-1]["date"],
            resolved=resolved,
        )
    return responses


def test_every_combination_has_a_spec_with_a_deciding_rule() -> None:
    assert len(COMBINATIONS) == len(SPECS) == 1 + 3 + 12 + 4 + 7
    assert all(spec.rules for spec in SPECS.values())


def test_the_specs_hold_exactly_the_rules_the_combination_enabled() -> None:
    assert [rule.id for rule in SPECS["default"].rules] == DEFAULT_NAMES
    assert {rule.id for rule in SPECS["only_breakout_20d_dca_buy"].rules} == {
        "breakout_20d_dca_buy"
    }
    assert {rule.id for rule in SPECS["disabled_beats_enabled"].rules} == {
        "cross_down_exit"
    }
    assert [rule.id for rule in SPECS["everything"].rules] == [
        *(rule.id for rule in SPECS["default"].rules),
        *RESEARCH_NAMES,
    ]
    assert [item.id for item in SPECS["everything"].overlays] == ["spy_latch"]
    assert SPECS["default_plus_spy_latch"].rules == SPECS["default"].rules
    assert SPECS["quota_all_limits"].guards[0].max_trades_7d == 1
    greed = SPECS["calmer_greed"].rules[4].fgi_multipliers  # type: ignore[union-attr]
    assert (greed.greed, greed.extreme_greed) == (1.0, 1.0)


@pytest.mark.parametrize("name", COMBINATIONS)
def test_the_spec_reproduces_the_composition_day_by_day(
    runs: dict[tuple[Scenario, int], BacktestResponse], name: str
) -> None:
    for (scenario, seed), response in runs.items():
        legacy = _states(response, name, LEGACY + name)
        spec = _states(response, name, SPEC + name)

        assert len(legacy) == DAYS, (scenario, seed)
        assert spec == legacy, (scenario, seed)
        assert (
            response.strategies[SPEC + name].final_value
            == response.strategies[LEGACY + name].final_value
        )


def _won(response: BacktestResponse, key: str) -> set[str]:
    return {
        str(point.strategies[key].decision.details.get("matched_rule_name"))
        for point in response.timeline
    }


def test_the_parity_runs_exercise_the_research_rules(
    runs: dict[tuple[Scenario, int], BacktestResponse],
) -> None:
    """A parity in which a rule never decides would prove nothing about it."""
    won = {
        name: set().union(
            *(_won(r, SPEC + f"default_plus_{name}") for r in runs.values())
        )
        for name in RESEARCH_NAMES
    }
    won |= {
        name: set().union(*(_won(r, SPEC + f"only_{name}") for r in runs.values()))
        for name in SINGLES
    }

    decided = {name for name, rules in won.items() if name in rules}
    # The volatility levels the old rule shipped with are not reached on these
    # histories, so that rule is covered by the object-equality test instead.
    assert len(decided) >= 10, sorted(decided)


@pytest.mark.parametrize(
    "name", ["default_plus_spy_latch", "quota_all_limits", "calmer_greed"]
)
def test_the_non_rule_parts_of_a_combination_change_what_the_strategy_does(
    runs: dict[tuple[Scenario, int], BacktestResponse], name: str
) -> None:
    changed = any(
        _states(response, name, LEGACY + name)
        != _states(response, "default", LEGACY + "default")
        for response in runs.values()
    )

    assert changed, f"{name} changed nothing on any history"
