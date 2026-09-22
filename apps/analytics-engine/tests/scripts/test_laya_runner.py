from __future__ import annotations

from datetime import date, timedelta
from pathlib import Path

import pytest

from scripts.research.laya.fakes import FakeLayaClient
from scripts.research.laya.runner import (
    build_request,
    compute_turnover,
    main,
    reference_window,
    render_markdown,
    resolved_baseline,
)
from scripts.research.laya.strategy import LayaExperimentSpec, resolved_laya_config
from src.services.backtesting.execution.compare import run_compare_v3_on_data
from src.services.backtesting.features import (
    DMA_200_FEATURE,
    ETH_BTC_RATIO_DMA_200_FEATURE,
    ETH_BTC_RATIO_FEATURE,
    ETH_DMA_200_FEATURE,
    MACRO_FEAR_GREED_FEATURE,
    SPY_DMA_200_FEATURE,
)
from src.services.backtesting.strategy_registry import StrategyBuildRequest


def _synthetic_data(days: int = 60):
    start = date(2025, 1, 1)
    prices: list[dict[str, object]] = []
    sentiments: dict[date, dict[str, object]] = {}
    for offset in range(days):
        snapshot_date = start + timedelta(days=offset)
        btc = 100_000.0 * (1.0 + 0.001 * offset)
        eth = 3_000.0 * (1.0 + 0.0008 * offset)
        spy = 500.0 * (1.0 + 0.0004 * offset)
        prices.append(
            {
                "date": snapshot_date,
                "price": btc,
                "prices": {"btc": btc, "eth": eth, "spy": spy},
                "extra_data": {
                    DMA_200_FEATURE: 95_000.0,
                    ETH_DMA_200_FEATURE: 2_850.0,
                    SPY_DMA_200_FEATURE: 480.0,
                    ETH_BTC_RATIO_FEATURE: eth / btc,
                    ETH_BTC_RATIO_DMA_200_FEATURE: 0.03,
                    MACRO_FEAR_GREED_FEATURE: {
                        "score": 55.0,
                        "label": "neutral",
                        "source": "test",
                        "updated_at": snapshot_date.isoformat(),
                    },
                },
            }
        )
        sentiments[snapshot_date] = {
            "label": "neutral",
            "value": 50 + (offset % 5),
        }
    return start, prices, sentiments


def test_resolved_laya_config_copies_baseline_market_contract_and_requires_initial_allocation() -> (
    None
):
    fake = FakeLayaClient()
    resolved = resolved_laya_config(
        LayaExperimentSpec(encoding="per_bucket_score"),
        fake,
    )
    baseline = resolved_baseline("dma_fgi_portfolio_rules")
    assert resolved.primary_asset == baseline.primary_asset
    assert resolved.market_data_requirements == baseline.market_data_requirements
    assert resolved.portfolio_bucket_mapper == baseline.portfolio_bucket_mapper
    assert resolved.runtime_portfolio_mode == baseline.runtime_portfolio_mode
    with pytest.raises(ValueError, match="initial allocation"):
        resolved.build_strategy(
            StrategyBuildRequest(
                mode="compare",
                total_capital=10_000.0,
                config_id=resolved.request_config_id,
            )
        )


def test_synthetic_compare_runs_two_baselines_and_three_laya_variants() -> None:
    start, prices, sentiments = _synthetic_data()
    fake = FakeLayaClient()
    configs = [
        resolved_baseline("dma_fgi_portfolio_rules"),
        resolved_baseline("dca_classic"),
        resolved_laya_config(LayaExperimentSpec("per_bucket_score"), fake),
        resolved_laya_config(LayaExperimentSpec("posture_mixture"), fake),
        resolved_laya_config(LayaExperimentSpec("static_equal_weight"), fake),
    ]
    window = reference_window(start + timedelta(days=59), 60)
    request = build_request(window=window, total_capital=10_000.0, configs=configs)
    result = run_compare_v3_on_data(
        prices=prices,
        sentiments=sentiments,
        request=request,
        user_start_date=start,
        resolved_configs=configs,
    )
    assert set(result.strategies) == {config.request_config_id for config in configs}
    assert result.strategies["laya_static_equal_weight_c1"].trade_count == 1
    assert result.strategies["laya_per_bucket_score_c1"].trade_count >= 1
    assert compute_turnover(result, "laya_per_bucket_score_c1")["gross_usd"] > 0
    report = {
        "reference_date": "2025-03-01",
        "baseline_matches_snapshot": {
            "dma_fgi_portfolio_rules": True,
            "dca_classic": True,
        },
        "results": {
            config_id: {
                "roi_percent": summary.roi_percent,
                "sharpe_ratio": summary.sharpe_ratio,
                "sortino_ratio": summary.sortino_ratio,
                "calmar_ratio": summary.calmar_ratio,
                "max_drawdown_percent": summary.max_drawdown_percent,
                "trade_count": summary.trade_count,
                "turnover": compute_turnover(result, config_id),
                "parameters": summary.parameters,
            }
            for config_id, summary in result.strategies.items()
        },
    }
    markdown = render_markdown(report)
    for config in configs:
        assert config.request_config_id in markdown


def test_main_without_read_only_dsn_skips_without_writing(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.delenv("DATABASE_READ_ONLY_URL", raising=False)
    assert main(["--report-dir", str(tmp_path), "--fake-client"]) == 0
    assert list(tmp_path.iterdir()) == []
    assert "SKIP:" in capsys.readouterr().err
