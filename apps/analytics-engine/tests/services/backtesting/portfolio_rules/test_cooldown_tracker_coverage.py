from __future__ import annotations

from datetime import date

from src.services.backtesting.decision import AllocationIntent
from src.services.backtesting.portfolio_rules.base import (
    DIAG_PORTFOLIO_RULE_COOLDOWN_KEY,
    DIAG_PORTFOLIO_RULE_TRIGGER_ASSETS,
    PortfolioRuleConfig,
    PortfolioSnapshot,
)
from src.services.backtesting.portfolio_rules.cooldown_tracker import (
    RuleCooldownTracker,
)
from tests.services.backtesting.portfolio_rules.helpers import snapshot


class _Rule:
    name = "test_rule"
    priority = 10
    cooldown_days = 7
    rule_group = "dma_fgi"
    description = "test rule"

    def matches(
        self,
        snapshot: PortfolioSnapshot,
        *,
        config: PortfolioRuleConfig,
    ) -> bool:
        del snapshot, config
        return True

    def build_intent(
        self,
        snapshot: PortfolioSnapshot,
        *,
        config: PortfolioRuleConfig,
    ) -> AllocationIntent:
        del snapshot, config
        return _intent({})


class _DynamicCooldownRule(_Rule):
    def cooldown_key(
        self,
        snapshot: PortfolioSnapshot,
        *,
        config: PortfolioRuleConfig,
    ) -> tuple[str, str]:
        del snapshot, config
        return ("test_rule", "BTC")

    def cooldown_days_for_snapshot(
        self,
        snapshot: PortfolioSnapshot,
        *,
        config: PortfolioRuleConfig,
    ) -> int:
        del snapshot, config
        return 5


class _StringCooldownKeyRule(_Rule):
    def cooldown_key(
        self,
        snapshot: PortfolioSnapshot,
        *,
        config: PortfolioRuleConfig,
    ) -> str:
        del snapshot, config
        return "custom_key"


class _InvalidCooldownKeyRule(_Rule):
    def cooldown_key(
        self,
        snapshot: PortfolioSnapshot,
        *,
        config: PortfolioRuleConfig,
    ) -> object:
        del snapshot, config
        return ("too", "many", "parts")


class _TriggerSymbolRule(_Rule):
    cooldown_keyed_by_trigger_symbol = True

    def trigger_symbols_for_cooldown(self, snapshot: PortfolioSnapshot) -> list[str]:
        del snapshot
        return ["BTC", "ETH"]


class _InvalidTriggerSymbolsRule(_Rule):
    cooldown_keyed_by_trigger_symbol = True

    def trigger_symbols_for_cooldown(
        self, snapshot: PortfolioSnapshot
    ) -> tuple[str, ...]:
        del snapshot
        return ("BTC",)


class _NoTriggerSymbolsRule(_Rule):
    cooldown_keyed_by_trigger_symbol = True


def _intent(diagnostics: dict[str, object]) -> AllocationIntent:
    return AllocationIntent(
        action="buy",
        target_allocation={"btc": 1.0, "eth": 0.0, "spy": 0.0, "stable": 0.0},
        allocation_name="test",
        immediate=False,
        reason="test_reason",
        rule_group="dma_fgi",
        decision_score=0.0,
        diagnostics=diagnostics,
    )


def test_tracker_exposes_and_resets_last_execution_mapping() -> None:
    tracker = RuleCooldownTracker({"test_rule": date(2025, 5, 1)})

    assert tracker.last_executed == {"test_rule": date(2025, 5, 1)}

    tracker.reset()

    assert tracker.last_executed == {}


def test_tracker_records_list_cooldown_key_from_intent_diagnostics() -> None:
    tracker = RuleCooldownTracker()
    tracker.record_execution(
        _Rule(),
        intent=_intent({DIAG_PORTFOLIO_RULE_COOLDOWN_KEY: ["test_rule", "BTC"]}),
        executed_at=date(2025, 5, 1),
    )

    assert tracker.last_executed == {("test_rule", "BTC"): date(2025, 5, 1)}


def test_tracker_records_string_and_tuple_cooldown_keys_from_intent_diagnostics() -> (
    None
):
    tracker = RuleCooldownTracker()
    tracker.record_execution(
        _Rule(),
        intent=_intent({DIAG_PORTFOLIO_RULE_COOLDOWN_KEY: "custom_key"}),
        executed_at=date(2025, 5, 1),
    )
    tracker.record_execution(
        _Rule(),
        intent=_intent({DIAG_PORTFOLIO_RULE_COOLDOWN_KEY: ("test_rule", "ETH")}),
        executed_at=date(2025, 5, 2),
    )

    assert tracker.last_executed == {
        "custom_key": date(2025, 5, 1),
        ("test_rule", "ETH"): date(2025, 5, 2),
    }


