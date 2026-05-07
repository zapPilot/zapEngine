from __future__ import annotations

from datetime import date
from typing import Any

from pytest import MonkeyPatch

from scripts.attribution import sweep_hierarchical
from scripts.attribution.sweep_hierarchical import (
    _progress_line,
    render_markdown,
    run_sweep,
)
from src.services.backtesting.constants import (
    STRATEGY_DMA_FGI_HIERARCHICAL_CONTROL,
)


def test_sweep_script_renders_table() -> None:
    rendered = render_markdown(
        {
            "2024": {
                STRATEGY_DMA_FGI_HIERARCHICAL_CONTROL: {
                    "calmar_ratio": 1.00,
                    "sharpe_ratio": 0.70,
                    "max_drawdown_percent": -20.0,
                    "roi_percent": 12.0,
                    "trade_count": 10,
                    "win_rate_percent": 45.0,
                },
            },
            "2025": {
                STRATEGY_DMA_FGI_HIERARCHICAL_CONTROL: {
                    "calmar_ratio": 1.24,
                    "sharpe_ratio": 0.81,
                    "max_drawdown_percent": -22.1,
                    "roi_percent": 18.0,
                    "trade_count": 12,
                    "win_rate_percent": 48.0,
                },
            },
        },
        generated_on=date(2026, 4, 30),
    )

    assert "# Hierarchical Attribution Sweep - 2026-04-30" in rendered
    assert (
        "| Variant | Calmar | Sharpe | Max DD | ROI | Trades | Win Rate | Delta Calmar | Validated |"
        in rendered
    )
    assert "Hierarchical Attribution Control" in rendered
    assert "1.24" in rendered
    assert "48.00%" in rendered
    assert "baseline" in rendered


def test_progress_line_renders_completion_state() -> None:
    rendered = _progress_line(
        completed=26,
        total=52,
        window="2025",
        strategy_id=STRATEGY_DMA_FGI_HIERARCHICAL_CONTROL,
    )

    assert "26/52" in rendered
    assert "50.0%" in rendered
    assert "window=2025" in rendered
    assert f"variant={STRATEGY_DMA_FGI_HIERARCHICAL_CONTROL}" in rendered


def test_render_markdown_with_control_baseline() -> None:
    rendered = render_markdown(
        {
            "2025": {
                STRATEGY_DMA_FGI_HIERARCHICAL_CONTROL: {
                    "calmar_ratio": 1.00,
                },
            },
        },
        generated_on=date(2026, 5, 1),
        baseline_id=STRATEGY_DMA_FGI_HIERARCHICAL_CONTROL,
        variants_subset=[STRATEGY_DMA_FGI_HIERARCHICAL_CONTROL],
    )

    assert (
        "Hierarchical Attribution Control | 1.00 | n/a | n/a | n/a | n/a | n/a | baseline | baseline"
        in rendered
    )


def test_run_sweep_with_variants_subset(monkeypatch: MonkeyPatch) -> None:
    requested_strategy_ids: list[str] = []

    def fake_fetch_summary(**kwargs: Any) -> dict[str, Any]:
        strategy_id = str(kwargs["strategy_id"])
        requested_strategy_ids.append(strategy_id)
        return {"calmar_ratio": float(len(requested_strategy_ids))}

    monkeypatch.setattr(
        sweep_hierarchical,
        "_fetch_summary",
        fake_fetch_summary,
    )
    variants_subset = [
        STRATEGY_DMA_FGI_HIERARCHICAL_CONTROL,
    ]

    results = run_sweep(
        endpoint="http://testserver",
        windows=["2025"],
        total_capital=10_000.0,
        variants_subset=variants_subset,
        show_progress=False,
    )
    rendered = render_markdown(
        results,
        generated_on=date(2026, 5, 1),
        baseline_id=STRATEGY_DMA_FGI_HIERARCHICAL_CONTROL,
        variants_subset=variants_subset,
    )

    assert requested_strategy_ids == variants_subset
    assert list(results["2025"]) == variants_subset
    assert "Hierarchical Attribution Control" in rendered
