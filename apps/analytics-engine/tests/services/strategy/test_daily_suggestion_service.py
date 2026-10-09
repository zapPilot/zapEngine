"""The daily suggestion follows the model's last bar and projects the user on it."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from src.config.strategy_presets import get_default_seed_strategy_config
from src.models.backtesting import Allocation, AssetAllocation, TransferRecord
from src.models.market_data_freshness import MarketDataFreshness
from src.services.backtesting.capabilities import PortfolioBuckets
from src.services.backtesting.execution.portfolio import Portfolio
from src.services.exceptions import MarketDataUnavailableError
from src.services.strategy.strategy_daily_suggestion_service import (
    StrategyDailySuggestionService,
    _utc_now,
)
from tests.services.strategy.support import (
    ALL_STABLE,
    DEFAULT_CONFIG_ID,
    MODEL_DAY,
    NOW,
    OTHER_USER_ID,
    PRICE_MAP,
    USER_ID,
    Clock,
    anchor_service,
    build_replay,
    build_service,
)

MIXED_TARGET = {"btc": 0.4, "eth": 0.2, "spy": 0.0, "stable": 0.4, "alt": 0.0}


def _moves(transfers: list[TransferRecord]) -> list[tuple[str, str, float]]:
    return [(t.from_bucket, t.to_bucket, round(t.amount_usd, 6)) for t in transfers]


def _apply(transfers: list[TransferRecord], **holdings: float) -> dict[str, float]:
    """Execute the suggested transfers on a cost-free portfolio, return weights."""
    portfolio = Portfolio.from_asset_values(
        btc_value=holdings.get("btc", 0.0),
        eth_value=holdings.get("eth", 0.0),
        spy_value=holdings.get("spy", 0.0),
        stable_value=holdings.get("stable", 0.0),
        price=PRICE_MAP,
    )
    for transfer in transfers:
        portfolio.execute_transfer(
            transfer.from_bucket, transfer.to_bucket, transfer.amount_usd, PRICE_MAP
        )
    return portfolio.asset_allocation_percentages(PRICE_MAP)


class TestWhenTheUserIsAskedToAct:
    def test_a_trading_day_turns_the_gap_to_target_into_transfers(self) -> None:
        service, _replayer, _portfolios = build_service(
            build_replay(target=ALL_STABLE, traded=True),
            holdings={"btc": 5_000.0, "eth": 2_000.0, "stable": 3_000.0},
        )

        response = service.get_daily_suggestion(USER_ID)

        assert response.action.status == "action_required"
        assert response.action.required is True
        assert response.action.kind == "rebalance"
        assert response.action.reason_code == "portfolio_cross_down_exit"
        assert _moves(response.action.transfers) == [
            ("btc", "stable", 5_000.0),
            ("eth", "stable", 2_000.0),
        ]

    def test_following_the_transfers_lands_exactly_on_the_models_target(self) -> None:
        holdings = {"btc": 6_000.0, "spy": 1_000.0, "stable": 3_000.0}
        service, _replayer, _portfolios = build_service(
            build_replay(target=MIXED_TARGET, traded=True),
            holdings=holdings,
        )

        response = service.get_daily_suggestion(USER_ID)

        reached = _apply(response.action.transfers, **holdings)
        for bucket in ("btc", "eth", "spy", "stable"):
            assert reached[bucket] == pytest.approx(MIXED_TARGET[bucket], abs=1e-9)

    def test_a_user_already_on_target_is_not_asked_to_move(self) -> None:
        service, _replayer, _portfolios = build_service(
            build_replay(target=ALL_STABLE, traded=True),
            holdings={"stable": 10_000.0},
        )

        response = service.get_daily_suggestion(USER_ID)

        assert response.action.status == "no_action"
        assert response.action.required is False
        assert response.action.transfers == []
        assert response.action.reason_code == "portfolio_cross_down_exit"

    def test_between_signals_even_a_far_off_user_is_left_alone(self) -> None:
        service, _replayer, _portfolios = build_service(
            build_replay(
                target=ALL_STABLE,
                traded=False,
                action="hold",
                reason="regime_no_signal",
                rule_group="none",
                details={"matched_rule_name": "regime_no_signal_hold"},
            ),
            holdings={"btc": 9_000.0, "stable": 1_000.0},
        )

        response = service.get_daily_suggestion(USER_ID)

        assert response.action.status == "no_action"
        assert response.action.required is False
        assert response.action.kind is None
        assert response.action.transfers == []
        assert response.action.reason_code == "regime_no_signal"


class TestBlockedDays:
    def test_an_execution_block_reason_is_surfaced(self) -> None:
        service, _replayer, _portfolios = build_service(
            build_replay(
                traded=False,
                action="hold",
                reason="regime_no_signal",
                blocked_reason="trade_quota_min_interval_active",
            ),
        )

        response = service.get_daily_suggestion(USER_ID)

        assert response.action.status == "blocked"
        assert response.action.required is False
        assert response.action.reason_code == "trade_quota_min_interval_active"
        assert response.action.transfers == []

    def test_a_nested_block_reason_in_plugin_diagnostics_is_surfaced(self) -> None:
        service, _replayer, _portfolios = build_service(
            build_replay(
                traded=False,
                action="hold",
                reason="regime_no_signal",
                plugin_diagnostics={
                    "quota": {"state": {"block_reason": "cooling_off"}}
                },
            ),
        )

        response = service.get_daily_suggestion(USER_ID)

        assert response.action.status == "blocked"
        assert response.action.reason_code == "cooling_off"

    def test_a_trade_quota_hold_decision_counts_as_blocked(self) -> None:
        service, _replayer, _portfolios = build_service(
            build_replay(
                traded=False,
                action="hold",
                reason="trade_quota_max_trades_7d_reached",
                rule_group="none",
            ),
        )

        response = service.get_daily_suggestion(USER_ID)

        assert response.action.status == "blocked"
        assert response.action.reason_code == "trade_quota_max_trades_7d_reached"

    def test_a_trade_quota_reason_on_a_real_trade_is_not_a_block(self) -> None:
        service, _replayer, _portfolios = build_service(
            build_replay(
                traded=False,
                action="buy",
                reason="trade_quota_note_on_a_buy",
            ),
        )

        response = service.get_daily_suggestion(USER_ID)

        assert response.action.status == "no_action"


class TestResponseContext:
    def test_market_signal_and_strategy_come_from_the_models_last_bar(self) -> None:
        details = {
            "matched_rule_name": "cross_down_exit",
            "portfolio_rule_matches": [{"rule_name": "cross_down_exit"}],
            "cooldown_skipped_rules": [{"rule_name": "dma_overextension_dca_sell"}],
        }
        replay = build_replay(details=details)
        service, _replayer, _portfolios = build_service(replay)

        response = service.get_daily_suggestion(USER_ID)

        assert response.as_of == NOW
        assert response.config_id == DEFAULT_CONFIG_ID
        assert response.config_display_name == "DMA/FGI Portfolio Rules"
        assert response.strategy_id == "dma_fgi_portfolio_rules"
        assert response.context.market == replay.market
        assert response.context.signal == replay.state.signal
        assert response.context.strategy.stance == "sell"
        assert response.context.strategy.reason_code == "portfolio_cross_down_exit"
        assert response.context.strategy.rule_group == "cross"
        assert response.context.strategy.details == details
        assert (
            response.context.target.allocation
            == replay.state.decision.target_allocation
        )

    def test_model_state_exposes_the_models_own_holdings_and_window(self) -> None:
        model_allocation = {
            "btc": 0.0,
            "eth": 0.1,
            "spy": 0.9,
            "stable": 0.0,
            "alt": 0.0,
        }
        replay = build_replay(
            target=model_allocation, model_allocation=model_allocation
        )
        service, _replayer, _portfolios = build_service(replay)

        model = service.get_daily_suggestion(USER_ID).context.model

        assert model.allocation == AssetAllocation(**model_allocation)
        assert model.window == replay.window
        assert model.window.requested.end_date == MODEL_DAY

    def test_portfolio_describes_the_user_not_the_model(self) -> None:
        service, _replayer, portfolios = build_service(build_replay())
        portfolios.holdings_by_user[USER_ID] = {
            "btc": 2_500.0,
            "stable": 7_500.0,
            "debt": 2_000.0,
        }

        portfolio = service.get_daily_suggestion(USER_ID).context.portfolio

        assert portfolio.spot_usd == pytest.approx(2_500.0)
        assert portfolio.stable_usd == pytest.approx(7_500.0)
        assert portfolio.total_value == pytest.approx(10_000.0)
        assert portfolio.total_assets_usd == pytest.approx(10_000.0)
        assert portfolio.total_debt_usd == pytest.approx(2_000.0)
        assert portfolio.total_net_usd == pytest.approx(8_000.0)
        assert portfolio.allocation == Allocation(spot=0.25, stable=0.75)
        assert portfolio.asset_allocation == AssetAllocation(
            btc=0.25, eth=0.0, spy=0.0, stable=0.75, alt=0.0
        )
        assert portfolio.spot_asset == "BTC"

    def test_data_freshness_is_passed_through(self) -> None:
        freshness = MarketDataFreshness(
            requested_date=MODEL_DAY,
            effective_date=MODEL_DAY - timedelta(days=2),
            missing_dates=[MODEL_DAY - timedelta(days=1), MODEL_DAY],
            stale_features=[],
            max_lag_days=2,
        )
        service, _replayer, _portfolios = build_service(
            build_replay(freshness=freshness)
        )

        response = service.get_daily_suggestion(USER_ID)

        assert response.data_freshness == freshness
        assert response.data_freshness is not None
        assert response.data_freshness.is_stale is True

    def test_a_replay_without_a_signal_is_an_internal_error(self) -> None:
        replay = build_replay()
        replay.state.signal = None
        service, _replayer, _portfolios = build_service(replay)

        with pytest.raises(ValueError, match="missing signal state"):
            service.get_daily_suggestion(USER_ID)

    def test_asset_allocation_falls_back_to_the_two_bucket_split(self) -> None:
        buckets = PortfolioBuckets(spot_value=600.0, stable_value=400.0)
        resolve = StrategyDailySuggestionService._resolve_asset_allocation

        assert resolve(buckets, primary_asset="BTC") == AssetAllocation(
            btc=0.6, eth=0.0, spy=0.0, stable=0.4, alt=0.0
        )
        assert resolve(buckets, primary_asset=" eth ") == AssetAllocation(
            btc=0.0, eth=0.6, spy=0.0, stable=0.4, alt=0.0
        )
        assert resolve(buckets, primary_asset="SPY") == AssetAllocation(
            btc=0.0, eth=0.0, spy=0.6, stable=0.4, alt=0.0
        )
        assert resolve(buckets, primary_asset="SOL") == AssetAllocation(
            btc=0.0, eth=0.0, spy=0.0, stable=0.4, alt=0.6
        )


class TestConfigResolution:
    def test_unknown_config_is_a_caller_error(self) -> None:
        service, replayer, _portfolios = build_service(build_replay())

        with pytest.raises(ValueError, match="Unknown config_id 'nope'"):
            service.get_daily_suggestion(USER_ID, config_id="nope")

        assert replayer.calls == []

    def test_a_config_without_a_live_story_is_rejected(self) -> None:
        saved = get_default_seed_strategy_config().model_copy(
            update={"supports_daily_suggestion": False}
        )
        service, replayer, _portfolios = build_service(
            build_replay(),
            strategy_config_store=SimpleNamespace(resolve_config=lambda _id: saved),
        )

        with pytest.raises(ValueError, match="does not support /daily-suggestion"):
            service.get_daily_suggestion(USER_ID, config_id=saved.config_id)

        assert replayer.calls == []

    def test_the_default_config_and_its_explicit_id_share_one_entry(self) -> None:
        service, replayer, portfolios = build_service(build_replay())

        service.get_daily_suggestion(USER_ID)
        service.get_daily_suggestion(USER_ID, config_id=DEFAULT_CONFIG_ID)

        assert replayer.calls == [(DEFAULT_CONFIG_ID, MODEL_DAY)]
        assert portfolios.calls == [USER_ID]


class TestModelEndDate:
    def test_the_model_ends_on_utc_yesterday(self) -> None:
        service, replayer, _portfolios = build_service(build_replay())

        service.get_daily_suggestion(USER_ID)

        assert replayer.calls == [(DEFAULT_CONFIG_ID, MODEL_DAY)]

    def test_a_non_utc_clock_is_converted_before_taking_the_date(self) -> None:
        taipei = timezone(timedelta(hours=8))
        # 06:00 in Taipei on the 16th is still 22:00 UTC on the 15th.
        clock = Clock(datetime(2026, 5, 16, 6, 0, tzinfo=taipei))
        service, replayer, _portfolios = build_service(build_replay(), clock=clock)

        service.get_daily_suggestion(USER_ID)

        assert replayer.calls == [(DEFAULT_CONFIG_ID, date(2026, 5, 14))]

    def test_crossing_utc_midnight_replays_the_model_again(self) -> None:
        clock = Clock()
        service, replayer, _portfolios = build_service(build_replay(), clock=clock)

        service.get_daily_suggestion(USER_ID)
        clock.now = NOW + timedelta(days=1)
        service.get_daily_suggestion(USER_ID)

        assert [end for _config, end in replayer.calls] == [
            MODEL_DAY,
            MODEL_DAY + timedelta(days=1),
        ]

    def test_stale_market_data_surfaces_for_the_router_to_map(self) -> None:
        stale = MarketDataUnavailableError(
            "Market data lag exceeds 7-day tolerance",
            missing_assets=["BTC"],
            oldest_data_date=date(2026, 5, 1),
        )
        service, _replayer, _portfolios = build_service(stale)

        with pytest.raises(MarketDataUnavailableError) as raised:
            service.get_daily_suggestion(USER_ID)

        assert raised.value is stale


class TestCaching:
    def test_a_users_repeat_request_reuses_the_cached_response(self) -> None:
        service, replayer, portfolios = build_service(build_replay())

        first = service.get_daily_suggestion(USER_ID)
        second = service.get_daily_suggestion(USER_ID)

        assert first == second
        assert portfolios.calls == [USER_ID]
        assert len(replayer.calls) == 1

    def test_users_get_their_own_response_from_their_own_holdings(self) -> None:
        service, _replayer, portfolios = build_service(
            build_replay(target=ALL_STABLE, traded=True)
        )
        portfolios.holdings_by_user[USER_ID] = {"btc": 4_000.0, "stable": 6_000.0}
        portfolios.holdings_by_user[OTHER_USER_ID] = {"stable": 10_000.0}

        first = service.get_daily_suggestion(USER_ID)
        other = service.get_daily_suggestion(OTHER_USER_ID)

        assert _moves(first.action.transfers) == [("btc", "stable", 4_000.0)]
        assert other.action.transfers == []
        assert portfolios.calls == [USER_ID, OTHER_USER_ID]

    def test_a_new_canonical_snapshot_invalidates_the_cached_response(self) -> None:
        anchors = anchor_service([date(2026, 5, 14), date(2026, 5, 15)])
        service, _replayer, portfolios = build_service(
            build_replay(), canonical_snapshot_service=anchors
        )

        service.get_daily_suggestion(USER_ID)
        service.get_daily_suggestion(USER_ID)

        assert portfolios.calls == [USER_ID, USER_ID]

    def test_the_snapshot_anchor_is_optional(self) -> None:
        service, _replayer, _portfolios = build_service(build_replay())

        assert service._snapshot_anchor(USER_ID) == "no-snapshot-anchor"


def test_the_default_clock_reads_utc_now() -> None:
    before = datetime.now(UTC)

    now = _utc_now()

    assert now.utcoffset() == timedelta(0)
    assert before <= now <= datetime.now(UTC)