def test_tracker_falls_back_to_rule_name_when_intent_key_is_invalid() -> None:
    tracker = RuleCooldownTracker()
    tracker.record_execution(
        _Rule(),
        intent=_intent({DIAG_PORTFOLIO_RULE_COOLDOWN_KEY: ("too", "many", "parts")}),
        executed_at=date(2025, 5, 1),
    )

    assert tracker.last_executed == {"test_rule": date(2025, 5, 1)}


def test_tracker_filters_non_string_trigger_symbols_when_recording_execution() -> None:
    tracker = RuleCooldownTracker()
    tracker.record_execution(
        _TriggerSymbolRule(),
        intent=_intent({DIAG_PORTFOLIO_RULE_TRIGGER_ASSETS: ["BTC", 12, "ETH"]}),
        executed_at=date(2025, 5, 1),
    )

    assert tracker.last_executed == {
        ("test_rule", "BTC"): date(2025, 5, 1),
        ("test_rule", "ETH"): date(2025, 5, 1),
    }


def test_tracker_uses_dynamic_rule_cooldown_key_and_days() -> None:
    tracker = RuleCooldownTracker({("test_rule", "BTC"): date(2025, 5, 1)})

    diagnostic = tracker.is_cooled_off(
        _DynamicCooldownRule(),
        snapshot=snapshot(current_date=date(2025, 5, 3)),
        config=PortfolioRuleConfig(),
    )

    assert diagnostic == {
        "rule": "test_rule",
        "last_executed_at": "2025-05-01",
        "cooldown_days": 5,
        "remaining_days": 3,
    }


def test_tracker_uses_string_dynamic_cooldown_key() -> None:
    tracker = RuleCooldownTracker({"custom_key": date(2025, 5, 1)})

    diagnostic = tracker.is_cooled_off(
        _StringCooldownKeyRule(),
        snapshot=snapshot(current_date=date(2025, 5, 3)),
        config=PortfolioRuleConfig(),
    )

    assert diagnostic is not None
    assert diagnostic["remaining_days"] == 5


def test_tracker_falls_back_to_rule_name_for_invalid_dynamic_key() -> None:
    tracker = RuleCooldownTracker({"test_rule": date(2025, 5, 1)})

    diagnostic = tracker.is_cooled_off(
        _InvalidCooldownKeyRule(),
        snapshot=snapshot(current_date=date(2025, 5, 3)),
        config=PortfolioRuleConfig(),
    )

    assert diagnostic is not None
    assert diagnostic["remaining_days"] == 5


def test_tracker_requires_all_trigger_symbols_to_be_in_cooldown() -> None:
    tracker = RuleCooldownTracker({("test_rule", "BTC"): date(2025, 5, 1)})

    diagnostic = tracker.is_cooled_off(
        _TriggerSymbolRule(),
        snapshot=snapshot(current_date=date(2025, 5, 3)),
        config=PortfolioRuleConfig(),
    )

    assert diagnostic is None


def test_tracker_reports_trigger_symbol_cooldown_when_all_symbols_blocked() -> None:
    tracker = RuleCooldownTracker(
        {
            ("test_rule", "BTC"): date(2025, 5, 1),
            ("test_rule", "ETH"): date(2025, 5, 2),
        }
    )

    diagnostic = tracker.is_cooled_off(
        _TriggerSymbolRule(),
        snapshot=snapshot(current_date=date(2025, 5, 3)),
        config=PortfolioRuleConfig(),
    )

    assert diagnostic == {
        "rule": "test_rule",
        "cooldown_days": 7,
        "remaining_days": 6,
        "trigger_symbols": ["BTC", "ETH"],
        "symbol_cooldowns": [
            {
                "symbol": "BTC",
                "last_executed_at": "2025-05-01",
                "remaining_days": 5,
            },
            {
                "symbol": "ETH",
                "last_executed_at": "2025-05-02",
                "remaining_days": 6,
            },
        ],
    }


def test_tracker_ignores_invalid_trigger_symbol_sources_and_diagnostics() -> None:
    tracker = RuleCooldownTracker()
    tracker.record_execution(
        _TriggerSymbolRule(),
        intent=_intent({DIAG_PORTFOLIO_RULE_TRIGGER_ASSETS: ("BTC", "ETH")}),
        executed_at=date(2025, 5, 1),
    )

    assert tracker.last_executed == {}
    assert (
        tracker.is_cooled_off(
            _InvalidTriggerSymbolsRule(),
            snapshot=snapshot(current_date=date(2025, 5, 2)),
            config=PortfolioRuleConfig(),
        )
        is None
    )
    assert (
        tracker.is_cooled_off(
            _NoTriggerSymbolsRule(),
            snapshot=snapshot(current_date=date(2025, 5, 2)),
            config=PortfolioRuleConfig(),
        )
        is None
    )
