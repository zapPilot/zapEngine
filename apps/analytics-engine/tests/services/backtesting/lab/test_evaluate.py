from __future__ import annotations

import json
from dataclasses import replace
from datetime import timedelta
from typing import Any

import pytest

from src.models.backtesting import BacktestAssumptions
from src.services.backtesting.lab import evaluate as evaluate_module
from src.services.backtesting.lab.benchmarks import BENCHMARK_IDS
from src.services.backtesting.lab.bundle import Bundle, synthetic_bundle
from src.services.backtesting.lab.evaluate import (
    STRATEGY_KEY,
    SYNTHETIC_WARNING,
    EvalConfig,
    components,
    evaluate,
    spec_ref,
)
from src.services.backtesting.lab.report import Report
from src.services.backtesting.spec import load_spec, parse_spec
from src.services.backtesting.strategy_registry import resolve_spec_strategy_config
from tests.services.backtesting.spec.helpers import reference_raw
from tests.services.backtesting.support.synthetic_runs import run_resolved_compare

GIT = {"sha": "abc", "dirty": False}
REF = "synthetic:regimes?seed=2&days=300"


@pytest.fixture(scope="module")
def spec():
    return load_spec("reference/dma_fgi")


@pytest.fixture(scope="module")
def bundle() -> Bundle:
    return synthetic_bundle(REF)


@pytest.fixture(scope="module")
def report(spec, bundle) -> Report:
    return evaluate(spec, bundle, git=GIT)


def test_a_report_names_everything_it_depends_on(report: Report, spec, bundle) -> None:
    body = report.body

    assert body["report_format"] == "strategy-report/1"
    assert body["fingerprint"]["spec"]["ref"] == spec_ref(spec)
    assert body["fingerprint"]["spec"]["id"] == "dma_fgi"
    assert body["fingerprint"]["bundle"]["content_sha256"] == (
        bundle.manifest.content_sha256
    )
    assert body["fingerprint"]["bundle"]["source"] == "synthetic"
    assert body["fingerprint"]["git"] == GIT
    assert body["fingerprint"]["eval_config_hash"].startswith("sha256:")
    assert body["assumptions"] == BacktestAssumptions().model_dump()
    assert body["total_capital"] == 10_000.0


def test_a_spec_ref_is_id_version_and_a_short_hash(spec) -> None:
    assert spec_ref(spec) == "dma_fgi@1#a22bccfabb4b"


def test_the_window_is_what_was_evaluated(report: Report, bundle) -> None:
    window = report.body["window"]

    assert window["days"] == 300
    assert window["start"] == bundle.manifest.start.isoformat()
    assert window["end"] == bundle.manifest.end.isoformat()
    assert window["requested_start"] == window["start"]


def test_the_strategy_and_every_benchmark_are_reported(report: Report) -> None:
    assert list(report.body["strategies"]) == [STRATEGY_KEY, *BENCHMARK_IDS]
    assert list(report.body["comparisons"]) == list(BENCHMARK_IDS)
    assert report.body["strategies"]["buy_hold_btc"]["trade_count"] == 0


def test_the_numbers_are_the_numbers_the_api_path_gives(
    report: Report, spec, bundle
) -> None:
    prices, sentiments, start, end = bundle.history()
    resolved = [
        replace(
            resolve_spec_strategy_config(spec, config_id="strategy"),
            request_config_id="strategy",
        )
    ]
    expected = run_resolved_compare(
        prices=prices, sentiments=sentiments, start=start, end=end, resolved=resolved
    ).strategies["strategy"]

    own = report.body["strategies"]["strategy"]

    assert own["final_value"] == round(expected.final_value, 6)
    assert own["roi_percent"] == round(expected.roi_percent, 6)
    assert own["max_drawdown_percent"] == round(expected.max_drawdown_percent, 6)
    assert own["sharpe_ratio"] == round(expected.sharpe_ratio, 6)
    assert own["trade_count"] == expected.trade_count


def test_profit_and_loss_split_adds_up_for_every_strategy(report: Report) -> None:
    for item in report.body["strategies"].values():
        parts = item["pnl_attribution"]
        total = parts["price_usd"] + parts["yield_usd"] + parts["cost_usd"]

        assert total == pytest.approx(
            item["final_value"] - item["total_invested"], abs=1e-4
        )
        assert item["pnl_share_of_capital"]["price"] == pytest.approx(
            parts["price_usd"] / item["total_invested"] * 100.0, abs=1e-4
        )


def test_exposure_and_turnover_describe_how_the_strategy_traded(report: Report) -> None:
    own = report.body["strategies"]["strategy"]
    held = report.body["strategies"]["buy_hold_btc"]

    assert 0.0 < own["avg_risk_exposure"] < 1.0
    assert own["traded_usd"] > 0
    assert own["turnover"] > 0
    assert held["avg_risk_exposure"] == pytest.approx(1.0)
    assert held["traded_usd"] == 0 and held["turnover"] == 0


