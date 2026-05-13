"""Default portfolio-level DMA/FGI rule registry."""

from __future__ import annotations

from src.services.backtesting.portfolio_rules.base import PortfolioRule
from src.services.backtesting.portfolio_rules.cross_down_exit import CrossDownExitRule
from src.services.backtesting.portfolio_rules.cross_up_equal_weight import (
    CrossUpEqualWeightRule,
)
from src.services.backtesting.portfolio_rules.dma_overextension_dca_sell import (
    DmaOverextensionDcaSellRule,
)
from src.services.backtesting.portfolio_rules.eth_btc_deviation_dca import (
    EthBtcDeviationDcaRule,
)
from src.services.backtesting.portfolio_rules.eth_btc_ratio_rotation import (
    EthBtcRatioRotationRule,
)
from src.services.backtesting.portfolio_rules.extreme_fear_dca_buy import (
    ExtremeFearDcaBuyRule,
)
from src.services.backtesting.portfolio_rules.fgi_downshift_dca_sell import (
    FgiDownshiftDcaSellRule,
)
from src.services.backtesting.portfolio_rules.spy_latch import SpyLatchRule

_UNSORTED_DEFAULT_PORTFOLIO_RULES: tuple[PortfolioRule, ...] = (
    CrossDownExitRule(),
    EthBtcRatioRotationRule(),
    EthBtcDeviationDcaRule(),
    CrossUpEqualWeightRule(),
    DmaOverextensionDcaSellRule(),
    FgiDownshiftDcaSellRule(),
)
_NON_DEFAULT_PORTFOLIO_RULES: tuple[PortfolioRule, ...] = (
    ExtremeFearDcaBuyRule(),
    SpyLatchRule(),
)

DEFAULT_PORTFOLIO_RULES: tuple[PortfolioRule, ...] = tuple(
    sorted(_UNSORTED_DEFAULT_PORTFOLIO_RULES, key=lambda rule: rule.priority)
)
ALL_PORTFOLIO_RULES: tuple[PortfolioRule, ...] = tuple(
    sorted(
        (*_UNSORTED_DEFAULT_PORTFOLIO_RULES, *_NON_DEFAULT_PORTFOLIO_RULES),
        key=lambda rule: rule.priority,
    )
)
DEFAULT_PORTFOLIO_RULE_NAMES: frozenset[str] = frozenset(
    rule.name for rule in DEFAULT_PORTFOLIO_RULES
)
MINIMAL_BASELINE_PORTFOLIO_RULE_NAMES: frozenset[str] = frozenset(
    {
        "cross_down_exit",
        "cross_up_equal_weight",
        "eth_btc_ratio_rotation",
    }
)
RULE_DESCRIPTIONS: dict[str, str] = {
    rule.name: rule.description for rule in ALL_PORTFOLIO_RULES
}
RULE_PRIORITIES: dict[str, int] = {
    rule.name: rule.priority for rule in ALL_PORTFOLIO_RULES
}
RULE_NAMES: frozenset[str] = frozenset(RULE_DESCRIPTIONS)

__all__ = [
    "ALL_PORTFOLIO_RULES",
    "DEFAULT_PORTFOLIO_RULES",
    "DEFAULT_PORTFOLIO_RULE_NAMES",
    "EthBtcDeviationDcaRule",
    "ExtremeFearDcaBuyRule",
    "MINIMAL_BASELINE_PORTFOLIO_RULE_NAMES",
    "RULE_DESCRIPTIONS",
    "RULE_NAMES",
    "RULE_PRIORITIES",
    "SpyLatchRule",
]
