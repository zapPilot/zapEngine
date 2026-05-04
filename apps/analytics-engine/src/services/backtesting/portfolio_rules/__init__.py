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
from src.services.backtesting.portfolio_rules.extreme_fear_dca_buy import (
    ExtremeFearDcaBuyRule,
)
from src.services.backtesting.portfolio_rules.eth_btc_ratio_rotation import (
    EthBtcRatioRotationRule,
)
from src.services.backtesting.portfolio_rules.fgi_downshift_dca_sell import (
    FgiDownshiftDcaSellRule,
)

_UNSORTED_DEFAULT_PORTFOLIO_RULES: tuple[PortfolioRule, ...] = (
    CrossDownExitRule(),
    EthBtcRatioRotationRule(),
    CrossUpEqualWeightRule(),
    ExtremeFearDcaBuyRule(),
    DmaOverextensionDcaSellRule(),
    FgiDownshiftDcaSellRule(),
)

DEFAULT_PORTFOLIO_RULES: tuple[PortfolioRule, ...] = tuple(
    sorted(_UNSORTED_DEFAULT_PORTFOLIO_RULES, key=lambda rule: rule.priority)
)
RULE_DESCRIPTIONS: dict[str, str] = {
    rule.name: rule.description for rule in DEFAULT_PORTFOLIO_RULES
}
RULE_NAMES: frozenset[str] = frozenset(rule.name for rule in DEFAULT_PORTFOLIO_RULES)

__all__ = [
    "DEFAULT_PORTFOLIO_RULES",
    "RULE_DESCRIPTIONS",
    "RULE_NAMES",
]
