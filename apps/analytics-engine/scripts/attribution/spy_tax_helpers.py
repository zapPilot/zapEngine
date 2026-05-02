"""Helpers for diagnosing SPY/crypto allocation tax in compare timelines."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from statistics import median
from typing import Any, Literal

Allocation = dict[str, float]
EventType = Literal["spy_entry", "spy_exit"]

ALLOCATION_KEYS = ("btc", "eth", "spy", "stable")
FORWARD_WINDOWS = (5, 10, 20)
SHARE_EPSILON = 1e-6


@dataclass(frozen=True)
class StrategyDay:
    """Parsed per-strategy state for one compare timeline day."""

    target_allocation: Allocation
    current_allocation: Allocation
    reason: str
    action: str
    rule_group: str
    signal_details: dict[str, Any]
    decision_details: dict[str, Any]


@dataclass(frozen=True)
class JoinedTimelineDay:
    """Baseline/reference state aligned by calendar date."""

    snapshot_date: date
    prices: dict[str, float]
    fgi: float | None
    fgi_label: str | None
    baseline: StrategyDay
    reference: StrategyDay


@dataclass(frozen=True)
class ForwardOutcome:
    """Forward returns from a divergence date."""

    window_days: int
    spy_return: float | None
    btc_return: float | None
    eth_return: float | None
    crypto_return: float | None


@dataclass(frozen=True)
class DivergenceEvent:
    """Allocation divergence event between hierarchical and ETH/BTC minimum."""

    event_type: EventType
    snapshot_date: date
    baseline_spy_share: float
    baseline_crypto_share: float
    reference_crypto_share: float
    reference_stable_share: float
    crypto_cut_size: float
    market_context: dict[str, Any]
    forward_outcomes: tuple[ForwardOutcome, ...]
    resolves_within_30d: bool
    oscillates_within_7d: bool
    regret_10d: float | None


@dataclass(frozen=True)
class DiagnosticStats:
    """Aggregate diagnostic summary."""

    total_events: int
    spy_entry_count: int
    spy_exit_count: int
    oscillation_count: int
    negative_spy_5d_entry_rate: float
    median_crypto_cut_size: float
    total_regret_10d: float
    crypto_continues_10d_count: int
    verdicts: tuple[str, ...]
    verdict_rationale: tuple[str, ...]


def align_timelines(
    *,
    payload: dict[str, Any],
    baseline_strategy: str,
    reference_strategy: str,
) -> list[JoinedTimelineDay]:
    """Parse a compare response timeline into baseline/reference joined rows."""

    raw_timeline = payload.get("timeline")
    if not isinstance(raw_timeline, list):
        raise ValueError("Compare response must include a timeline list")

    days: list[JoinedTimelineDay] = []
    for raw_point in raw_timeline:
        if not isinstance(raw_point, dict):
            continue
        raw_market = raw_point.get("market")
        raw_strategies = raw_point.get("strategies")
        if not isinstance(raw_market, dict) or not isinstance(raw_strategies, dict):
            continue
        raw_date = raw_market.get("date")
        if not isinstance(raw_date, str):
            continue
        baseline_raw = raw_strategies.get(baseline_strategy)
        reference_raw = raw_strategies.get(reference_strategy)
        if not isinstance(baseline_raw, dict) or not isinstance(reference_raw, dict):
            continue
        days.append(
            JoinedTimelineDay(
                snapshot_date=date.fromisoformat(raw_date),
                prices=_parse_price_map(raw_market.get("token_price")),
                fgi=_parse_fgi(raw_market),
                fgi_label=_parse_optional_str(raw_market.get("sentiment_label")),
                baseline=_parse_strategy_day(baseline_raw),
                reference=_parse_strategy_day(reference_raw),
            )
        )

    if not days:
        raise ValueError("No aligned timeline rows found in compare response")
    return sorted(days, key=lambda day: day.snapshot_date)


def detect_divergence_events(days: list[JoinedTimelineDay]) -> list[DivergenceEvent]:
    """Find SPY entry/exit divergences and annotate forward outcomes."""

    events: list[DivergenceEvent] = []
    for index, day in enumerate(days):
        previous = days[index - 1] if index > 0 else None
        current_spy = _share(day.baseline.target_allocation, "spy")
        previous_spy = (
            0.0
            if previous is None
            else _share(previous.baseline.target_allocation, "spy")
        )
        if current_spy > SHARE_EPSILON and previous_spy <= SHARE_EPSILON:
            events.append(
                _build_event(
                    days=days,
                    index=index,
                    event_type="spy_entry",
                    previous_day=previous,
                )
            )
        if current_spy <= SHARE_EPSILON and previous_spy > SHARE_EPSILON:
            events.append(
                _build_event(
                    days=days,
                    index=index,
                    event_type="spy_exit",
                    previous_day=previous,
                )
            )

    return _annotate_oscillations(events)


def summarize_events(events: list[DivergenceEvent]) -> DiagnosticStats:
    """Aggregate event statistics and produce the rule-based verdict."""

    entries = [event for event in events if event.event_type == "spy_entry"]
    exits = [event for event in events if event.event_type == "spy_exit"]
    oscillation_count = sum(1 for event in entries if event.oscillates_within_7d)
    negative_spy_5d = [
        event
        for event in entries
        if (outcome := _forward_outcome(event, 5)) is not None
        and outcome.spy_return is not None
        and outcome.spy_return < 0.0
    ]
    crypto_cuts = [event.crypto_cut_size for event in entries]
    median_crypto_cut_size = median(crypto_cuts) if crypto_cuts else 0.0
    regret_values = [
        event.regret_10d for event in entries if event.regret_10d is not None
    ]
    total_regret_10d = sum(max(0.0, value) for value in regret_values)
    crypto_continues_10d = [
        event
        for event in entries
        if (outcome := _forward_outcome(event, 10)) is not None
        and outcome.crypto_return is not None
        and outcome.spy_return is not None
        and event.crypto_cut_size > SHARE_EPSILON
        and outcome.crypto_return > 0.0
        and outcome.crypto_return > outcome.spy_return
    ]
    negative_rate = len(negative_spy_5d) / len(entries) if entries else 0.0
    crypto_continues_rate = len(crypto_continues_10d) / len(entries) if entries else 0.0

    verdicts: list[str] = []
    rationale: list[str] = []
    if negative_rate > 0.30:
        verdicts.append("S1")
        rationale.append(
            "SPY entries have negative 5-day forward SPY returns more than 30% "
            f"of the time ({negative_rate:.1%})."
        )
    if median_crypto_cut_size > 0.30:
        verdicts.append("S2")
        rationale.append(
            "Median crypto cut at SPY entry exceeds 30 percentage points "
            f"({median_crypto_cut_size:.1%})."
        )
    if oscillation_count > 5:
        verdicts.append("S4")
        rationale.append(
            "SPY entry/exit oscillations within 7 days exceed the threshold "
            f"({oscillation_count})."
        )
    if crypto_continues_rate > 0.30:
        for verdict in ("S2", "S3"):
            if verdict not in verdicts:
                verdicts.append(verdict)
        rationale.append(
            "Crypto keeps outperforming SPY over the next 10 days on more than "
            f"30% of SPY-entry cuts ({crypto_continues_rate:.1%})."
        )
    if not verdicts:
        verdicts.append("inconclusive")
        rationale.append("No rule threshold fired; inspect per-event rows.")

    return DiagnosticStats(
        total_events=len(events),
        spy_entry_count=len(entries),
        spy_exit_count=len(exits),
        oscillation_count=oscillation_count,
        negative_spy_5d_entry_rate=negative_rate,
        median_crypto_cut_size=median_crypto_cut_size,
        total_regret_10d=total_regret_10d,
        crypto_continues_10d_count=len(crypto_continues_10d),
        verdicts=tuple(verdicts),
        verdict_rationale=tuple(rationale),
    )


def render_markdown_report(
    *,
    baseline_strategy: str,
    reference_strategy: str,
    reference_date: date,
    window_days: int,
    events: list[DivergenceEvent],
    stats: DiagnosticStats,
    summaries: dict[str, Any],
) -> str:
    """Render the diagnostic in a stable, commit-friendly markdown format."""

    lines = [
        "# SPY/Crypto Switch-Timing Diagnostic",
        "",
        f"- **Baseline strategy**: `{baseline_strategy}`",
        f"- **Reference strategy**: `{reference_strategy}`",
        f"- **Reference date**: `{reference_date.isoformat()}`",
        f"- **Window days**: {window_days}",
        "",
        "## Strategy Summary",
        "",
        "| Strategy | ROI | Trades | Calmar | MaxDD |",
        "|---|---:|---:|---:|---:|",
    ]
    for strategy_id in (baseline_strategy, reference_strategy):
        summary = summaries.get(strategy_id, {})
        lines.append(
            "| "
            + " | ".join(
                (
                    f"`{strategy_id}`",
                    _format_percent(summary.get("roi_percent")),
                    _format_int(summary.get("trade_count")),
                    _format_float(summary.get("calmar_ratio")),
                    _format_percent(summary.get("max_drawdown_percent")),
                )
            )
            + " |"
        )

    lines.extend(
        [
            "",
            "## Summary",
            "",
            "| Metric | Value |",
            "|---|---:|",
            f"| Total divergence events | {stats.total_events} |",
            f"| SPY entries | {stats.spy_entry_count} |",
            f"| SPY exits | {stats.spy_exit_count} |",
            f"| Both-above oscillations (entry+exit within 7d) | {stats.oscillation_count} |",
            (
                "| SPY entries with negative 5-day forward return | "
                f"{stats.negative_spy_5d_entry_rate:.1%} |"
            ),
            (
                "| Median crypto-cut size at SPY entry | "
                f"{_pp(stats.median_crypto_cut_size)} |"
            ),
            f"| Total 10-day regret | {_pp(stats.total_regret_10d)} |",
            (
                "| Crypto-outperforms-SPY 10d entries | "
                f"{stats.crypto_continues_10d_count} |"
            ),
            "",
            "## Pattern verdict:",
            "",
            f"**{', '.join(stats.verdicts)}**",
            "",
        ]
    )
    lines.extend(f"- {item}" for item in stats.verdict_rationale)

    lines.extend(
        [
            "",
            "## Event Details",
            "",
        ]
    )
    for event in events:
        lines.extend(_render_event(event))
    return "\n".join(lines).rstrip() + "\n"


def _build_event(
    *,
    days: list[JoinedTimelineDay],
    index: int,
    event_type: EventType,
    previous_day: JoinedTimelineDay | None,
) -> DivergenceEvent:
    day = days[index]
    baseline_crypto = _crypto_share(day.baseline.target_allocation)
    reference_crypto = _crypto_share(day.reference.target_allocation)
    previous_crypto = (
        baseline_crypto
        if previous_day is None
        else _crypto_share(previous_day.baseline.target_allocation)
    )
    crypto_cut_size = max(0.0, previous_crypto - baseline_crypto)
    forward_outcomes = tuple(
        _forward_outcome_from_index(days=days, index=index, window_days=window_days)
        for window_days in FORWARD_WINDOWS
    )
    outcome_10d = next(
        (outcome for outcome in forward_outcomes if outcome.window_days == 10),
        None,
    )
    regret_10d = _regret_contribution(
        event_crypto_cut=crypto_cut_size,
        outcome=outcome_10d,
    )
    return DivergenceEvent(
        event_type=event_type,
        snapshot_date=day.snapshot_date,
        baseline_spy_share=_share(day.baseline.target_allocation, "spy"),
        baseline_crypto_share=baseline_crypto,
        reference_crypto_share=reference_crypto,
        reference_stable_share=_share(day.reference.target_allocation, "stable"),
        crypto_cut_size=crypto_cut_size,
        market_context=_market_context(day),
        forward_outcomes=forward_outcomes,
        resolves_within_30d=_resolves_within(days=days, index=index, max_days=30),
        oscillates_within_7d=False,
        regret_10d=regret_10d,
    )


def _annotate_oscillations(events: list[DivergenceEvent]) -> list[DivergenceEvent]:
    annotated: list[DivergenceEvent] = []
    for event in events:
        if event.event_type != "spy_entry":
            annotated.append(event)
            continue
        oscillates = any(
            other.event_type == "spy_exit"
            and 0 <= (other.snapshot_date - event.snapshot_date).days <= 7
            for other in events
        )
        annotated.append(
            DivergenceEvent(
                event_type=event.event_type,
                snapshot_date=event.snapshot_date,
                baseline_spy_share=event.baseline_spy_share,
                baseline_crypto_share=event.baseline_crypto_share,
                reference_crypto_share=event.reference_crypto_share,
                reference_stable_share=event.reference_stable_share,
                crypto_cut_size=event.crypto_cut_size,
                market_context=event.market_context,
                forward_outcomes=event.forward_outcomes,
                resolves_within_30d=event.resolves_within_30d,
                oscillates_within_7d=oscillates,
                regret_10d=event.regret_10d,
            )
        )
    return annotated


def _parse_strategy_day(raw_strategy: dict[str, Any]) -> StrategyDay:
    raw_decision = raw_strategy.get("decision")
    raw_portfolio = raw_strategy.get("portfolio")
    raw_signal = raw_strategy.get("signal")
    if not isinstance(raw_decision, dict):
        raw_decision = {}
    if not isinstance(raw_portfolio, dict):
        raw_portfolio = {}
    if not isinstance(raw_signal, dict):
        raw_signal = {}

    target_allocation = _parse_allocation(raw_decision.get("target_allocation"))
    current_allocation = _parse_allocation(raw_portfolio.get("asset_allocation"))
    raw_signal_details = raw_signal.get("details")
    raw_decision_details = raw_decision.get("details")
    return StrategyDay(
        target_allocation=target_allocation,
        current_allocation=current_allocation,
        reason=str(raw_decision.get("reason") or ""),
        action=str(raw_decision.get("action") or ""),
        rule_group=str(raw_decision.get("rule_group") or ""),
        signal_details=(
            dict(raw_signal_details) if isinstance(raw_signal_details, dict) else {}
        ),
        decision_details=(
            dict(raw_decision_details) if isinstance(raw_decision_details, dict) else {}
        ),
    )


def _parse_allocation(raw: Any) -> Allocation:
    if not isinstance(raw, dict):
        return dict.fromkeys(ALLOCATION_KEYS, 0.0)
    return {
        key: max(0.0, float(raw.get(key, 0.0)))
        if isinstance(raw.get(key, 0.0), int | float)
        else 0.0
        for key in ALLOCATION_KEYS
    }


def _parse_price_map(raw: Any) -> dict[str, float]:
    if not isinstance(raw, dict):
        return {}
    prices: dict[str, float] = {}
    for key, value in raw.items():
        if isinstance(key, str) and isinstance(value, int | float) and value > 0:
            prices[key.lower()] = float(value)
    return prices


def _parse_fgi(raw_market: dict[str, Any]) -> float | None:
    sentiment = raw_market.get("sentiment")
    if isinstance(sentiment, int | float):
        return float(sentiment)
    macro = raw_market.get("macro_fear_greed")
    if isinstance(macro, dict):
        score = macro.get("score")
        if isinstance(score, int | float):
            return float(score)
    return None


def _parse_optional_str(raw: Any) -> str | None:
    return raw if isinstance(raw, str) else None


def _share(allocation: Allocation, key: str) -> float:
    return max(0.0, float(allocation.get(key, 0.0)))


def _crypto_share(allocation: Allocation) -> float:
    return _share(allocation, "btc") + _share(allocation, "eth")


def _forward_outcome_from_index(
    *,
    days: list[JoinedTimelineDay],
    index: int,
    window_days: int,
) -> ForwardOutcome:
    start = days[index]
    end_index = index + window_days
    if end_index >= len(days):
        return ForwardOutcome(
            window_days=window_days,
            spy_return=None,
            btc_return=None,
            eth_return=None,
            crypto_return=None,
        )
    end = days[end_index]
    spy_return = _asset_return(start.prices, end.prices, "spy")
    btc_return = _asset_return(start.prices, end.prices, "btc")
    eth_return = _asset_return(start.prices, end.prices, "eth")
    start_crypto = _crypto_share(start.reference.target_allocation)
    btc_weight = (
        0.5
        if start_crypto <= 0.0
        else _share(start.reference.target_allocation, "btc") / start_crypto
    )
    crypto_return = _weighted_return(
        left_return=btc_return,
        right_return=eth_return,
        left_weight=btc_weight,
    )
    return ForwardOutcome(
        window_days=window_days,
        spy_return=spy_return,
        btc_return=btc_return,
        eth_return=eth_return,
        crypto_return=crypto_return,
    )


def _asset_return(
    start_prices: dict[str, float],
    end_prices: dict[str, float],
    asset: str,
) -> float | None:
    start = start_prices.get(asset)
    end = end_prices.get(asset)
    if start is None or end is None or start <= 0.0:
        return None
    return (end / start) - 1.0


def _weighted_return(
    *,
    left_return: float | None,
    right_return: float | None,
    left_weight: float,
) -> float | None:
    if left_return is None or right_return is None:
        return None
    bounded_weight = max(0.0, min(1.0, left_weight))
    return (bounded_weight * left_return) + ((1.0 - bounded_weight) * right_return)


def _regret_contribution(
    *,
    event_crypto_cut: float,
    outcome: ForwardOutcome | None,
) -> float | None:
    if outcome is None or outcome.crypto_return is None or outcome.spy_return is None:
        return None
    return event_crypto_cut * (outcome.crypto_return - outcome.spy_return)


def _resolves_within(
    *,
    days: list[JoinedTimelineDay],
    index: int,
    max_days: int,
) -> bool:
    end_index = min(len(days) - 1, index + max_days)
    for day in days[index + 1 : end_index + 1]:
        if _share(day.baseline.target_allocation, "spy") <= SHARE_EPSILON:
            return True
    return False


def _market_context(day: JoinedTimelineDay) -> dict[str, Any]:
    signal = day.baseline.signal_details
    crypto_dma = signal.get("dma") if isinstance(signal.get("dma"), dict) else {}
    spy_dma = signal.get("spy_dma") if isinstance(signal.get("spy_dma"), dict) else {}
    return {
        "fgi": day.fgi,
        "fgi_label": day.fgi_label,
        "prices": day.prices,
        "spy_dma": spy_dma,
        "crypto_dma": crypto_dma,
        "outer_reason": day.baseline.decision_details.get("outer_reason"),
        "inner_reason": day.baseline.decision_details.get("inner_reason"),
        "outer_ratio_zone": day.baseline.decision_details.get("outer_ratio_zone"),
        "inner_ratio_zone": day.baseline.decision_details.get("inner_ratio_zone"),
        "crypto_dma_reference_asset": day.baseline.decision_details.get(
            "crypto_dma_reference_asset"
        ),
    }


def _forward_outcome(
    event: DivergenceEvent,
    window_days: int,
) -> ForwardOutcome | None:
    return next(
        (
            outcome
            for outcome in event.forward_outcomes
            if outcome.window_days == window_days
        ),
        None,
    )


def _render_event(event: DivergenceEvent) -> list[str]:
    title = (
        "SPY entry divergence"
        if event.event_type == "spy_entry"
        else "SPY exit divergence"
    )
    lines = [
        f"### {event.snapshot_date.isoformat()} - {title}",
        "",
        "| Field | Value |",
        "|---|---:|",
        f"| Baseline SPY target | {_pp(event.baseline_spy_share)} |",
        f"| Baseline crypto target | {_pp(event.baseline_crypto_share)} |",
        f"| Reference crypto target | {_pp(event.reference_crypto_share)} |",
        f"| Reference stable target | {_pp(event.reference_stable_share)} |",
        f"| Crypto cut size | {_pp(event.crypto_cut_size)} |",
        f"| Resolves within 30d | {_yes_no(event.resolves_within_30d)} |",
        f"| Oscillates within 7d | {_yes_no(event.oscillates_within_7d)} |",
        f"| 10d regret | {_optional_pp(event.regret_10d)} |",
        "",
        "Market context:",
        "",
        "| Context | Value |",
        "|---|---|",
        f"| FGI | {_optional_float(event.market_context.get('fgi'))} |",
        f"| FGI label | {event.market_context.get('fgi_label') or 'n/a'} |",
        f"| Outer reason | {event.market_context.get('outer_reason') or 'n/a'} |",
        f"| Inner reason | {event.market_context.get('inner_reason') or 'n/a'} |",
        (
            "| Crypto DMA reference | "
            f"{event.market_context.get('crypto_dma_reference_asset') or 'n/a'} |"
        ),
        (
            "| SPY DMA distance | "
            f"{_dma_value(event.market_context, 'spy_dma', 'distance')} |"
        ),
        (f"| SPY DMA zone | {_dma_value(event.market_context, 'spy_dma', 'zone')} |"),
        (
            "| Crypto DMA distance | "
            f"{_dma_value(event.market_context, 'crypto_dma', 'distance')} |"
        ),
        (
            "| Crypto DMA zone | "
            f"{_dma_value(event.market_context, 'crypto_dma', 'zone')} |"
        ),
        "",
        "Forward returns:",
        "",
        "| Window | SPY | BTC | ETH | Reference crypto mix |",
        "|---:|---:|---:|---:|---:|",
    ]
    for outcome in event.forward_outcomes:
        lines.append(
            "| "
            + " | ".join(
                (
                    f"{outcome.window_days}d",
                    _optional_pp(outcome.spy_return),
                    _optional_pp(outcome.btc_return),
                    _optional_pp(outcome.eth_return),
                    _optional_pp(outcome.crypto_return),
                )
            )
            + " |"
        )
    lines.append("")
    return lines


def _dma_value(context: dict[str, Any], section: str, key: str) -> str:
    raw_section = context.get(section)
    if not isinstance(raw_section, dict):
        return "n/a"
    value = raw_section.get(key)
    if isinstance(value, int | float):
        return _optional_pp(value) if key == "distance" else f"{value:.4f}"
    return str(value) if value is not None else "n/a"


def _format_percent(value: Any) -> str:
    return f"{float(value):.2f}%" if isinstance(value, int | float) else "n/a"


def _format_float(value: Any) -> str:
    return f"{float(value):.2f}" if isinstance(value, int | float) else "n/a"


def _format_int(value: Any) -> str:
    return str(int(value)) if isinstance(value, int | float) else "n/a"


def _optional_float(value: Any) -> str:
    return f"{float(value):.2f}" if isinstance(value, int | float) else "n/a"


def _optional_pp(value: float | None) -> str:
    return "n/a" if value is None else _pp(value)


def _pp(value: float) -> str:
    return f"{value * 100.0:.2f}pp"


def _yes_no(value: bool) -> str:
    return "yes" if value else "no"