def test_the_comparisons_are_the_strategys_lead(report: Report) -> None:
    own = report.body["strategies"]["strategy"]
    other = report.body["strategies"]["dca_classic"]

    lead = report.body["comparisons"]["dca_classic"]

    assert lead["roi_pp"] == pytest.approx(
        own["roi_percent"] - other["roi_percent"], abs=1e-5
    )
    assert lead["max_drawdown_pp"] == pytest.approx(
        own["max_drawdown_percent"] - other["max_drawdown_percent"], abs=1e-5
    )


def test_every_rule_gets_its_counts_and_a_leave_one_out(report: Report, spec) -> None:
    attribution = report.body["attribution"]

    assert list(attribution["rules"]) == [rule.id for rule in spec.rules]
    assert list(attribution["leave_one_out"]) == [
        f"rule:{rule.id}" for rule in spec.rules
    ]
    assert sum(item["trades"] for item in attribution["rules"].values()) > 0
    entry = attribution["leave_one_out"]["rule:cross_down_exit"]
    assert set(entry) == {"roi_pp", "max_drawdown_pp", "sharpe", "trades"}


def test_the_invariants_say_where_the_strategy_breaks_them(report: Report) -> None:
    invariants = {item["name"]: item for item in report.body["invariants"]}

    assert list(invariants) == [
        "held_below_dma_days",
        "buys_below_dma",
        "proceeds_into_downtrend",
        "cooldown_blocked_exits",
        "stuck_in_stable",
        "weights_valid",
    ]
    assert invariants["weights_valid"]["count"] == 0
    assert invariants["held_below_dma_days"]["count"] > 0
    assert invariants["held_below_dma_days"]["examples"]


def test_the_trace_lists_the_days_money_moved(report: Report) -> None:
    trace = report.body["trace"]

    assert (
        0
        < trace["executed_days"]
        <= report.body["strategies"]["strategy"]["trade_count"]
    )
    assert trace["shown"] == len(trace["lines"])
    assert all(json.loads(line)["executed"] is True for line in trace["lines"])


def test_the_trace_is_capped(monkeypatch: pytest.MonkeyPatch, spec, bundle) -> None:
    monkeypatch.setattr(evaluate_module, "TRACE_MAX_LINES", 2)

    trace = evaluate(spec, bundle, EvalConfig(leave_one_out=False), git=GIT).body[
        "trace"
    ]

    assert trace["shown"] == 2 == len(trace["lines"])
    assert trace["executed_days"] > 2


def test_synthetic_data_is_never_called_evidence(report: Report) -> None:
    assert SYNTHETIC_WARNING in report.body["warnings"]


def test_a_short_window_is_called_descriptive(report: Report) -> None:
    assert any("descriptive" in warning for warning in report.body["warnings"])


def test_the_same_inputs_give_the_same_hash(report: Report, spec, bundle) -> None:
    again = evaluate(spec, bundle, git=GIT)

    assert again.report_hash == report.report_hash
    assert again.as_dict() == report.as_dict()


def test_the_revision_is_part_of_the_hash(report: Report, spec, bundle) -> None:
    elsewhere = evaluate(spec, bundle, git={"sha": "def", "dirty": False})

    assert elsewhere.report_hash != report.report_hash
    assert elsewhere.body["strategies"] == report.body["strategies"]


def test_changed_assumptions_change_the_numbers_and_the_hash(
    report: Report, spec, bundle
) -> None:
    config = EvalConfig(assumptions=BacktestAssumptions(fill_lag_days=0))

    other = evaluate(spec, bundle, config, git=GIT)

    assert other.report_hash != report.report_hash
    assert (
        other.body["fingerprint"]["eval_config_hash"]
        != (report.body["fingerprint"]["eval_config_hash"])
    )
    assert other.body["assumptions"]["fill_lag_days"] == 0
    assert (
        other.body["strategies"]["strategy"]["final_value"]
        != report.body["strategies"]["strategy"]["final_value"]
    )


def test_a_smaller_starting_capital_scales_the_run(spec, bundle) -> None:
    small = evaluate(
        spec, bundle, EvalConfig(total_capital=1_000.0, leave_one_out=False), git=GIT
    )

    assert small.body["strategies"]["strategy"]["total_invested"] == 1_000.0


def test_leave_one_out_can_be_skipped(spec, bundle) -> None:
    quick = evaluate(spec, bundle, EvalConfig(leave_one_out=False), git=GIT)

    assert quick.body["attribution"]["leave_one_out"] == {}
    assert len(quick.body["attribution"]["rules"]) == len(spec.rules)


def test_benchmarks_can_be_chosen(spec, bundle) -> None:
    chosen = evaluate(
        spec,
        bundle,
        EvalConfig(leave_one_out=False, benchmarks=("buy_hold_btc",)),
        git=GIT,
    )

    assert list(chosen.body["strategies"]) == ["strategy", "buy_hold_btc"]
    assert list(chosen.body["comparisons"]) == ["buy_hold_btc"]


