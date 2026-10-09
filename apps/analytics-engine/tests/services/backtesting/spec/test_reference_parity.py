"""The reference spec must be the production strategy, not an approximation.

The default strategy (a saved config of the rule-based recipe, built from
its public params) and the reference spec (compiled from JSON) run side by
side through the compare path the API uses. Every field of every day's
strategy state has to be identical: decisions, the rules that matched,
transfers, balances. Floating point included.

The one thing the two do not share is the *list* of rules in the trace. The
default strategy evaluates the inactive research rules too and reports them as
unmatched; the spec only has its own rules. Entries are compared for the rules
the spec names.
"""

from __future__ import annotations

from dataclasses import replace
from typing import Any

import pytest

from src.config.strategy_presets import resolve_seed_strategy_config
from src.models.backtesting import BacktestResponse
from src.services.backtesting.lab.synthetic import Scenario, synthetic_market
from src.services.backtesting.portfolio_rules import DEFAULT_PORTFOLIO_RULES
from src.services.backtesting.portfolio_rules.components import SignalSettings
from src.services.backtesting.spec import compile_spec, load_spec
from src.services.backtesting.strategy_registry import (
    ResolvedSavedStrategyConfig,
    resolve_saved_strategy_config,
    resolve_spec_strategy_config,
)
from src.services.backtesting.validation.event_runner import load_validation_events
from tests.services.backtesting.spec.helpers import REFERENCE_REF
from tests.services.backtesting.support.event_histories import synthetic_event_history
from tests.services.backtesting.support.synthetic_runs import (
    DEFAULT_CONFIG_ID,
    run_resolved_compare,
)
from tests.test_validation_events import FIXTURE_PATH

LEGACY = "legacy"
SPEC = "spec"
DAYS = 400
MARKETS: list[tuple[Scenario, int]] = [
    (scenario, seed) for scenario in ("regimes", "stress") for seed in (1, 2, 3)
]
EVENTS = load_validation_events(FIXTURE_PATH)
SPEC_RULE_NAMES = frozenset(rule.id for rule in load_spec(REFERENCE_REF).rules)


def _legacy_config() -> ResolvedSavedStrategyConfig:
    saved = resolve_seed_strategy_config(DEFAULT_CONFIG_ID)
    return replace(resolve_saved_strategy_config(saved), request_config_id=LEGACY)


def _spec_config() -> ResolvedSavedStrategyConfig:
    return replace(
        resolve_spec_strategy_config(load_spec(REFERENCE_REF), config_id=SPEC),
        request_config_id=SPEC,
    )


def _run(
    prices: list[dict[str, Any]],
    sentiments: dict[Any, dict[str, Any]],
    start: Any,
    end: Any,
) -> BacktestResponse:
    return run_resolved_compare(
        prices=prices,
        sentiments=sentiments,
        start=start,
        end=end,
        resolved=[_legacy_config(), _spec_config()],
    )


def _states(response: BacktestResponse, config_id: str) -> list[dict[str, Any]]:
    states = []
    for point in response.timeline:
        state = point.strategies[config_id].model_dump(mode="json")
        details = state["decision"]["details"]
        if "portfolio_rule_matches" in details:
            details["portfolio_rule_matches"] = [
                entry
                for entry in details["portfolio_rule_matches"]
                if entry["rule_name"] in SPEC_RULE_NAMES
            ]
        states.append({"date": point.market.date.isoformat(), **state})
    return states


@pytest.fixture(scope="module")
def market_runs() -> dict[tuple[Scenario, int], BacktestResponse]:
    runs = {}
    for scenario, seed in MARKETS:
        market = synthetic_market(seed=seed, scenario=scenario, days=DAYS)
        runs[(scenario, seed)] = _run(
            market.prices,
            market.sentiments,
            market.user_start_date,
            market.prices[-1]["date"],
        )
    return runs


def test_the_reference_compiles_to_the_default_rules() -> None:
    components = compile_spec(load_spec(REFERENCE_REF))

    assert [
        replace(compiled, priority=default.priority)
        for compiled, default in zip(
            components.rules, DEFAULT_PORTFOLIO_RULES, strict=True
        )
    ] == list(DEFAULT_PORTFOLIO_RULES)
    assert components.signals == SignalSettings()
    assert components.risk_guards == ()


@pytest.mark.parametrize(("scenario", "seed"), MARKETS)
def test_the_spec_reproduces_the_default_strategy_day_by_day(
    market_runs: dict[tuple[Scenario, int], BacktestResponse],
    scenario: Scenario,
    seed: int,
) -> None:
    response = market_runs[(scenario, seed)]

    assert len(response.timeline) == DAYS
    assert _states(response, SPEC) == _states(response, LEGACY)
    assert (
        response.strategies[SPEC].final_value == response.strategies[LEGACY].final_value
    )


def test_the_parity_runs_exercise_every_rule(
    market_runs: dict[tuple[Scenario, int], BacktestResponse],
) -> None:
    """A parity that never fires a rule would prove nothing about it."""
    fired = {
        state["decision"]["details"].get("matched_rule_name")
        for response in market_runs.values()
        for state in _states(response, SPEC)
    }

    assert SPEC_RULE_NAMES <= fired


@pytest.mark.parametrize("event", EVENTS, ids=lambda event: event.id)
def test_the_spec_reproduces_the_default_strategy_on_each_validation_history(
    event: Any,
) -> None:
    prices, sentiments, start, end = synthetic_event_history(event)

    response = _run(prices, sentiments, start, end)

    assert _states(response, SPEC) == _states(response, LEGACY)
