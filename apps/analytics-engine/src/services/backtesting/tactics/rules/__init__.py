"""Default DMA/FGI rule registry."""

from __future__ import annotations

from src.services.backtesting.tactics.base import Rule
from src.services.backtesting.tactics.rules.above_ath_sell import AboveAthSellRule
from src.services.backtesting.tactics.rules.above_extreme_greed_sell import (
    AboveExtremeGreedSellRule,
)
from src.services.backtesting.tactics.rules.above_greed_fading_sell import (
    AboveGreedFadingSellRule,
)
from src.services.backtesting.tactics.rules.above_greed_sell import AboveGreedSellRule
from src.services.backtesting.tactics.rules.above_overextended_sell import (
    AboveOverextendedSellRule,
)
from src.services.backtesting.tactics.rules.actionable_cross_cooldown_block import (
    ActionableCrossCooldownBlockRule,
)
from src.services.backtesting.tactics.rules.actionable_cross_down_sell import (
    ActionableCrossDownSellRule,
)
from src.services.backtesting.tactics.rules.actionable_cross_up_buy import (
    ActionableCrossUpBuyRule,
)
from src.services.backtesting.tactics.rules.below_extreme_fear_buy import (
    BelowExtremeFearBuyRule,
)
from src.services.backtesting.tactics.rules.below_fear_recovering_buy import (
    BelowFearRecoveringBuyRule,
)
from src.services.backtesting.tactics.rules.regime_no_signal_hold import (
    RegimeNoSignalHoldRule,
)
from src.services.backtesting.tactics.rules.spy_below_extreme_fear_buy import (
    SpyBelowExtremeFearBuyRule,
)
from src.services.backtesting.tactics.rules.zone_cooldown_hold import (
    ZoneCooldownHoldRule,
)

_UNSORTED_DEFAULT_RULES: tuple[Rule, ...] = (
    ActionableCrossCooldownBlockRule(),
    ActionableCrossDownSellRule(),
    ActionableCrossUpBuyRule(),
    ZoneCooldownHoldRule(),
    AboveOverextendedSellRule(),
    AboveExtremeGreedSellRule(),
    AboveGreedFadingSellRule(),
    AboveGreedSellRule(),
    SpyBelowExtremeFearBuyRule(),
    BelowExtremeFearBuyRule(),
    BelowFearRecoveringBuyRule(),
    AboveAthSellRule(),
    RegimeNoSignalHoldRule(),
)
DEFAULT_RULES: tuple[Rule, ...] = tuple(
    sorted(_UNSORTED_DEFAULT_RULES, key=lambda rule: rule.priority)
)

RULE_DESCRIPTIONS: dict[str, str] = {
    rule.name: rule.description for rule in DEFAULT_RULES
}
RULE_NAMES: frozenset[str] = frozenset(rule.name for rule in DEFAULT_RULES)

__all__ = ["DEFAULT_RULES", "RULE_DESCRIPTIONS", "RULE_NAMES"]
