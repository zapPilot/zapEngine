from __future__ import annotations

from datetime import date

from scripts.attribution.sweep_hierarchical import render_markdown
from src.services.backtesting.constants import (
    STRATEGY_DMA_FGI_HIERARCHICAL_CONTROL,
    STRATEGY_DMA_FGI_HIERARCHICAL_FULL,
)


def test_sweep_script_renders_table() -> None:
    rendered = render_markdown(
        {
            "2025": {
                STRATEGY_DMA_FGI_HIERARCHICAL_CONTROL: {
                    "calmar_ratio": 1.24,
                    "max_drawdown_percent": -22.1,
                    "roi_percent": 18.0,
                    "trade_count": 12,
                },
                STRATEGY_DMA_FGI_HIERARCHICAL_FULL: {
                    "calmar_ratio": 4.87,
                    "max_drawdown_percent": -8.3,
                    "roi_percent": 88.0,
                    "trade_count": 9,
                },
            }
        },
        generated_on=date(2026, 4, 30),
    )

    assert "# Hierarchical Attribution Sweep - 2026-04-30" in rendered
    assert (
        "| Variant | Calmar | Max DD | ROI | Trades | Delta Calmar | Validated |"
        in rendered
    )
    assert "Hierarchical Attribution Control" in rendered
    assert "Hierarchical Attribution Full" in rendered
    assert "+3.63" in rendered
