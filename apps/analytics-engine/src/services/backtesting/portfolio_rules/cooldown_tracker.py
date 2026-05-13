"""Cooldown state for portfolio-level rule evaluation."""

from __future__ import annotations

from collections.abc import Mapping
from datetime import date
from typing import cast

from src.services.backtesting.decision import AllocationIntent
from src.services.backtesting.portfolio_rules.base import (
    DIAG_PORTFOLIO_RULE_COOLDOWN_KEY,
    DIAG_PORTFOLIO_RULE_TRIGGER_ASSETS,
    PortfolioRule,
    PortfolioRuleConfig,
    PortfolioSnapshot,
    rule_cooldown_remaining_days,
)

RuleCooldownKey = str | tuple[str, str]


class RuleCooldownTracker:
    """Tracks last execution dates and reports active rule cooldowns."""

    def __init__(
        self,
        last_executed: Mapping[RuleCooldownKey, date] | None = None,
    ) -> None:
        self._last_executed: dict[RuleCooldownKey, date] = dict(last_executed or {})

    @property
    def last_executed(self) -> Mapping[RuleCooldownKey, date]:
        return self._last_executed

    def reset(self) -> None:
        self._last_executed.clear()

    def is_cooled_off(
        self,
        rule: PortfolioRule,
        *,
        snapshot: PortfolioSnapshot,
        config: PortfolioRuleConfig,
    ) -> dict[str, object] | None:
        if _cooldown_keyed_by_trigger_symbol(rule):
            return _trigger_symbol_cooldown_diagnostic(
                rule,
                snapshot=snapshot,
                last_executed=self._last_executed,
            )
        return _rule_cooldown_diagnostic(
            rule,
            snapshot=snapshot,
            cooldown_key=_rule_cooldown_key(
                rule,
                snapshot=snapshot,
                config=config,
            ),
            cooldown_days=_rule_cooldown_days(
                rule,
                snapshot=snapshot,
                config=config,
            ),
            last_executed=self._last_executed,
        )

    def record_execution(
        self,
        rule: PortfolioRule,
        *,
        intent: AllocationIntent,
        executed_at: date,
    ) -> None:
        if _cooldown_keyed_by_trigger_symbol(rule):
            for symbol in _trigger_symbols_from_intent(intent):
                self._last_executed[(rule.name, symbol)] = executed_at
            return
        self._last_executed[_cooldown_key_from_intent(intent) or rule.name] = (
            executed_at
        )


def _cooldown_keyed_by_trigger_symbol(rule: PortfolioRule) -> bool:
    return bool(getattr(rule, "cooldown_keyed_by_trigger_symbol", False))


def _trigger_symbols_from_intent(intent: AllocationIntent) -> list[str]:
    diagnostics = intent.diagnostics or {}
    raw_symbols = diagnostics.get(DIAG_PORTFOLIO_RULE_TRIGGER_ASSETS)
    if not isinstance(raw_symbols, list):
        return []
    return [symbol for symbol in raw_symbols if isinstance(symbol, str)]


def _cooldown_key_from_intent(intent: AllocationIntent) -> RuleCooldownKey | None:
    diagnostics = intent.diagnostics or {}
    raw_key = diagnostics.get(DIAG_PORTFOLIO_RULE_COOLDOWN_KEY)
    if isinstance(raw_key, str):
        return raw_key
    if (
        isinstance(raw_key, tuple)
        and len(raw_key) == 2
        and all(isinstance(part, str) for part in raw_key)
    ):
        return cast(tuple[str, str], raw_key)
    if (
        isinstance(raw_key, list)
        and len(raw_key) == 2
        and all(isinstance(part, str) for part in raw_key)
    ):
        return (raw_key[0], raw_key[1])
    return None


def _rule_cooldown_diagnostic(
    rule: PortfolioRule,
    *,
    snapshot: PortfolioSnapshot,
    cooldown_key: RuleCooldownKey,
    cooldown_days: int,
    last_executed: Mapping[RuleCooldownKey, date],
) -> dict[str, object] | None:
    cooldown = _cooldown_entry(
        cooldown_key=cooldown_key,
        cooldown_days=cooldown_days,
        current_date=snapshot.current_date,
        last_executed=last_executed,
    )
    if cooldown is None:
        return None
    return {"rule": rule.name, **cooldown}


