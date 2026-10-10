"""The reference strategy's rules and components, as the spec compiles them.

Rules have no defaults of their own: what a rule does is stated by a spec. A test
that needs "the cross-down exit rule" (or a rule with one number changed) asks for
it here, so the numbers it runs with are the production reference's and nothing
else.
"""

from __future__ import annotations

from dataclasses import replace
from typing import Any, TypeVar

from src.services.backtesting.portfolio_rules.base import PortfolioRule
from src.services.backtesting.portfolio_rules.components import (
    PortfolioRuleComponents,
    SignalSettings,
)
from src.services.backtesting.spec import (
    StrategySpec,
    compile_spec,
    load_spec,
    parse_spec,
)
from src.services.backtesting.strategies.rule_based_portfolio import (
    RuleBasedPortfolioStrategy,
)
from tests.services.backtesting.spec.helpers import (
    REFERENCE_REF,
    reference_raw,
    with_fgi_downshift,
)

_RuleT = TypeVar("_RuleT", bound=PortfolioRule)


def reference_spec() -> StrategySpec:
    return load_spec(REFERENCE_REF)


def reference_components() -> PortfolioRuleComponents:
    """Fresh rules, guards and signal settings: rule state is never shared."""
    return compile_spec(reference_spec())


def reference_rules() -> tuple[PortfolioRule, ...]:
    return reference_components().rules


def reference_signals() -> SignalSettings:
    return reference_components().signals


def reference_rule(name: str, **overrides: Any) -> Any:
    """The reference rule called ``name``, with ``overrides`` applied.

    Returns ``Any`` so a test can read the rule's own fields and replace them.
    """
    rule = next(rule for rule in reference_rules() if rule.name == name)
    return replace(rule, **overrides) if overrides else rule  # type: ignore[type-var]


def fgi_downshift_rule(**overrides: Any) -> Any:
    """The FGI downshift trim version 1 of the reference ran, with ``overrides``.

    Version 2 dropped it from the reference; the kind is still in the vocabulary.
    """
    rule = compile_spec(parse_spec(with_fgi_downshift(reference_raw()))).rules[-1]
    return replace(rule, **overrides) if overrides else rule  # type: ignore[type-var]


def reference_strategy(
    *,
    components: PortfolioRuleComponents | None = None,
    **fields: Any,
) -> RuleBasedPortfolioStrategy:
    """The rule-based strategy of the reference spec (or of ``components``)."""
    return RuleBasedPortfolioStrategy(
        total_capital=10_000.0,
        components=components or reference_components(),
        spec_ref="reference/dma_fgi",
        **fields,
    )
