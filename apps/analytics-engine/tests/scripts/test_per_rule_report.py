from __future__ import annotations

import json

from scripts.attribution.per_rule_report import (
    render_markdown_report,
    summarize_rule_matches,
)


def test_summarize_rule_matches_counts_wins_and_shadowing() -> None:
    lines = [
        json.dumps(
            {
                "strategy": "dma",
                "rule": "cross_down_exit",
                "rule_matches": [
                    {
                        "rule_name": "cross_down_exit",
                        "matched": True,
                        "would_have_acted_action": "sell",
                        "suppressed_by": None,
                    },
                    {
                        "rule_name": "dma_overextension_dca_sell",
                        "matched": True,
                        "would_have_acted_action": "sell",
                        "suppressed_by": "cross_down_exit",
                    },
                ],
            }
        ),
        json.dumps(
            {
                "strategy": "dma",
                "rule": "regime_no_signal_hold",
                "rule_matches": [
                    {
                        "rule_name": "dma_overextension_dca_sell",
                        "matched": False,
                        "would_have_acted_action": None,
                        "suppressed_by": None,
                    },
                ],
            }
        ),
    ]

    report = summarize_rule_matches(lines)

    assert report.rules["cross_down_exit"].match_count == 1
    assert report.rules["cross_down_exit"].win_count == 1
    assert report.rules["dma_overextension_dca_sell"].match_count == 1
    assert report.rules["dma_overextension_dca_sell"].shadowed_count == 1
    assert (
        report.shadowing_matrix[("cross_down_exit", "dma_overextension_dca_sell")] == 1
    )


def test_render_markdown_report_includes_shadowing_matrix() -> None:
    report = summarize_rule_matches(
        [
            json.dumps(
                {
                    "strategy": "dma",
                    "rule": "cross_down_exit",
                    "rule_matches": [
                        {
                            "rule_name": "dma_overextension_dca_sell",
                            "matched": True,
                            "would_have_acted_action": "sell",
                            "suppressed_by": "cross_down_exit",
                        }
                    ],
                }
            )
        ]
    )

    rendered = render_markdown_report(report)

    assert "| Rule | Matches | Wins | Shadowed |" in rendered
    assert "| cross_down_exit | dma_overextension_dca_sell | 1 |" in rendered
