"""The live suggestion is the backtest model's last bar, not a second strategy.

Before this, the daily suggestion rebuilt the strategy per request with no
history: no previous FGI label (so ``fgi_downshift_dca_sell`` could never fire),
no rule cooldowns (so trims fired every day), no DMA cooldown. It disagreed with
the backtest it was supposed to follow. These tests pin the replacement: for
sampled days the live response must equal the compare engine's last bar for the
same window, field by field, including the whole rule trace.
"""

from __future__ import annotations

import asyncio
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta

import pytest

from src.models.backtesting import (
    BacktestCompareConfigV3,
    BacktestCompareRequestV3,
    BacktestResponse,
)
from src.models.strategy import DailySuggestionResponse
from src.services.backtesting.constants import (
    MODEL_TOTAL_CAPITAL,
    MODEL_WINDOW_DAYS,
    STRATEGY_DMA_FGI_PORTFOLIO_RULES,
)
from src.services.backtesting.lab.synthetic import SyntheticMarket, synthetic_market
from src.services.backtesting.validation.event_runner import ValidationEvent
from src.services.strategy import backtesting_service as backtesting_service_module
from src.services.strategy.backtesting_service import BacktestingService
from src.services.strategy.strategy_daily_suggestion_service import (
    StrategyDailySuggestionService,
)
from tests.services.backtesting.support.synthetic_services import (
    SyntheticMarketServices,
)
from tests.services.strategy.support import USER_ID, Clock, UserPortfolios

# The validation-event histories are the repo's behavioral fixtures: each one
# is shaped so a specific rule must fire on its last day. Their builders live in
# the validation test module and are reused rather than copied.
from tests.test_validation_events import (  # isort: skip
    EVENTS,
    _run_validation_compare,
    _synthetic_market_history,
)

CONFIG_ID = "dma_fgi_portfolio_rules_default"
# Shorter than production so dozens of end dates stay cheap; parity does not
# depend on the window length, only on live and compare sharing it.
PARITY_WINDOW_DAYS = 100
SCAN_STRIDE_DAYS = 40
FIRST_SCANNED_ROW = 130
DEFAULT_RULES = {
    "cross_down_exit",
    "cross_up_equal_weight",
    "dma_overextension_dca_sell",
    "eth_btc_deviation_dca",
    "eth_btc_ratio_rotation",
    "fgi_downshift_dca_sell",
}
USER_HOLDINGS = {"btc": 3_000.0, "eth": 1_500.0, "spy": 1_000.0, "stable": 4_500.0}


@dataclass(frozen=True)
class Scan:
    market: SyntheticMarket
    backtesting: BacktestingService
    daily: StrategyDailySuggestionService
    clock: Clock
    live_by_day: dict[date, DailySuggestionResponse]

    def live_on(self, day: date) -> DailySuggestionResponse:
        """The live suggestion a user would get the morning after ``day``."""
        self.clock.now = datetime.combine(
            day + timedelta(days=1), time(3, 0), tzinfo=UTC
        )
        return self.daily.get_daily_suggestion(USER_ID)


def _matched_rule(response: DailySuggestionResponse) -> str:
    return str(response.context.strategy.details["matched_rule_name"])


def _candidate_days(scan: Scan) -> list[date]:
    """A coarse stride over the market plus the days each rare rule fired.

    Rare rules (crosses, rotations) would be missed by stride alone. One cheap
    full-length compare finds where they fire; the live replay at those days
    then has to agree with a compare over its own window.
    """
    rows = scan.market.prices[FIRST_SCANNED_ROW:]
    days = {row["date"] for row in rows[::SCAN_STRIDE_DAYS]}
    first_scanned = rows[0]["date"]
    long_run = asyncio.run(
        scan.backtesting.run_compare_v3(
            BacktestCompareRequestV3(
                token_symbol="BTC",
                start_date=scan.market.user_start_date,
                end_date=rows[-1]["date"],
                total_capital=MODEL_TOTAL_CAPITAL,
                configs=[
                    BacktestCompareConfigV3(
                        config_id=CONFIG_ID, saved_config_id=CONFIG_ID
                    )
                ],
            )
        )
    )
    fired_on: dict[str, list[date]] = {}
    for point in long_run.timeline:
        if point.market.date < first_scanned:
            continue
        rule = str(point.strategies[CONFIG_ID].decision.details["matched_rule_name"])
        fired_on.setdefault(rule, []).append(point.market.date)
    for fired in fired_on.values():
        days.update({fired[0], fired[-1]})
    return sorted(days)


