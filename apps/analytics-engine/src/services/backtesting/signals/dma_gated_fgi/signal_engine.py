"""Signal engine for the dedicated DMA-gated FGI runtime."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field, replace
from datetime import date, timedelta
from typing import Any, cast

from src.services.backtesting.decision import AllocationIntent
from src.services.backtesting.features import (
    DMA_ASSET_FEATURE,
    MACRO_FEAR_GREED_FEATURE,
)
from src.services.backtesting.signals.contracts import SignalContext
from src.services.backtesting.signals.dma_gated_fgi.config import DmaGatedFgiConfig
from src.services.backtesting.signals.dma_gated_fgi.constants import VALID_ATH_EVENTS
from src.services.backtesting.signals.dma_gated_fgi.errors import SignalDataError
from src.services.backtesting.signals.dma_gated_fgi.regime_classifier import (
    RegimeClassifier,
    RegimeSource,
)
from src.services.backtesting.signals.dma_gated_fgi.types import (
    AthEvent,
    BlockedZone,
    CrossEvent,
    DmaCooldownState,
    DmaMarketState,
    DmaRuntimeDebugState,
    Zone,
)
from src.services.backtesting.signals.dma_gated_fgi.utils import (
    _cross_target_zone,
    extract_fgi_value,
    extract_non_negative_numeric,
)


@dataclass
class DmaSignalEngine:
    """Stateful DMA market-state extractor.

    Responsibilities:
    - classify price vs DMA zone
    - detect observed/actionable crosses
    - maintain cooldown and EMA slope state
    - emit typed market state without making portfolio decisions
    """

    config: DmaGatedFgiConfig = field(default_factory=DmaGatedFgiConfig)
    _regime_classifier: RegimeClassifier = field(
        default_factory=RegimeClassifier,
        init=False,
    )
    _last_observed_zone: Zone | None = field(default=None, init=False)
    _last_actionable_zone: Zone | None = field(default=None, init=False)
    _cooldown_end_date: date | None = field(default=None, init=False)
    _cooldown_blocked_zone: BlockedZone | None = field(default=None, init=False)
    _fgi_ema_prev: float | None = field(default=None, init=False)
    _fgi_ema_current: float | None = field(default=None, init=False)

    def reset(self) -> None:
        self._last_observed_zone = None
        self._last_actionable_zone = None
        self._cooldown_end_date = None
        self._cooldown_blocked_zone = None
        self._fgi_ema_prev = None
        self._fgi_ema_current = None

    @staticmethod
    def _classify_zone(price: float, dma_200: float) -> Zone:
        if price > dma_200:
            return "above"
        if price < dma_200:
            return "below"
        return "at"

    def _update_fgi_slope(self, fgi_value: float | None) -> float:
        if fgi_value is None:
            return 0.0

        alpha = 0.5
        normalized = (fgi_value - 50.0) / 50.0

        if self._fgi_ema_current is None:
            self._fgi_ema_current = normalized
            return 0.0

        self._fgi_ema_prev = self._fgi_ema_current
        self._fgi_ema_current = alpha * normalized + (1.0 - alpha) * self._fgi_ema_prev
        return self._fgi_ema_current - self._fgi_ema_prev

    def _extract_state_inputs(
        self,
        context: SignalContext,
        *,
        require_dma: bool,
    ) -> tuple[
        float | None,
        float | None,
        str,
        RegimeSource,
        AthEvent | None,
        float,
        str | None,
        float | None,
        str | None,
        RegimeSource | None,
    ]:
        dma_200 = context.features.indicators.dma_200
        if dma_200 is None:
            dma_200 = extract_non_negative_numeric(context.extra_data, "dma_200")
        if require_dma and (dma_200 is None or dma_200 == 0.0):
            raise SignalDataError("Missing required extra_data['dma_200']")

        fgi_value = extract_fgi_value(context.sentiment)
        regime, regime_source = (
            self._regime_classifier.classify_from_sentiment_with_source(
                context.sentiment
            )
        )
        ath_event = _normalize_ath_event(context.ath_event)
        fgi_slope = self._update_fgi_slope(fgi_value)
        macro_value, macro_regime, macro_regime_source = (
            self._extract_macro_fear_greed(context.extra_data)
        )
        return (
            dma_200,
            fgi_value,
            regime,
            regime_source,
            ath_event,
            fgi_slope,
            _normalize_asset_symbol(context.extra_data.get(DMA_ASSET_FEATURE)),
            macro_value,
            macro_regime,
            macro_regime_source,
        )

    def _extract_macro_fear_greed(
        self,
        extra_data: Mapping[str, Any],
    ) -> tuple[float | None, str | None, RegimeSource | None]:
        raw_macro = extra_data.get(MACRO_FEAR_GREED_FEATURE)
        if not isinstance(raw_macro, Mapping):
            return None, None, None
        sentiment = dict(raw_macro)
        if "value" not in sentiment and "score" in sentiment:
            sentiment["value"] = sentiment["score"]
        value = extract_fgi_value(sentiment)
        regime, regime_source = (
            self._regime_classifier.classify_from_sentiment_with_source(sentiment)
        )
        return value, regime, regime_source

    def warmup(self, context: SignalContext) -> None:
        """Warm runtime state without emitting a decision."""
        (
            dma_200,
            _fgi_value,
            _regime,
            _regime_source,
            _ath_event,
            _fgi_slope,
            _asset_symbol,
            _macro_value,
            _macro_regime,
            _macro_regime_source,
        ) = self._extract_state_inputs(context, require_dma=False)
        if dma_200 is None or dma_200 == 0.0:
            return
        zone = self._classify_zone(context.price, dma_200)
        self._last_observed_zone = zone
        self._last_actionable_zone = zone

    def build_market_state(self, context: SignalContext) -> DmaMarketState:
        (
            dma_200,
            fgi_value,
            regime,
            regime_source,
            ath_event,
            fgi_slope,
            asset_symbol,
            macro_value,
            macro_regime,
            macro_regime_source,
        ) = self._extract_state_inputs(context, require_dma=True)
        assert dma_200 is not None

        zone = self._classify_zone(context.price, dma_200)
        observed_cross = self._detect_cross(self._last_observed_zone, zone)
        cooldown_just_expired = self._release_cooldown_if_expired(context.date)
        if cooldown_just_expired and observed_cross is None:
            self._last_actionable_zone = zone
        actionable_cross = self._detect_cross(self._last_actionable_zone, zone)

        return DmaMarketState(
            signal_id="dma_gated_fgi",
            dma_200=dma_200,
            dma_distance=(context.price / dma_200) - 1.0,
            zone=zone,
            cross_event=observed_cross,
            actionable_cross_event=actionable_cross,
            cooldown_state=self._cooldown_state(context.date),
            fgi_value=fgi_value,
            fgi_slope=fgi_slope,
            fgi_regime=regime,
            regime_source=regime_source,
            ath_event=ath_event,
            asset_symbol=asset_symbol,
            macro_fear_greed_value=macro_value,
            macro_fear_greed_regime=macro_regime,
            macro_fear_greed_regime_source=macro_regime_source,
        )

    def apply_intent(
        self,
        *,
        current_date: date,
        market_state: DmaMarketState,
        intent: AllocationIntent,
    ) -> DmaMarketState:
        updated_state = market_state
        if (
            intent.rule_group == "cross"
            and market_state.actionable_cross_event is not None
        ):
            self._start_cooldown(
                current_date=current_date,
                cross_event=market_state.actionable_cross_event,
            )
            updated_state = replace(
                market_state,
                cooldown_state=self._cooldown_state(current_date),
            )

        self._finalize_state_transition(
            current_zone=updated_state.zone,
            observed_cross=updated_state.cross_event,
        )
        return updated_state

    def _detect_cross(
        self,
        previous_zone: Zone | None,
        current_zone: Zone,
    ) -> CrossEvent | None:
        if previous_zone is None:
            return None

        if previous_zone == "above":
            if self.config.cross_on_touch and current_zone in {"at", "below"}:
                return "cross_down"
            if not self.config.cross_on_touch and current_zone == "below":
                return "cross_down"

        if previous_zone == "below":
            if self.config.cross_on_touch and current_zone in {"at", "above"}:
                return "cross_up"
            if not self.config.cross_on_touch and current_zone == "above":
                return "cross_up"

        return None

    @staticmethod
    def _cross_blocked_zone(cross_event: CrossEvent) -> BlockedZone:
        return "above" if cross_event == "cross_down" else "below"

    def _is_cooldown_active(self, current_date: date) -> bool:
        return (
            self._cooldown_end_date is not None
            and self._cooldown_blocked_zone is not None
            and current_date <= self._cooldown_end_date
        )

    def _cooldown_remaining_days(self, current_date: date) -> int:
        if self._cooldown_end_date is None or self._cooldown_blocked_zone is None:
            return 0
        return max(0, (self._cooldown_end_date - current_date).days)

    def _cooldown_state(self, current_date: date) -> DmaCooldownState:
        return DmaCooldownState(
            active=self._is_cooldown_active(current_date),
            remaining_days=self._cooldown_remaining_days(current_date),
            blocked_zone=self._cooldown_blocked_zone,
        )

    def _release_cooldown_if_expired(self, current_date: date) -> bool:
        if self._cooldown_end_date is None or self._cooldown_blocked_zone is None:
            return False
        if current_date <= self._cooldown_end_date:
            return False
        self._cooldown_end_date = None
        self._cooldown_blocked_zone = None
        return True

    def _start_cooldown(self, *, current_date: date, cross_event: CrossEvent) -> None:
        self._cooldown_blocked_zone = self._cross_blocked_zone(cross_event)
        self._cooldown_end_date = current_date + timedelta(
            days=self.config.cross_cooldown_days
        )

    def _finalize_state_transition(
        self,
        *,
        current_zone: Zone,
        observed_cross: CrossEvent | None,
    ) -> None:
        self._last_observed_zone = current_zone

        should_freeze_actionable_zone = False
        if self._cooldown_blocked_zone is not None:
            blocked_cross_zone = (
                _cross_target_zone(observed_cross)
                if observed_cross is not None
                else None
            )
            should_freeze_actionable_zone = (
                current_zone == self._cooldown_blocked_zone
                or blocked_cross_zone == self._cooldown_blocked_zone
            )

        if not should_freeze_actionable_zone:
            self._last_actionable_zone = current_zone

    def debug_state(self) -> DmaRuntimeDebugState:
        return DmaRuntimeDebugState(
            last_observed_zone=self._last_observed_zone,
            last_actionable_zone=self._last_actionable_zone,
            cooldown_end_date=self._cooldown_end_date,
            cooldown_blocked_zone=self._cooldown_blocked_zone,
            fgi_ema_prev=self._fgi_ema_prev,
            fgi_ema_current=self._fgi_ema_current,
        )


def _normalize_ath_event(raw_value: object) -> AthEvent | None:
    if isinstance(raw_value, str) and raw_value in VALID_ATH_EVENTS:
        return cast(AthEvent, raw_value)
    return None


def _normalize_asset_symbol(raw_value: object) -> str | None:
    if not isinstance(raw_value, str):
        return None
    normalized = raw_value.strip().upper()
    return normalized or None


__all__ = ["DmaSignalEngine"]
