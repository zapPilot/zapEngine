from __future__ import annotations

import json
from typing import Any

import pytest

from src.services.backtesting.spec.loader import STRATEGIES_DIR
from src.services.backtesting.spec.schema_export import (
    KIND_SEMANTICS,
    SCHEMA_FILENAME,
    TRIGGER_SEMANTICS,
    VOCABULARY_FILENAME,
    render_schema,
    render_vocabulary,
    spec_json_schema,
)
from tests.services.backtesting.spec.helpers import (
    SPY_LATCH,
    TECHNICAL_RULES,
    reference_raw,
    rule_index,
    with_value,
    without,
)
from tests.services.backtesting.spec.schema_check import violations

NOISE = {"$ref", "$defs", "title", "default", "discriminator"}


def _walk(node: Any) -> list[dict[str, Any]]:
    """Every schema node under ``node``, never the property names themselves."""
    nodes: list[dict[str, Any]] = []
    if isinstance(node, list):
        for item in node:
            nodes.extend(_walk(item))
    elif isinstance(node, dict):
        nodes.append(node)
        for key, value in node.items():
            if key == "properties":
                for child in value.values():
                    nodes.extend(_walk(child))
            else:
                nodes.extend(_walk(value))
    return nodes


def test_the_committed_schema_is_what_the_models_generate() -> None:
    assert (STRATEGIES_DIR / SCHEMA_FILENAME).read_text() == render_schema("llm"), (
        "run `pnpm strategy-lab schema` and commit the result"
    )


def test_the_committed_vocabulary_is_what_the_models_generate() -> None:
    assert (STRATEGIES_DIR / VOCABULARY_FILENAME).read_text() == render_vocabulary(), (
        "run `pnpm strategy-lab schema` and commit the result"
    )


def test_the_llm_profile_is_inlined_closed_and_fully_required() -> None:
    schema = spec_json_schema("llm")

    nodes = _walk(schema)
    assert NOISE.isdisjoint(key for node in nodes for key in node)
    objects = [node for node in nodes if "properties" in node]
    assert len(objects) > 10
    for node in objects:
        assert node["additionalProperties"] is False
        assert node["required"] == list(node["properties"])


def test_the_full_profile_keeps_the_refs() -> None:
    schema = spec_json_schema("full")

    assert "$defs" in schema
    assert "discriminator" in json.dumps(schema)


def test_the_reference_satisfies_the_schema() -> None:
    assert violations(reference_raw(), spec_json_schema("llm")) == []


def test_a_null_leg_satisfies_the_schema() -> None:
    raw = reference_raw()
    deviation = raw["rules"][rule_index(raw, "ratio_deviation_rotation")]
    deviation["below"] = None

    assert violations(raw, spec_json_schema("llm")) == []


def _with_research_rules() -> dict[str, Any]:
    raw = reference_raw()
    raw["rules"] = [*raw["rules"], *TECHNICAL_RULES.values()]
    raw["overlays"] = [dict(SPY_LATCH)]
    raw["guards"] = [
        {
            "kind": "trade_quota",
            "min_trade_interval_days": None,
            "max_trades_7d": 3,
            "max_trades_30d": None,
        }
    ]
    return raw


def test_a_spec_with_every_research_rule_satisfies_the_schema() -> None:
    assert violations(_with_research_rules(), spec_json_schema("llm")) == []


@pytest.mark.parametrize(
    ("mutate", "fragment"),
    [
        (
            lambda raw: with_value(raw, ("rules", 6, "trigger", "rsi_at_least"), 100.0),
            "/rules/6: matches 0 of oneOf",
        ),
        (
            lambda raw: with_value(raw, ("rules", 6, "trigger", "signal"), "astrology"),
            "/rules/6: matches 0 of oneOf",
        ),
        (
            lambda raw: with_value(raw, ("rules", 6, "trigger", "extra"), 1),
            "/rules/6: matches 0 of oneOf",
        ),
        (
            lambda raw: without(raw, ("rules", 6, "trigger")),
            "/rules/6: matches 0 of oneOf",
        ),
    ],
    ids=["level-out-of-range", "unknown-signal", "unknown-key", "missing-trigger"],
)
def test_the_schema_rejects_a_bad_trigger(mutate: Any, fragment: str) -> None:
    raw = _with_research_rules()
    assert raw["rules"][6]["id"] == "rsi_bearish_divergence_dca_sell"
    raw["rules"][6]["trigger"] = dict(
        TECHNICAL_RULES["rsi_overbought_dca_sell"]["trigger"]
    )

    problems = violations(mutate(raw), spec_json_schema("llm"))

    assert any(fragment in problem for problem in problems), problems


@pytest.mark.parametrize(
    ("mutate", "fragment"),
    [
        (lambda raw: without(raw, ("signals", "dma")), "/signals/dma: required"),
        (lambda raw: with_value(raw, ("surprise",), 1), "/surprise: not allowed"),
        (
            lambda raw: with_value(raw, ("signals", "warmup_days"), 999),
            "/signals/warmup_days: above 365",
        ),
        (
            lambda raw: with_value(raw, ("rules", 0, "kind"), "buy_the_dip"),
            "/rules/0: matches 0 of oneOf",
        ),
        (
            lambda raw: with_value(raw, ("rules", 0, "cooldown_days"), 999),
            "/rules/0: matches 0 of oneOf",
        ),
        (
            lambda raw: with_value(
                raw, ("rules", rule_index(raw, "ratio_deviation_rotation"), "below"), 3
            ),
            "/rules/3: matches 0 of oneOf",
        ),
        (
            lambda raw: with_value(raw, ("id",), "Not A Slug"),
            "/id: does not match",
        ),
    ],
    ids=[
        "missing",
        "unknown-key",
        "range",
        "unknown-kind",
        "rule-field-out-of-range",
        "bad-leg",
        "pattern",
    ],
)
def test_the_schema_rejects_what_the_models_reject(
    mutate: Any,
    fragment: str,
) -> None:
    problems = violations(mutate(reference_raw()), spec_json_schema("llm"))

    assert any(fragment in problem for problem in problems), problems


def test_every_rule_kind_is_explained() -> None:
    schema = spec_json_schema("llm")
    kinds = {
        branch["properties"]["kind"]["const"]
        for branch in schema["properties"]["rules"]["items"]["oneOf"]
    }
    vocabulary = render_vocabulary()

    assert set(KIND_SEMANTICS) == kinds
    assert all(f"### `{kind}`" in vocabulary for kind in kinds)


def test_every_trigger_signal_is_explained() -> None:
    schema = spec_json_schema("llm")
    trim = next(
        branch
        for branch in schema["properties"]["rules"]["items"]["oneOf"]
        if branch["properties"]["kind"]["const"] == "technical_trim"
    )
    signals = {
        branch["properties"]["signal"]["const"]
        for branch in trim["properties"]["trigger"]["oneOf"]
    }
    vocabulary = render_vocabulary()

    assert set(TRIGGER_SEMANTICS) == signals
    assert all(f"### `{signal}`" in vocabulary for signal in signals)
    assert "It has no fields." in vocabulary
