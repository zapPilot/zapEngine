from __future__ import annotations

import json
from typing import Any

import pytest

from src.services.backtesting.spec.loader import STRATEGIES_DIR
from src.services.backtesting.spec.schema_export import (
    KIND_SEMANTICS,
    SCHEMA_FILENAME,
    VOCABULARY_FILENAME,
    render_schema,
    render_vocabulary,
    spec_json_schema,
)
from tests.services.backtesting.spec.helpers import (
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