@pytest.fixture(scope="module")
def scan() -> Iterator[Scan]:
    with pytest.MonkeyPatch.context() as patch:
        patch.setattr(
            backtesting_service_module, "MODEL_WINDOW_DAYS", PARITY_WINDOW_DAYS
        )
        market = synthetic_market(seed=2, scenario="stress", days=600)
        backtesting = SyntheticMarketServices(market).build_backtesting_service()
        clock = Clock()
        daily = StrategyDailySuggestionService(
            landing_page_service=UserPortfolios(**USER_HOLDINGS),  # type: ignore[arg-type]
            backtesting_service=backtesting,
            clock=clock,
        )
        scan = Scan(
            market=market,
            backtesting=backtesting,
            daily=daily,
            clock=clock,
            live_by_day={},
        )
        for day in _candidate_days(scan):
            scan.live_by_day[day] = scan.live_on(day)
        yield scan


def _sampled_days(scan: Scan) -> list[date]:
    """Up to the first and last day each rule won, plus a few holds."""
    days_by_rule: dict[str, list[date]] = {}
    for day, response in scan.live_by_day.items():
        days_by_rule.setdefault(_matched_rule(response), []).append(day)
    sampled: set[date] = set()
    for rule, days in days_by_rule.items():
        if rule == "regime_no_signal_hold":
            sampled.update(days[:: max(len(days) // 3, 1)][:3])
        else:
            sampled.update({days[0], days[-1]})
    return sorted(sampled)


def _compare_last_bar(scan: Scan, day: date) -> tuple[BacktestResponse, int]:
    compare = asyncio.run(
        scan.backtesting.run_compare_v3(
            BacktestCompareRequestV3(
                token_symbol="BTC",
                start_date=day - timedelta(days=PARITY_WINDOW_DAYS - 1),
                end_date=day,
                total_capital=MODEL_TOTAL_CAPITAL,
                configs=[
                    BacktestCompareConfigV3(
                        config_id=CONFIG_ID, saved_config_id=CONFIG_ID
                    )
                ],
            )
        )
    )
    return compare, len(compare.timeline) - 1


def test_the_sample_exercises_every_default_rule_and_both_kinds_of_day(
    scan: Scan,
) -> None:
    """A parity check over days where nothing fires would prove nothing."""
    sampled = _sampled_days(scan)
    rules = {_matched_rule(scan.live_by_day[day]) for day in sampled}
    statuses = {scan.live_by_day[day].action.status for day in sampled}

    assert DEFAULT_RULES <= rules
    assert "regime_no_signal_hold" in rules
    assert {"action_required", "no_action"} <= statuses
    assert len(sampled) >= 8


def test_live_suggestions_equal_the_compare_models_last_bar(scan: Scan) -> None:
    for day in _sampled_days(scan):
        live = scan.live_by_day[day]
        compare, last = _compare_last_bar(scan, day)
        point = compare.timeline[last]
        state = point.strategies[CONFIG_ID]
        context = live.context

        assert point.market.date == day, day
        assert context.market == point.market, day
        assert context.signal == state.signal, day
        assert context.strategy.stance == state.decision.action, day
        assert context.strategy.reason_code == state.decision.reason, day
        assert context.strategy.rule_group == state.decision.rule_group, day
        # Includes portfolio_rule_matches and cooldown_skipped_rules.
        assert context.strategy.details == state.decision.details, day
        assert context.target.allocation.model_dump() == pytest.approx(
            state.decision.target_allocation.model_dump(), abs=1e-12
        ), day
        assert context.model.allocation == state.portfolio.asset_allocation, day
        assert context.model.window == compare.window, day
        assert live.data_freshness == compare.data_freshness, day


def test_the_user_is_asked_to_move_only_on_days_the_model_moved(scan: Scan) -> None:
    asked = 0
    left_alone = 0
    for day in _sampled_days(scan):
        live = scan.live_by_day[day]
        compare, last = _compare_last_bar(scan, day)
        model_traded = bool(
            compare.timeline[last].strategies[CONFIG_ID].execution.transfers
        )

        if live.action.required:
            asked += 1
            assert model_traded, day
            assert live.action.transfers, day
        else:
            left_alone += 1
            assert live.action.transfers == [], day
            assert live.action.status in {"no_action", "blocked"}, day
    assert asked > 0
    assert left_alone > 0


def test_a_live_response_survives_the_json_wire_round_trip(scan: Scan) -> None:
    """The route returns this model serialized; the contract must re-parse it."""
    for live in scan.live_by_day.values():
        wire = live.model_dump(mode="json")

        assert DailySuggestionResponse.model_validate(wire) == live
        assert wire["context"]["model"]["window"]["truncated"] is False


def test_fgi_downshift_fires_live_as_it_does_in_the_backtest(scan: Scan) -> None:
    """The live path used to start each request without FGI history."""
    fired = [
        day
        for day, response in scan.live_by_day.items()
        if _matched_rule(response) == "fgi_downshift_dca_sell"
    ]

    assert fired


def test_overextension_trims_respect_their_seven_day_cooldown(scan: Scan) -> None:
    """Without cooldown state, live trimmed again on every following day."""
    trim_days = sorted(
        day
        for day, response in scan.live_by_day.items()
        if _matched_rule(response) == "dma_overextension_dca_sell"
        and response.action.required
    )[:3]

    assert trim_days
    for day in trim_days:
        for offset in (1, 3, 6):
            following = scan.live_on(day + timedelta(days=offset))
            tried_again = (
                _matched_rule(following) == "dma_overextension_dca_sell"
                and following.action.required
            )
            assert not tried_again, (day, offset)


@pytest.mark.parametrize(
    ("scenario", "seed"),
    [("regimes", 1), ("stress", 2), ("stress", 5)],
)
def test_recent_decisions_do_not_depend_on_where_the_rolling_window_starts(
    scenario: str, seed: int
) -> None:
    """Live replays a window that slides daily, so its start must not matter.

    Two windows that end on the same day but start 30 days apart see different
    opening portfolios. Rules that rewrite the whole target (crosses, rotation)
    wash that difference out; this pins that the model has converged by the
    last 60 decisions at the production window length.
    """
    market = synthetic_market(seed=seed, scenario=scenario, days=700)  # type: ignore[arg-type]
    service = SyntheticMarketServices(market).build_backtesting_service()
    end = market.prices[-1]["date"]

    def last_decisions(start: date) -> list[tuple[object, ...]]:
        response = asyncio.run(
            service.run_compare_v3(
                BacktestCompareRequestV3(
                    token_symbol="BTC",
                    start_date=start,
                    end_date=end,
                    total_capital=MODEL_TOTAL_CAPITAL,
                    configs=[
                        BacktestCompareConfigV3(
                            config_id=CONFIG_ID, saved_config_id=CONFIG_ID
                        )
                    ],
                )
            )
        )
        rows: list[tuple[object, ...]] = []
        for point in response.timeline[-60:]:
            state = point.strategies[CONFIG_ID]
            target = state.decision.target_allocation.model_dump()
            rows.append(
                (
                    point.market.date,
                    state.decision.reason,
                    state.decision.details.get("matched_rule_name"),
                    tuple(round(target[key], 9) for key in sorted(target)),
                )
            )
        return rows

    full = last_decisions(end - timedelta(days=MODEL_WINDOW_DAYS - 1))
    shifted = last_decisions(end - timedelta(days=MODEL_WINDOW_DAYS - 1 - 30))

    assert len(full) == 60
    assert shifted == full


@pytest.mark.parametrize("event", EVENTS, ids=lambda event: event.id)
def test_live_matches_the_compare_engine_on_every_validation_event(
    event: ValidationEvent,
) -> None:
    """On each behavioral fixture, live says what the backtest says on that day."""
    prices, sentiments, start, end = _synthetic_market_history(event=event)
    market = SyntheticMarket(
        seed=0,
        scenario="regimes",
        prices=prices,
        sentiments=sentiments,
        user_start_date=start,
    )
    daily = StrategyDailySuggestionService(
        landing_page_service=UserPortfolios(**USER_HOLDINGS),  # type: ignore[arg-type]
        backtesting_service=SyntheticMarketServices(market).build_backtesting_service(),
        clock=Clock(datetime.combine(end + timedelta(days=1), time(3, 0), tzinfo=UTC)),
    )

    live = daily.get_daily_suggestion(USER_ID)

    compare = _run_validation_compare(
        prices=prices,
        sentiments=sentiments,
        start=start,
        end=end,
        strategy_ids=(STRATEGY_DMA_FGI_PORTFOLIO_RULES,),
    )
    last_bar = compare["timeline"][-1]
    state = last_bar["strategies"][STRATEGY_DMA_FGI_PORTFOLIO_RULES]
    assert last_bar["market"]["date"] == end.isoformat()
    assert live.context.market.date == end
    assert live.context.signal.model_dump(mode="json") == state["signal"]
    assert live.context.strategy.reason_code == state["decision"]["reason"]
    assert live.context.strategy.rule_group == state["decision"]["rule_group"]
    assert live.context.strategy.details == state["decision"]["details"]
    assert live.context.target.allocation.model_dump() == pytest.approx(
        state["decision"]["target_allocation"], abs=1e-12
    )
