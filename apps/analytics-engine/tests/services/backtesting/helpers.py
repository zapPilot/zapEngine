from __future__ import annotations

from datetime import date
from typing import cast

from src.services.backtesting.portfolio_rules.base import PortfolioSnapshot
from src.services.backtesting.signals.dma_gated_fgi.types import (
    AthEvent,
    BlockedZone,
    CrossEvent,
    DmaCooldownState,
    DmaMarketState,
    Zone,
)
from src.services.backtesting.signals.ratio_state import EthBtcRatioState


def state(
    *,
    symbol: str,
    zone: str = "above",
    dma_distance: float = 0.05,
    cross_event: str | None = None,
    actionable_cross_event: str | None = None,
    fgi_regime: str = "neutral",
    ath_event: str | None = None,
    macro_fear_greed_regime: str | None = None,
    fgi_value: float | None = 50.0,
    fgi_slope: float = 0.0,
    macro_fear_greed_value: float | None = None,
    cooldown_state: DmaCooldownState | None = None,
) -> DmaMarketState:
    return DmaMarketState(
        signal_id="dma_gated_fgi",
        dma_200=100.0,
        dma_distance=dma_distance,
        zone=cast(Zone, zone),
        cross_event=cast(CrossEvent | None, cross_event),
        actionable_cross_event=cast(CrossEvent | None, actionable_cross_event),
        cooldown_state=cooldown_state
        or DmaCooldownState(
            active=False,
            remaining_days=0,
            blocked_zone=cast(BlockedZone | None, None),
        ),
        fgi_value=fgi_value,
        fgi_slope=fgi_slope,
        fgi_regime=fgi_regime,
        regime_source="label",
        ath_event=cast(AthEvent | None, ath_event),
        asset_symbol=symbol,
        macro_fear_greed_value=macro_fear_greed_value,
        macro_fear_greed_regime=macro_fear_greed_regime,
        macro_fear_greed_regime_source="label"
        if macro_fear_greed_regime is not None
        else None,
    )


def snapshot(
    *,
    assets: dict[str, DmaMarketState] | None = None,
    current: dict[str, float] | None = None,
    previous: dict[str, str] | None = None,
    macro_regime: str | None = None,
    crypto_regime: str | None = None,
    cycle_open: dict[str, bool] | None = None,
    eth_btc_ratio_state: EthBtcRatioState | None = None,
    last_trade_date: date | None = None,
    current_date: date | None = None,
    trade_dates: tuple[date, ...] = (),
) -> PortfolioSnapshot:
    resolved_assets = assets or {
        "SPY": state(symbol="SPY"),
        "BTC": state(symbol="BTC"),
        "ETH": state(symbol="ETH"),
    }
    return PortfolioSnapshot(
        assets=resolved_assets,
        current_asset_allocation=current
        or {"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0, "alt": 0.0},
        previous_fgi_regime=previous or {},
        macro_fgi_regime=macro_regime,
        crypto_fgi_regime=crypto_regime,
        cycle_open_per_symbol=cycle_open or {},
        eth_btc_ratio_state=eth_btc_ratio_state,
        last_trade_date=last_trade_date,
        current_date=current_date,
        trade_dates=trade_dates,
    )
