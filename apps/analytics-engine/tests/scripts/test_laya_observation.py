from __future__ import annotations

from dataclasses import replace

import pytest

from scripts.research.laya.observation import (
    ObservationTooLongError,
    TrailingCloses,
    assert_within_budget,
    build_observation,
    serialize_observation,
)
from src.services.backtesting.signals.dma_gated_fgi.types import DmaCooldownState
from src.services.backtesting.signals.flat_minimum import FlatMinimumState
from src.services.backtesting.signals.ratio_state import EthBtcRatioState
from src.services.backtesting.signals.technical import TechnicalSignalSnapshot
from tests.services.backtesting.helpers import state


def _asset_state(symbol: str, *, macro: bool = False):
    return replace(
        state(
            symbol=symbol,
            dma_distance=0.1234,
            fgi_value=42.34,
            fgi_regime="fear",
            fgi_slope=-1.23,
            macro_fear_greed_value=61.2 if macro else None,
            macro_fear_greed_regime="greed" if macro else None,
        ),
        technical=TechnicalSignalSnapshot(
            rsi_14=55.55,
            realized_volatility_20d=0.234,
            momentum_30d=0.123,
            momentum_90d=-0.087,
            bollinger_zscore_20=1.234,
        ),
    )


def _flat_state() -> FlatMinimumState:
    cooldown = DmaCooldownState(active=False, remaining_days=0, blocked_zone=None)
    return FlatMinimumState(
        spy_dma_state=_asset_state("SPY", macro=True),
        btc_dma_state=_asset_state("BTC"),
        eth_dma_state=_asset_state("ETH"),
        current_asset_allocation={
            "stable": 0.4,
            "spy": 0.2,
            "btc": 0.25,
            "eth": 0.15,
            "alt": 0.0,
        },
        eth_btc_ratio_state=EthBtcRatioState(
            ratio=0.055,
            ratio_dma_200=0.05,
            zone="above",
            cross_event=None,
            actionable_cross_event=None,
            cooldown_state=cooldown,
        ),
    )


def test_build_observation_is_compact_ordered_and_stable() -> None:
    trailing = TrailingCloses(
        spy=[100.0] * 7 + [107.0],
        btc=[100.0] * 7 + [108.0],
        eth=[100.0] * 7 + [109.0],
    )
    observation = build_observation(
        _flat_state(),
        prior_units={"stable": 8, "spy": 4, "btc": 5, "eth": 3},
        trailing=trailing,
    )
    assert list(observation) == [
        "fgi",
        "macro",
        "spy",
        "btc",
        "eth",
        "eth_btc_dma%",
        "alloc",
        "prior",
    ]
    assert observation["fgi"] == {"v": 42.3, "reg": "fear", "slope": -1.2}
    assert observation["macro"] == {"v": 61.2, "lab": "greed"}
    assert observation["btc"]["dma%"] == 12.3
    assert observation["btc"]["r7"] == 8.0
    assert observation["btc"]["r30"] == 12.3
    assert observation["btc"]["r90"] == -8.7
    assert observation["btc"]["vol"] == 23.4
    assert observation["btc"]["rsi"] == 55.5
    assert observation["alloc"] == {"stable": 40, "spy": 20, "btc": 25, "eth": 15}
    assert observation["prior"] == {"stable": 40, "spy": 20, "btc": 25, "eth": 15}
    serialized = serialize_observation(observation)
    assert "null" not in serialized
    assert "date" not in serialized
    assert serialized == serialize_observation(observation)
    assert_within_budget(serialized)


def test_r7_and_prior_are_omitted_when_unavailable() -> None:
    observation = build_observation(_flat_state())
    assert "r7" not in observation["btc"]
    assert "prior" not in observation


def test_budget_guard_rejects_oversized_state() -> None:
    with pytest.raises(ObservationTooLongError):
        assert_within_budget("x" * 901, max_chars=900)
