from __future__ import annotations

from typing import Any

import pytest

from src.services.backtesting.spec import SpecError, parse_spec
from src.services.backtesting.spec.compiler import compile_spec
from src.services.backtesting.spec.model import StrategySpec
from src.services.backtesting.spec.validation import SpecIssue, require_valid
from tests.services.backtesting.spec.helpers import (
    issues_for,
    reference_raw,
    rule_index,
    with_value,
    without,
)

TREND_GUARD = {
    "kind": "trend_guard",
    "id": "trend_guard",
    "mode": "block_adds",
    "below_dma_buffer": 0.02,
    "confirm_days": 3,
}


def test_reference_is_valid() -> None:
    assert issues_for(reference_raw()) == []


def test_reference_with_an_overlay_is_valid() -> None:
    raw = reference_raw()
    raw["overlays"] = [TREND_GUARD]

    assert issues_for(raw) == []


@pytest.mark.parametrize(
    ("mutate", "pointer", "code"),
    [
        (lambda raw: without(raw, ("signals", "dma")), "/signals/dma", "missing"),
        (
            lambda raw: with_value(raw, ("surprise",), 1),
            "/surprise",
            "extra_forbidden",
        ),
        (
            lambda raw: with_value(raw, ("rules", 0, "kind"), "buy_the_dip"),
            "/rules/0",
            "union_tag_invalid",
        ),
        (
            lambda raw: with_value(raw, ("rules", 0, "cooldown_days"), -1),
            "/rules/0/cooldown_days",
            "greater_than_equal",
        ),
        (
            lambda raw: with_value(
                raw, ("rules", 3, "tiers", 0, "rotation_fraction"), 1.5
            ),
            "/rules/3/tiers/0/rotation_fraction",
            "less_than_equal",
        ),
        (
            lambda raw: with_value(raw, ("rules", 0, "id"), "Cross Down"),
            "/rules/0/id",
            "string_pattern_mismatch",
        ),
        (
            lambda raw: with_value(raw, ("rules",), []),
            "/rules",
            "too_short",
        ),
        (
            lambda raw: with_value(
                raw, ("overlays",), [{**TREND_GUARD, "confirm_days": 0}]
            ),
            "/overlays/0/confirm_days",
            "greater_than_equal",
        ),
        (
            lambda raw: with_value(raw, ("guards",), [{"kind": "trade_quota"}]),
            "/guards",
            "too_long",
        ),
        (
            lambda raw: with_value(raw, ("spec_format",), "strategy-spec/2"),
            "/spec_format",
            "literal_error",
        ),
    ],
    ids=[
        "missing-field",
        "unknown-key",
        "unknown-kind",
        "rule-field-out-of-range",
        "nested-field-out-of-range",
        "bad-slug",
        "no-rules",
        "overlay-field-out-of-range",
        "a-guard",
        "unknown-format",
    ],
)
def test_structural_problems_are_pointed_at(
    mutate: Any,
    pointer: str,
    code: str,
) -> None:
    issues = issues_for(mutate(reference_raw()))

    assert [(issue.pointer, issue.code) for issue in issues] == [(pointer, code)]


def _cross_down(raw: dict[str, Any]) -> int:
    return rule_index(raw, "dma_cross_down_exit")


def _rotation(raw: dict[str, Any]) -> int:
    return rule_index(raw, "ratio_cross_rotation")


def _deviation(raw: dict[str, Any]) -> int:
    return rule_index(raw, "ratio_deviation_rotation")


def _overextension(raw: dict[str, Any]) -> int:
    return rule_index(raw, "dma_overextension_trim")


def _downshift(raw: dict[str, Any]) -> int:
    return rule_index(raw, "fgi_downshift_trim")


def _duplicate_rule_id(raw: dict[str, Any]) -> dict[str, Any]:
    raw["rules"][1]["id"] = raw["rules"][0]["id"]
    return raw


def _overlay_reuses_rule_id(raw: dict[str, Any]) -> dict[str, Any]:
    raw["overlays"] = [{**TREND_GUARD, "id": raw["rules"][0]["id"]}]
    return raw


def _two_overlays(raw: dict[str, Any]) -> dict[str, Any]:
    raw["overlays"] = [TREND_GUARD, {**TREND_GUARD, "id": "another_guard"}]
    return raw


