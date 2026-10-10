"""Which rules did the work, read from the diagnostics every decision carries.

For each rule: how often its condition held (``matches``), how often it decided
the day (``wins``), how often a win moved money (``trades``), how often a
higher-priority rule took a day it matched (``shadowed``) and how often its own
cooldown held it back (``cooldown_skips``).
"""

from __future__ import annotations

from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

from src.services.backtesting.lab.days import DayView


@dataclass(frozen=True)
class RuleStats:
    matches: int = 0
    wins: int = 0
    trades: int = 0
    shadowed: int = 0
    cooldown_skips: int = 0

    def as_dict(self) -> dict[str, int]:
        return {
            "matches": self.matches,
            "wins": self.wins,
            "trades": self.trades,
            "shadowed": self.shadowed,
            "cooldown_skips": self.cooldown_skips,
        }


@dataclass(frozen=True)
class Attribution:
    rules: dict[str, RuleStats]
    # Days an overlay changed the decision, by the adjustment's name.
    adjustments: dict[str, int]

    def as_dict(self) -> dict[str, Any]:
        return {
            "rules": {name: stats.as_dict() for name, stats in self.rules.items()},
            "adjustments": dict(sorted(self.adjustments.items())),
        }


def rule_attribution(
    days: Sequence[DayView],
    rule_ids: Sequence[str],
) -> Attribution:
    counters = {rule_id: Counter[str]() for rule_id in rule_ids}
    adjustments: Counter[str] = Counter()
    for day in days:
        details = day.details
        for entry in details.get("portfolio_rule_matches") or []:
            counter = _find(counters, entry.get("rule_name"))
            if counter is not None and entry.get("matched"):
                counter["matches"] += 1
                if entry.get("suppressed_by") is not None:
                    counter["shadowed"] += 1
        winner = _find(counters, details.get("matched_rule_name"))
        if winner is not None:
            winner["wins"] += 1
            if day.transfers:
                winner["trades"] += 1
        for entry in details.get("cooldown_skipped_rules") or []:
            counter = _find(counters, entry.get("rule"))
            if counter is not None:
                counter["cooldown_skips"] += 1
        adjustments.update(details.get("post_intent_adjustments") or [])
    return Attribution(
        rules={
            rule_id: RuleStats(
                matches=counter["matches"],
                wins=counter["wins"],
                trades=counter["trades"],
                shadowed=counter["shadowed"],
                cooldown_skips=counter["cooldown_skips"],
            )
            for rule_id, counter in counters.items()
        },
        adjustments=dict(adjustments),
    )


def _find(counters: dict[str, Counter[str]], name: object) -> Counter[str] | None:
    return counters.get(name) if isinstance(name, str) else None


__all__ = ["Attribution", "RuleStats", "rule_attribution"]