def test_a_unknown_benchmark_is_refused(spec, bundle) -> None:
    with pytest.raises(ValueError, match="Unknown benchmark"):
        evaluate(spec, bundle, EvalConfig(benchmarks=("moon",)), git=GIT)


def test_a_window_inside_the_bundle(spec, bundle) -> None:
    start = bundle.manifest.start + timedelta(days=50)
    end = bundle.manifest.end - timedelta(days=50)

    inner = evaluate(
        spec, bundle, EvalConfig(start=start, end=end, leave_one_out=False), git=GIT
    )

    assert inner.body["window"]["start"] == start.isoformat()
    assert inner.body["window"]["end"] == end.isoformat()
    assert inner.body["window"]["days"] == (end - start).days + 1


def test_a_window_before_the_bundle_warns_about_warmup(spec, bundle) -> None:
    start = bundle.manifest.start - timedelta(days=5)

    early = evaluate(
        spec, bundle, EvalConfig(start=start, leave_one_out=False), git=GIT
    )

    assert any(
        "warmup may be incomplete" in warning for warning in early.body["warnings"]
    )


def test_a_window_after_the_data_has_nothing_to_evaluate(spec, bundle) -> None:
    start = bundle.manifest.end + timedelta(days=10)

    empty = evaluate(
        spec, bundle, EvalConfig(start=start, leave_one_out=False), git=GIT
    )

    assert empty.body["window"]["days"] == 0
    assert "The window has no days to evaluate." in empty.body["warnings"]
    assert empty.body["strategies"]["strategy"]["avg_risk_exposure"] == 0.0


def test_real_data_long_enough_for_folds_draws_no_warning(spec) -> None:
    long = synthetic_bundle("synthetic:regimes?seed=2&days=420")
    recorded = Bundle(
        manifest=replace(long.manifest, source="production-read-only"),
        prices=long.prices,
        sentiments=long.sentiments,
    )

    report = evaluate(spec, recorded, EvalConfig(leave_one_out=False), git=GIT)

    assert report.body["warnings"] == []


def test_the_report_fills_in_the_revision_itself(
    monkeypatch: pytest.MonkeyPatch, spec, bundle
) -> None:
    monkeypatch.setattr(
        evaluate_module, "git_state", lambda: {"sha": "from-git", "dirty": True}
    )

    report = evaluate(spec, bundle, EvalConfig(leave_one_out=False))

    assert report.body["fingerprint"]["git"] == {"sha": "from-git", "dirty": True}


def test_every_piece_that_can_be_left_out_has_a_variant() -> None:
    raw = reference_raw()
    raw["overlays"] = [
        {"kind": "spy_latch", "id": "spy_latch", "follow_through_days": 14}
    ]
    raw["guards"] = [
        {
            "kind": "trade_quota",
            "min_trade_interval_days": 2,
            "max_trades_7d": None,
            "max_trades_30d": None,
        }
    ]
    spec = parse_spec(raw)

    variants = components(spec)

    assert list(variants) == [
        *(f"rule:{rule.id}" for rule in spec.rules),
        "overlay:spy_latch",
        "guard:trade_quota",
    ]
    assert len(variants["rule:cross_down_exit"].rules) == len(spec.rules) - 1
    assert variants["overlay:spy_latch"].overlays == ()
    assert variants["guard:trade_quota"].guards == ()
    assert variants["overlay:spy_latch"].rules == spec.rules


def test_the_only_rule_is_not_left_out(spec) -> None:
    raw = reference_raw()
    raw["rules"] = raw["rules"][:1]

    assert components(parse_spec(raw)) == {}


def test_leaving_out_an_overlay_and_a_guard_runs(bundle: Bundle) -> None:
    raw = reference_raw()
    raw["overlays"] = [
        {"kind": "spy_latch", "id": "spy_latch", "follow_through_days": 14}
    ]
    raw["guards"] = [
        {
            "kind": "trade_quota",
            "min_trade_interval_days": 2,
            "max_trades_7d": None,
            "max_trades_30d": None,
        }
    ]

    report = evaluate(parse_spec(raw), bundle, git=GIT)

    contributions = report.body["attribution"]["leave_one_out"]
    assert "overlay:spy_latch" in contributions
    assert "guard:trade_quota" in contributions


def test_the_config_is_plain_data() -> None:
    config = EvalConfig(benchmarks=("buy_hold_btc",), leave_one_out=False)

    dumped: dict[str, Any] = config.as_dict()

    assert dumped["benchmarks"] == ["buy_hold_btc"]
    assert dumped["leave_one_out"] is False
    assert dumped["start"] is None
    assert dumped["assumptions"]["slippage_rate"] == 0.003
