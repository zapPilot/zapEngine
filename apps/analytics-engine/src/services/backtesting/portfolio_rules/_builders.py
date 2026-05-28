"""Rule and risk-guard factory helpers + active-rule filtering."""

from __future__ import annotations

from collections.abc import Mapping
from copy import deepcopy
from typing import Any, Protocol, TypeVar, cast

from src.services.backtesting.portfolio_rules import (
    ALL_PORTFOLIO_RULES,
    DEFAULT_PORTFOLIO_RULES,
    RULE_NAMES,
)
from src.services.backtesting.portfolio_rules.base import (
    HasPublicParams,
    PortfolioRule,
)
from src.services.backtesting.risk import (
    RiskGuard,
    TradeQuotaGuard,
)

_RuleT = TypeVar("_RuleT", bound=PortfolioRule)


class _PortfolioRuleParams(Protocol):
    disabled_rules: frozenset[str]
    enabled_rules: frozenset[str] | None
    min_trade_interval_days: int | None
    max_trades_7d: int | None
    max_trades_30d: int | None
    overextension_threshold_multiplier_greed: float
    overextension_threshold_multiplier_extreme_greed: float

    def to_public_params(self) -> Mapping[str, Any]: ...


def build_portfolio_rules_for_params(
    params: _PortfolioRuleParams,
    *,
    include_inactive: bool = False,
) -> tuple[PortfolioRule, ...]:
    assert_known_rule_names(params.disabled_rules, field_name="disabled_rules")
    assert_known_rule_names(params.enabled_rules, field_name="enabled_rules")
    rule_universe = ALL_PORTFOLIO_RULES if include_inactive else DEFAULT_PORTFOLIO_RULES
    nested_params = _nested_public_params_for(params)
    rules = [
        _rule_with_public_params(fresh_portfolio_rule(rule), nested_params)
        for rule in rule_universe
        if include_inactive or rule.name not in params.disabled_rules
    ]
    return tuple(sorted(rules, key=lambda rule: rule.priority))


def _nested_public_params_for(params: _PortfolioRuleParams) -> Any:
    from src.services.backtesting.constants import STRATEGY_DMA_FGI_PORTFOLIO_RULES
    from src.services.backtesting.public_params import (
        DmaGatedFgiPublicParams,
        runtime_params_to_public_params,
    )

    nested = runtime_params_to_public_params(
        STRATEGY_DMA_FGI_PORTFOLIO_RULES,
        params.to_public_params(),
    )
    return DmaGatedFgiPublicParams.model_validate(nested)


def _rule_with_public_params(rule: _RuleT, nested_params: Any) -> _RuleT:
    if not isinstance(rule, HasPublicParams):
        return rule
    section_name = rule.public_params_section()
    if section_name is None:
        return rule
    section = getattr(nested_params, section_name)
    return cast(_RuleT, rule.with_public_params(section))


def fresh_portfolio_rule(rule: _RuleT) -> _RuleT:
    return deepcopy(rule)


def required_rule(
    rules: tuple[PortfolioRule, ...],
    rule_type: type[_RuleT],
) -> _RuleT:
    for rule in rules:
        if isinstance(rule, rule_type):
            return rule
    raise ValueError(f"Missing required portfolio rule: {rule_type.__name__}")


def assert_known_rule_names(
    rule_names: frozenset[str] | None,
    *,
    field_name: str,
) -> None:
    if rule_names is None:
        return
    invalid_rules = sorted(rule_names - RULE_NAMES)
    if invalid_rules:
        joined = ", ".join(invalid_rules)
        raise ValueError(f"Unsupported portfolio rule names in {field_name}: {joined}")


def build_risk_guards_for_params(
    params: _PortfolioRuleParams,
) -> tuple[RiskGuard, ...]:
    guards: list[RiskGuard] = []
    if (
        params.min_trade_interval_days is not None
        or params.max_trades_7d is not None
        or params.max_trades_30d is not None
    ):
        guards.append(
            TradeQuotaGuard(
                min_trade_interval_days=params.min_trade_interval_days,
                max_trades_7d=params.max_trades_7d,
                max_trades_30d=params.max_trades_30d,
            )
        )
    return tuple(sorted(guards, key=lambda guard: guard.priority))


def active_rules(
    rules: tuple[PortfolioRule, ...],
    *,
    disabled_rules: frozenset[str],
    enabled_rules: frozenset[str] | None,
) -> tuple[PortfolioRule, ...]:
    return tuple(
        rule
        for rule in rules
        if _rule_is_active(
            rule,
            disabled_rules=disabled_rules,
            enabled_rules=enabled_rules,
        )
    )


def _rule_is_active(
    rule: PortfolioRule,
    *,
    disabled_rules: frozenset[str],
    enabled_rules: frozenset[str] | None,
) -> bool:
    if rule.name in disabled_rules:
        return False
    return enabled_rules is None or rule.name in enabled_rules