SEMANTIC_CASES = [
    (_duplicate_rule_id, "/rules/1/id", "duplicate_id"),
    (_overlay_reuses_rule_id, "/overlays/0/id", "duplicate_id"),
    (_two_overlays, "/overlays/1", "duplicate_overlay"),
    (
        lambda raw: with_value(
            raw, ("rules", _cross_down(raw), "peer_groups"), [[], ["BTC", "ETH"]]
        ),
        "/rules/0/peer_groups/0",
        "empty_peer_group",
    ),
    (
        lambda raw: with_value(
            raw,
            ("rules", _cross_down(raw), "peer_groups"),
            [["SPY", "BTC"], ["BTC", "ETH"]],
        ),
        "/rules/0/peer_groups",
        "asset_in_two_groups",
    ),
    (
        lambda raw: with_value(
            raw,
            ("rules", _overextension(raw), "proceeds", "to"),
            [{"asset": "SPY", "share": 0.2}, {"asset": "SPY", "share": 0.3}],
        ),
        "/rules/4/proceeds/to",
        "duplicate_proceeds_asset",
    ),
    (
        lambda raw: with_value(
            raw,
            ("rules", _overextension(raw), "proceeds", "to"),
            [{"asset": "SPY", "share": 0.7}, {"asset": "BTC", "share": 0.6}],
        ),
        "/rules/4/proceeds/to",
        "proceeds_exceed_one",
    ),
    (
        lambda raw: with_value(
            raw, ("rules", _rotation(raw), "cross_up", "sources"), []
        ),
        "/rules/2/cross_up/sources",
        "no_sources",
    ),
    (
        lambda raw: with_value(
            raw, ("rules", _rotation(raw), "cross_down", "sources"), ["ETH", "ETH"]
        ),
        "/rules/2/cross_down/sources",
        "duplicate_source",
    ),
    (
        lambda raw: with_value(
            raw, ("rules", _rotation(raw), "cross_up", "destination"), "BTC"
        ),
        "/rules/2/cross_up/destination",
        "destination_is_source",
    ),
    (
        lambda raw: with_value(
            raw,
            ("rules", _deviation(raw), "tiers"),
            list(reversed(raw["rules"][_deviation(raw)]["tiers"])),
        ),
        "/rules/3/tiers",
        "tiers_not_strongest_first",
    ),
    (
        lambda raw: with_value(
            raw, ("rules", _deviation(raw), "tiers", 1, "name"), "large"
        ),
        "/rules/3/tiers/0/name",
        "duplicate_tier_name",
    ),
    (
        lambda raw: with_value(
            with_value(raw, ("rules", _deviation(raw), "below"), None),
            ("rules", _deviation(raw), "above"),
            None,
        ),
        "/rules/3",
        "no_active_leg",
    ),
    (
        lambda raw: with_value(
            raw,
            ("rules", _deviation(raw), "below"),
            {"source": "BTC", "destination": "BTC"},
        ),
        "/rules/3/below",
        "leg_moves_nothing",
    ),
    (
        lambda raw: with_value(
            raw, ("rules", _downshift(raw), "from_regimes"), ["greed", "greed"]
        ),
        "/rules/5/from_regimes",
        "duplicate_regime",
    ),
    (
        lambda raw: with_value(
            raw, ("rules", _downshift(raw), "to_regimes"), ["neutral", "greed"]
        ),
        "/rules/5",
        "regimes_overlap",
    ),
]


@pytest.mark.parametrize(("mutate", "pointer", "code"), SEMANTIC_CASES)
def test_semantic_problems_are_pointed_at(
    mutate: Any,
    pointer: str,
    code: str,
) -> None:
    issues = issues_for(mutate(reference_raw()))

    assert (pointer, code) in [(issue.pointer, issue.code) for issue in issues]


def test_a_spec_that_skipped_parsing_is_still_checked_before_compiling() -> None:
    raw = _duplicate_rule_id(reference_raw())
    spec = StrategySpec.model_validate(raw)

    with pytest.raises(SpecError, match="already used"):
        compile_spec(spec)
    with pytest.raises(SpecError):
        require_valid(spec)


def test_errors_carry_machine_readable_issues_and_a_readable_message() -> None:
    with pytest.raises(SpecError) as caught:
        parse_spec(without(reference_raw(), ("signals", "dma")))

    assert caught.value.issues == (
        SpecIssue("/signals/dma", "missing", "Field required"),
    )
    assert caught.value.issues[0].as_dict() == {
        "pointer": "/signals/dma",
        "code": "missing",
        "message": "Field required",
    }
    assert str(caught.value) == "/signals/dma: Field required"


def test_an_error_at_the_root_reads_as_a_slash() -> None:
    with pytest.raises(SpecError) as caught:
        parse_spec(["not", "an", "object"])

    assert str(caught.value).startswith("/: ")


def test_regime_lists_are_order_insensitive() -> None:
    raw = reference_raw()
    index = _downshift(raw)
    raw["rules"][index]["from_regimes"] = ["extreme_greed", "greed"]

    spec = parse_spec(raw)

    assert spec.rules[index].from_regimes == ("greed", "extreme_greed")  # type: ignore[union-attr]