def _cooldown_entry(
    *,
    cooldown_key: RuleCooldownKey,
    cooldown_days: int,
    current_date: date | None,
    last_executed: Mapping[RuleCooldownKey, date],
) -> dict[str, object] | None:
    last_executed_at = last_executed.get(cooldown_key)
    remaining_days = rule_cooldown_remaining_days(
        cooldown_days=cooldown_days,
        last_executed_at=last_executed_at,
        current_date=current_date,
    )
    if remaining_days <= 0 or last_executed_at is None:
        return None
    return {
        "last_executed_at": last_executed_at.isoformat(),
        "cooldown_days": max(0, int(cooldown_days)),
        "remaining_days": remaining_days,
    }


def _rule_cooldown_key(
    rule: PortfolioRule,
    *,
    snapshot: PortfolioSnapshot,
    config: PortfolioRuleConfig,
) -> RuleCooldownKey:
    cooldown_key = getattr(rule, "cooldown_key", None)
    if not callable(cooldown_key):
        return rule.name
    raw_key = cooldown_key(snapshot, config=config)
    if isinstance(raw_key, str):
        return raw_key
    if (
        isinstance(raw_key, tuple)
        and len(raw_key) == 2
        and all(isinstance(part, str) for part in raw_key)
    ):
        return cast(tuple[str, str], raw_key)
    return rule.name


def _rule_cooldown_days(
    rule: PortfolioRule,
    *,
    snapshot: PortfolioSnapshot,
    config: PortfolioRuleConfig,
) -> int:
    cooldown_days_for_snapshot = getattr(rule, "cooldown_days_for_snapshot", None)
    if callable(cooldown_days_for_snapshot):
        return int(cooldown_days_for_snapshot(snapshot, config=config))
    return int(rule.cooldown_days)


def _trigger_symbol_cooldown_diagnostic(
    rule: PortfolioRule,
    *,
    snapshot: PortfolioSnapshot,
    last_executed: Mapping[RuleCooldownKey, date],
) -> dict[str, object] | None:
    trigger_symbols = _trigger_symbols_for_cooldown(rule, snapshot)
    if not trigger_symbols:
        return None
    symbol_entries: list[tuple[str, dict[str, object]]] = []
    for symbol in trigger_symbols:
        cooldown = _cooldown_entry(
            cooldown_key=(rule.name, symbol),
            cooldown_days=rule.cooldown_days,
            current_date=snapshot.current_date,
            last_executed=last_executed,
        )
        if cooldown is not None:
            symbol_entries.append((symbol, cooldown))
    if len(symbol_entries) != len(trigger_symbols):
        return None
    remaining_values = [
        cast(int, cooldown["remaining_days"]) for _, cooldown in symbol_entries
    ]
    symbol_cooldowns = [
        {
            "symbol": symbol,
            "last_executed_at": cooldown["last_executed_at"],
            "remaining_days": cooldown["remaining_days"],
        }
        for symbol, cooldown in symbol_entries
    ]
    return {
        "rule": rule.name,
        "cooldown_days": max(0, int(rule.cooldown_days)),
        "remaining_days": max(remaining_values),
        "trigger_symbols": trigger_symbols,
        "symbol_cooldowns": symbol_cooldowns,
    }


def _trigger_symbols_for_cooldown(
    rule: PortfolioRule,
    snapshot: PortfolioSnapshot,
) -> list[str]:
    trigger_symbols_for_cooldown = getattr(
        rule,
        "trigger_symbols_for_cooldown",
        None,
    )
    if not callable(trigger_symbols_for_cooldown):
        return []
    symbols = trigger_symbols_for_cooldown(snapshot)
    if not isinstance(symbols, list):
        return []
    return [symbol for symbol in symbols if isinstance(symbol, str)]


__all__ = ["RuleCooldownKey", "RuleCooldownTracker"]
