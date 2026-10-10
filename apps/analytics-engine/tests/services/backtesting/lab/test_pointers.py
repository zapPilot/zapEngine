from __future__ import annotations

import pytest

from src.services.backtesting.lab import pointers
from src.services.backtesting.lab.pointers import PointerError
from tests.services.backtesting.spec.helpers import reference_raw


def test_a_plain_pointer_walks_keys_and_positions() -> None:
    raw = reference_raw()

    assert pointers.get(raw, "/signals/warmup_days") == 14
    assert pointers.get(raw, "/rules/0/cooldown_days") == 30
    assert pointers.get(raw, "/rules/3/tiers/1/threshold") == 0.5


def test_a_rule_can_be_named_by_its_id() -> None:
    raw = reference_raw()

    assert pointers.get(raw, "/rules[cross_down_exit]/cooldown_days") == 30
    assert pointers.get(raw, "/rules[eth_btc_deviation_dca]/tiers/0/name") == "large"


def test_an_overlay_is_named_by_its_id() -> None:
    raw = reference_raw()
    raw["overlays"] = [{"kind": "trend_guard", "id": "guard", "confirm_days": 3}]

    assert pointers.get(raw, "/overlays[guard]/confirm_days") == 3


def test_setting_returns_a_copy_and_leaves_the_original() -> None:
    raw = reference_raw()

    changed = pointers.set_at(raw, "/rules[cross_down_exit]/cooldown_days", 21)

    assert pointers.get(changed, "/rules[cross_down_exit]/cooldown_days") == 21
    assert pointers.get(raw, "/rules[cross_down_exit]/cooldown_days") == 30


def test_a_list_element_can_be_set_by_position() -> None:
    raw = reference_raw()

    changed = pointers.set_at(raw, "/rules/4/proceeds/to/0/share", 0.25)

    assert changed["rules"][4]["proceeds"]["to"][0]["share"] == 0.25


def test_a_whole_list_element_can_be_replaced_by_position() -> None:
    raw = reference_raw()
    share = {"asset": "stable", "share": 1.0}

    changed = pointers.set_at(raw, "/rules/4/proceeds/to/0", share)

    assert changed["rules"][4]["proceeds"]["to"][0] == share
    assert raw["rules"][4]["proceeds"]["to"][0] != share


@pytest.mark.parametrize(
    "pointer",
    [
        "rules/0",
        "/nothing",
        "/rules/99",
        "/rules[no_such_rule]/cooldown_days",
        "/signals[x]/warmup_days",
        "/nothing[x]/warmup_days",
        "/signals/warmup_days/deeper",
        "/rules/first",
    ],
)
def test_a_pointer_that_leads_nowhere_is_an_error(pointer: str) -> None:
    with pytest.raises(PointerError):
        pointers.get(reference_raw(), pointer)


@pytest.mark.parametrize(
    "pointer",
    [
        "/signals/nothing",
        "/rules/99",
        "/rules[cross_down_exit]",
        "/signals/warmup_days/deeper",
    ],
)
def test_setting_needs_an_existing_value_to_replace(pointer: str) -> None:
    with pytest.raises(PointerError):
        pointers.set_at(reference_raw(), pointer, 1)


def test_the_tokens_of_a_pointer() -> None:
    assert pointers.split("/rules[a]/b/0") == ["rules[a]", "b", "0"]
