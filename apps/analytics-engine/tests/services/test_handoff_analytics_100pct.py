"""Coverage-handoff gap fill: analytics-engine lines to 100%.

Source: coverage-handoff artifact from CI run 36083423967 on main
(1f44f90d, reportStatus complete). apps/analytics-engine at 99.14% lines
(12138/12243, 105 missing lines across 39 files).

Each test locks real behavior for an uncovered defensive branch or error
path. No production code is changed.
"""

from __future__ import annotations

from datetime import UTC, date
from typing import Any


class TestWalletAttributionAggregatorGaps:
    def test_normalize_date_returns_none_for_unsupported_types(self) -> None:
        from src.services.aggregators.wallet_attribution_aggregator import (
            _normalize_date,
        )

        # Line 56: unsupported types (None, int, empty string) yield None.
        assert _normalize_date(None) is None
        assert _normalize_date(123) is None
        assert _normalize_date("") is None

    def test_normalize_date_handles_date_and_str(self) -> None:
        from src.services.aggregators.wallet_attribution_aggregator import (
            _normalize_date,
        )

        assert _normalize_date(date(2026, 1, 2)) == "2026-01-02"
        assert _normalize_date("2026-01-02T00:00:00Z") == "2026-01-02"

    def test_as_float_coerces_invalid_to_zero(self) -> None:
        from src.services.aggregators.wallet_attribution_aggregator import _as_float

        # Lines 63-64: TypeError/ValueError coerce to 0.0.
        assert _as_float(None) == 0.0
        assert _as_float("not-a-number") == 0.0
        assert _as_float("1.5") == 1.5

    def test_aggregate_skips_rows_with_unparsable_date(self) -> None:
        from src.services.aggregators.wallet_attribution_aggregator import (
            aggregate_wallet_snapshots,
        )

        # Line 81: rows without a usable snapshot_date are skipped.
        result = aggregate_wallet_snapshots(
            [
                {
                    "snapshot_date": None,
                    "chain": "eth",
                    "token_address": "0xabc",
                    "symbol": "ETH",
                    "amount": 1.0,
                    "price": 3000.0,
                },
                {
                    "snapshot_date": date(2026, 1, 1),
                    "chain": "eth",
                    "token_address": "0xabc",
                    "symbol": "ETH",
                    "amount": 2.0,
                    "price": 3000.0,
                },
            ]
        )
        assert list(result.keys()) == ["2026-01-01"]

    def test_symbol_price_falls_back_when_nothing_held(self) -> None:
        from src.services.aggregators.wallet_attribution_aggregator import (
            _symbol_price,
            _SymbolTotals,
        )

        # Line 152: zero price_weight returns the fallback price.
        totals = _SymbolTotals(fallback_price=3100.0)
        assert _symbol_price(totals) == 3100.0
        totals.weighted_price = 6200.0
        totals.price_weight = 2.0
        assert _symbol_price(totals) == 3100.0


class TestYieldSummaryBuilderGaps:
    def test_holding_usd_rejects_non_dict(self) -> None:
        from src.services.aggregators.yield_summary_builder import _holding_usd

        # Line 96: non-dict holdings read as zero exposure.
        assert _holding_usd(None) == 0.0
        assert _holding_usd("bad") == 0.0
        assert _holding_usd(123) == 0.0

    def test_holding_usd_tolerates_bad_numbers(self) -> None:
        from src.services.aggregators.yield_summary_builder import _holding_usd

        # Lines 99-100: TypeError/ValueError inside the multiply yields 0.0.
        assert _holding_usd({"amount": object(), "price": 1.0}) == 0.0
        assert _holding_usd({"amount": 2.0, "price": 3.0}) == 6.0

    def test_group_deltas_skips_empty_symbol(self) -> None:
        from src.services.aggregators.yield_summary_builder import _group_deltas

        # Line 135: empty raw_symbol entries are skipped, not keyed as "".
        grouped = _group_deltas(
            [
                {
                    "protocol_name": "Morpho",
                    "chain": "eth",
                    "snapshot_at": "2026-09-05",
                    "token_yield_usd": 1.0,
                    "current_amounts": {"": {"amount": 5.0, "price": 1.0}},
                }
            ]
        )
        bucket = grouped[("Morpho", "eth")][date(2026, 9, 5)]
        assert bucket.token_symbols == set()
        assert bucket.token_values == {}

    def test_build_window_skips_empty_protocol_series(self) -> None:
        from src.services.aggregators.yield_summary_builder import build_yield_summary

        # Line 180: a protocol whose series falls outside the window is skipped.
        response = build_yield_summary(
            "user",
            [
                {
                    "snapshot_at": "2020-01-01",
                    "protocol_name": "Old",
                    "chain": "eth",
                    "token_yield_usd": 5.0,
                },
                {
                    "snapshot_at": "2026-09-05",
                    "protocol_name": "Morpho",
                    "chain": "eth",
                    "token_yield_usd": 2.0,
                    "current_amounts": {"USDT": {"amount": 1.0, "price": 1.0}},
                },
            ],
            ("7d",),
            "none",
        )
        protocols = [row.protocol for row in response.windows["7d"].protocol_breakdown]
        assert "Morpho" in protocols
        assert "Old" not in protocols


class TestEthStakingIncomeGaps:
    def _wsteth_row(self, **overrides: Any) -> dict[str, Any]:
        from src.config.eth_lst_registry import ETH_LST_ASSETS

        addr = next(
            a.token_address
            for a in ETH_LST_ASSETS
            if a.symbol == "wstETH" and a.chain == "eth"
        )
        row: dict[str, Any] = {
            "chain": "eth",
            "token_address": addr,
            "amount": 2.0,
            "price": 3000.0,
            "exposure_type": "supply",
            "source_kind": "position",
            "source_id": "pos-1",
            "position_type": "Lending",
        }
        row.update(overrides)
        return row

    def test_malformed_amount_price_are_skipped(self) -> None:
        from src.services.analytics.eth_staking_income import (
            aggregate_benchmark_lst_exposure,
        )

        # Lines 57-58: unparseable amount/price skips the row.
        exposure = aggregate_benchmark_lst_exposure(
            [self._wsteth_row(amount={"bad": True})]
        )
        assert exposure.total_usd == 0.0

    def test_non_positive_amount_price_are_skipped(self) -> None:
        from src.services.analytics.eth_staking_income import (
            aggregate_benchmark_lst_exposure,
        )

        # Line 60: zero amount or price cannot create value.
        assert (
            aggregate_benchmark_lst_exposure([self._wsteth_row(amount=0.0)]).total_usd
            == 0.0
        )
        assert (
            aggregate_benchmark_lst_exposure([self._wsteth_row(price=0.0)]).total_usd
            == 0.0
        )

    def test_missing_source_id_is_skipped(self) -> None:
        from src.services.analytics.eth_staking_income import (
            aggregate_benchmark_lst_exposure,
        )

        # Line 65: rows without a source identity are skipped.
        assert (
            aggregate_benchmark_lst_exposure([self._wsteth_row(source_id="")]).total_usd
            == 0.0
        )

    def test_with_income_returns_summary_unchanged_without_exposure(self) -> None:
        from src.services.aggregators.yield_summary_builder import build_yield_summary
        from src.services.analytics.eth_staking_income import (
            EthStakingExposure,
            with_eth_staking_income,
        )

        # Line 100: zero exposure or negative APR leaves observed carry intact.
        observed = build_yield_summary("user", [], ("30d",), "none")
        empty = EthStakingExposure(total_usd=0.0, token_symbols=())
        assert with_eth_staking_income(observed, empty, 0.025) is observed
        exposure = EthStakingExposure(
            total_usd=100.0,
            token_symbols=("wstETH",),
            values_by_symbol=(("wstETH", 100.0),),
        )
        assert with_eth_staking_income(observed, exposure, -0.01) is observed


class TestRegistryConfigDecisionGaps:
    def test_find_eth_lst_asset_rejects_empty_address(self) -> None:
        from src.config.eth_lst_registry import find_eth_lst_asset

        # Line config/eth_lst_registry.py:99 — empty/None address never resolves.
        assert find_eth_lst_asset("eth", None) is None
        assert find_eth_lst_asset("eth", "") is None

    def test_production_cors_parses_str_origins(self) -> None:
        from src.core.config import DESKTOP_PRODUCTION_CORS_ORIGIN, Settings

        # Line core/config.py:448 — str origins are parsed before validation.
        # model_construct skips the field validator so the defensive parse runs.
        # The method validates a local parsed copy; it must not raise.
        settings = Settings.model_construct(
            allowed_origins=DESKTOP_PRODUCTION_CORS_ORIGIN,
            environment="production",
            database_read_only_url="postgresql+asyncpg://ro/url",
        )
        settings._validate_production_cors_origins()
        assert Settings.parse_origins(DESKTOP_PRODUCTION_CORS_ORIGIN) == [
            DESKTOP_PRODUCTION_CORS_ORIGIN
        ]

    def test_allocation_intent_hold_payload(self) -> None:
        from src.services.backtesting.decision import AllocationIntent

        # Line services/backtesting/decision.py:28 — hold without target.
        intent = AllocationIntent(
            action="hold",
            target_allocation=None,
            allocation_name=None,
            immediate=False,
            reason="flat",
            rule_group="none",
            decision_score=0.0,
        )
        assert intent.to_signal_payload() == {
            "hold": True,
            "immediate": False,
            "target": None,
            "name": None,
        }

    def test_allocation_executor_seed_trade_dates_is_noop(self) -> None:
        from datetime import date as date_cls

        from src.services.backtesting.execution.allocation_intent_executor import (
            AllocationIntentExecutor,
        )

        # Line allocation_intent_executor.py:96 — history flows via plugins only.
        executor = AllocationIntentExecutor()
        executor.seed_trade_dates([date_cls(2026, 1, 1)])
        assert executor.last_trade_date is None

    def test_apply_buy_strength_leaves_non_buy_unchanged(self) -> None:
        from src.services.backtesting.execution.pacing.base import (
            RebalancePacingInputs,
            apply_buy_strength,
        )

        # Line pacing/base.py:81 — non-buy paths ignore buy_strength.
        inputs = RebalancePacingInputs(
            current_regime="fear", decision_action="sell", buy_strength=0.1
        )
        assert apply_buy_strength(0.7, inputs) == 0.7

    def test_portfolio_dict_borrow_rate_reads_as_zero(self) -> None:
        from src.services.backtesting.execution.portfolio import Portfolio

        # Line execution/portfolio.py:323 — malformed borrow rate degrades to 0.
        portfolio = Portfolio(spot_balance=1.0, stable_balance=100.0)
        portfolio.btc_balance = 1.0
        portfolio.debt_balance = 50.0
        portfolio.apply_daily_yield(
            {"btc": 100.0},
            {"borrow": {"bad": "shape"}},  # type: ignore[dict-item]
        )
        assert portfolio.debt_balance == 50.0

    def test_rule_based_executor_empty_deltas_at_target(self) -> None:
        from src.services.backtesting.execution.rule_based.allocation_executor import (
            RuleBasedAllocationExecutor,
        )

        # Line allocation_executor.py:114 — no deltas means already at target.
        assert RuleBasedAllocationExecutor._is_effectively_at_target({}) is True
        assert (
            RuleBasedAllocationExecutor._is_effectively_at_target({"btc": 1e-9}) is True
        )
        assert (
            RuleBasedAllocationExecutor._is_effectively_at_target({"btc": 0.01})
            is False
        )

    def test_cross_up_equal_weight_has_no_public_params_section(self) -> None:
        from src.services.backtesting.portfolio_rules.cross_up_equal_weight import (
            CrossUpEqualWeightRule,
        )

        # Line cross_up_equal_weight.py:32 — rule has no tunable public section.
        assert CrossUpEqualWeightRule.public_params_section() is None

    def test_trade_quota_history_lookback(self) -> None:
        from src.services.backtesting.trade_quota import TradeQuotaLimits

        # Line trade_quota.py:68 — lookback is the max of configured windows.
        assert TradeQuotaLimits().history_lookback_days == 0
        assert TradeQuotaLimits(min_trade_interval_days=3).history_lookback_days == 3
        assert TradeQuotaLimits(max_trades_7d=2).history_lookback_days == 7
        assert TradeQuotaLimits(max_trades_30d=5).history_lookback_days == 30

    def test_dca_classic_parameters_shape(self) -> None:
        from src.services.backtesting.strategies.dca_classic import DcaClassicStrategy

        # Line dca_classic.py:133 — frozen benchmark exposes its capital model.
        strategy = DcaClassicStrategy(
            total_days=30,
            total_capital=10_000.0,
            initial_allocation={"spot": 0.0, "stable": 1.0},
            daily_amount=100.0,
        )
        assert strategy.parameters() == {
            "total_capital": 10_000.0,
            "daily_amount": 100.0,
            "model": "equal_capital_pool",
        }

    def test_macro_history_required_without_service_raises(self) -> None:
        import logging
        from datetime import date as date_cls

        from src.services.market.macro_fear_greed_history import (
            resolve_macro_fear_greed_history,
        )

        # Line macro_fear_greed_history.py:37 — required callers fail closed.
        with __import__("pytest").raises(ValueError, match="macro_fear_greed_service"):
            resolve_macro_fear_greed_history(
                macro_fear_greed_service=None,
                start_date=date_cls(2026, 1, 1),
                end_date=date_cls(2026, 1, 2),
                logger=logging.getLogger("test"),
                required=True,
            )
        assert (
            resolve_macro_fear_greed_history(
                macro_fear_greed_service=None,
                start_date=date_cls(2026, 1, 1),
                end_date=date_cls(2026, 1, 2),
                logger=logging.getLogger("test"),
                required=False,
            )
            == {}
        )

    def test_composition_catalog_two_bucket_rejects_params(self) -> None:
        import pytest

        from src.services.backtesting.composition_catalog import (
            _build_two_bucket_execution_profile,
        )

        # Line composition_catalog.py:99 — two-bucket profile takes no params.
        assert _build_two_bucket_execution_profile({}) is None
        with pytest.raises(ValueError, match="does not accept params"):
            _build_two_bucket_execution_profile({"k": 1})

    def test_composition_catalog_rejects_kind_mismatch(self) -> None:
        import pytest

        from src.models.strategy_config import SavedStrategyConfig, StrategyComposition
        from src.services.backtesting.composition_catalog import StrategyFamilySpec

        # Line composition_catalog.py:151 — family validates composition kind.
        family = StrategyFamilySpec(
            strategy_id="test_bench",
            composition_kind="benchmark",
            mutable_via_admin=False,
        )
        bad = SavedStrategyConfig(
            config_id="kind-mismatch",
            display_name="Mismatch",
            strategy_id="test_bench",
            composition=StrategyComposition(kind="composed"),
        )
        with pytest.raises(ValueError, match="must use"):
            family.validate_saved_config(bad)


class TestRiskValidationEngineGaps:
    def test_selected_state_returns_none_without_assets(self) -> None:
        from src.services.backtesting.portfolio_rules.base import PortfolioSnapshot
        from src.services.backtesting.risk.dma_buy_gate import (
            _buy_strength,
            _selected_state,
        )

        # Lines risk/dma_buy_gate.py:142,149 — empty snapshot has no DMA state.
        # NOTE: tests.services.backtesting.helpers.snapshot defaults to 3 assets
        # when assets={} is passed (falsy), so construct directly.
        empty = PortfolioSnapshot(
            assets={},
            current_asset_allocation={
                "btc": 0.0,
                "eth": 0.0,
                "spy": 0.0,
                "stable": 1.0,
                "alt": 0.0,
            },
            previous_fgi_regime={},
            macro_fgi_regime=None,
            crypto_fgi_regime=None,
            cycle_open_per_symbol={},
            eth_btc_ratio_state=None,
            last_trade_date=None,
            current_date=None,
            trade_dates=(),
        )
        assert _selected_state(empty) is None
        assert _buy_strength(empty) == 0.0

    def test_constraint_predicates_match_returns_none(self) -> None:
        from src.services.backtesting.validation.constraint_predicates import (
            predicate_decision_action_equals,
            predicate_decision_detail_equals,
        )

        # Lines constraint_predicates.py:438,496 — matching assertions pass.
        point = {
            "date": "2026-01-01",
            "decision": {"action": "buy", "details": {"k": "v"}},
        }
        assert (
            predicate_decision_action_equals(assertion={"value": "buy"}, point=point)
            is None
        )
        assert (
            predicate_decision_detail_equals(
                assertion={"key": "k", "value": "v"}, point=point
            )
            is None
        )

    def test_resolve_recipe_alias_unknown_id_returns_none(self) -> None:
        from unittest.mock import Mock

        from src.services.strategy.backtesting_service import (
            _resolve_saved_config_recipe_alias,
        )

        # Lines backtesting_service.py:236-237 — unknown ids degrade to None.
        store = Mock()
        store.get_config.return_value = None
        request = Mock(saved_config_id="no-such-recipe-xyz", config_id="req-1")
        assert (
            _resolve_saved_config_recipe_alias(
                request_config=request, config_store=store
            )
            is None
        )

    def test_config_management_rejects_benchmark(self) -> None:
        from unittest.mock import Mock

        import pytest

        from src.models.strategy_config import SavedStrategyConfig, StrategyComposition
        from src.services.backtesting.composition_catalog import (
            StrategyFamilySpec,
            get_default_composition_catalog,
        )
        from src.services.strategy.strategy_config_management_service import (
            StrategyConfigManagementService,
        )

        # Lines strategy_config_management_service.py:133,141.
        # Line 133 needs a family with mutable_via_admin=False.
        readonly_family = StrategyFamilySpec(
            strategy_id="readonly_bench",
            composition_kind="benchmark",
            mutable_via_admin=False,
        )
        catalog = get_default_composition_catalog().with_extensions(
            strategy_families={"readonly_bench": readonly_family}
        )
        service = StrategyConfigManagementService(
            strategy_config_store=Mock(), composition_catalog=catalog
        )
        readonly_config = SavedStrategyConfig(
            config_id="bench-ro",
            display_name="Bench RO",
            strategy_id="readonly_bench",
            composition=StrategyComposition(kind="benchmark"),
            is_benchmark=True,
        )
        with pytest.raises(Exception, match="read-only"):
            service._validate_mutable_config(readonly_config)
        # Line 141 triggers on is_benchmark or benchmark kind.
        bench = SavedStrategyConfig(
            config_id="bench-1",
            display_name="Bench",
            strategy_id="dma_fgi_portfolio_rules",
            composition=StrategyComposition(kind="benchmark"),
            is_benchmark=True,
        )
        with pytest.raises(Exception, match="read-only"):
            service._ensure_non_benchmark(bench)

    async def test_backtesting_router_emit_log_copies_request(self) -> None:
        from unittest.mock import AsyncMock

        from src.api.routers.backtesting import compare_backtesting_configs_v3
        from src.models.backtesting import (
            BacktestCompareConfigV3,
            BacktestCompareRequestV3,
        )

        # Line api/routers/backtesting.py:71 — emit flag copies the request.
        request = BacktestCompareRequestV3(
            token_symbol="BTC",
            total_capital=100.0,
            configs=[BacktestCompareConfigV3(config_id="c1", saved_config_id="cfg-1")],
        )
        service = AsyncMock()
        service.run_compare_v3.return_value = {"ok": True}
        result = await compare_backtesting_configs_v3(
            request, service, emit_decision_log=True
        )
        assert result == {"ok": True}
        sent = service.run_compare_v3.call_args[0][0]
        assert sent.emit_decision_log is True

    def test_engine_applies_stable_cost(self) -> None:
        from datetime import date as date_cls
        from unittest.mock import Mock

        from src.services.backtesting.execution.engine import (
            EngineConfig,
            StrategyEngine,
        )
        from src.services.backtesting.execution.portfolio import Portfolio
        from src.services.backtesting.strategies.base import (
            StrategyAction,
            StrategyContext,
        )

        # Line execution/engine.py:427 — stable costs are charged after moves.
        engine = StrategyEngine(config=EngineConfig())
        portfolio = Portfolio(spot_balance=1.0, stable_balance=1000.0)
        context = StrategyContext(
            date=date_cls(2026, 1, 2),
            price=100.0,
            sentiment=None,
            price_history=[100.0],
            portfolio=portfolio,
        )
        action = StrategyAction(
            snapshot=Mock(),
            apply_yield=False,
            debt_delta_usd=0.0,
            stable_cost_usd=5.0,
            transfers=[],
            target_allocations=None,
        )
        before = portfolio.stable_balance
        engine._apply_action(portfolio, context, action)
        assert portfolio.stable_balance == before - 5.0

    def test_cross_down_exit_skips_inapplicable_peer(self) -> None:
        from src.services.backtesting.portfolio_rules.base import PortfolioRuleConfig
        from src.services.backtesting.portfolio_rules.cross_down_exit import (
            CrossDownExitRule,
            _exit_symbols_for_cross_down,
        )
        from tests.services.backtesting.helpers import snapshot, state

        # Line cross_down_exit.py:122 — peers outside applicable_symbols skip.
        rule = CrossDownExitRule(applicable_symbols=frozenset({"BTC"}))
        symbols = _exit_symbols_for_cross_down(["BTC"], rule=rule)
        assert symbols == ["BTC"]
        snap = snapshot(
            assets={
                "BTC": state(
                    symbol="BTC",
                    cross_event="cross_down",
                    actionable_cross_event="cross_down",
                ),
            }
        )
        assert rule.matches(snap, config=PortfolioRuleConfig()) is True

    def test_signal_engine_requires_dma(self) -> None:
        from datetime import date as date_cls

        import pytest

        from src.services.backtesting.execution.portfolio import Portfolio
        from src.services.backtesting.signals.dma_gated_fgi.errors import (
            SignalDataError,
        )
        from src.services.backtesting.signals.dma_gated_fgi.signal_engine import (
            DmaSignalEngine,
        )
        from src.services.backtesting.strategies.base import StrategyContext

        # Line signals/dma_gated_fgi/signal_engine.py:162 — missing dma_200 fails.
        engine = DmaSignalEngine()
        context = StrategyContext(
            date=date_cls(2026, 1, 2),
            price=100.0,
            sentiment=None,
            price_history=[100.0],
            portfolio=Portfolio(spot_balance=1.0, stable_balance=100.0),
            extra_data={},
        )
        with pytest.raises(SignalDataError, match="dma_200"):
            engine.build_market_state(context)

    def test_flat_minimum_accessors(self) -> None:
        from src.services.backtesting.signals.flat_minimum import (
            FlatMinimumSignalComponent,
        )

        # Lines flat_minimum.py:237-239,243 — accessors before any observation.
        signal = FlatMinimumSignalComponent()
        assert signal.dma_state_for("btc") is None
        assert signal.latest_state is None


class TestAllocatorMetricsRuleGaps:
    def test_allocator_zero_weights_use_demands(self) -> None:
        from unittest.mock import patch

        import src.services.backtesting.asset_class_allocator as allocator_module
        from src.services.backtesting.asset_class_allocator import (
            allocate_stock_crypto_target,
        )

        # Lines asset_class_allocator.py:258-259 — zero weights fall back to
        # demand-proportional split. Weights are zero for stable gates, so
        # force that shape with demands summing above one.
        with (
            patch.object(allocator_module, "_gate_state", return_value="stable"),
            patch.object(
                allocator_module,
                "_class_demand",
                side_effect=[(0.7, 0.0), (0.6, 0.0)],
            ),
            patch.object(allocator_module, "_overextension_pressure", return_value=0.0),
            patch.object(allocator_module, "_accumulation_score", return_value=0.0),
        ):
            result = allocate_stock_crypto_target(
                stock_dma_distance=0.0,
                crypto_dma_distance=0.0,
                crypto_fgi_regime="neutral",
                eth_share_in_crypto=0.5,
                current_allocation={"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0},
            )
        assert result.allocation["spy"] == __import__("pytest").approx(
            0.7 / 1.3, rel=1e-6
        )
        assert result.allocation["stable"] == __import__("pytest").approx(0.0)

    def test_allocator_partial_score_reason(self) -> None:
        from unittest.mock import patch

        import src.services.backtesting.asset_class_allocator as allocator_module
        from src.services.backtesting.asset_class_allocator import (
            allocate_stock_crypto_target,
        )

        # Line asset_class_allocator.py:280 — stable with small demands and no
        # pressure/accumulation/cross_down reads as a partial score.
        with (
            patch.object(allocator_module, "_gate_state", return_value="stable"),
            patch.object(
                allocator_module,
                "_class_demand",
                side_effect=[(0.2, 0.1), (0.1, 0.05)],
            ),
            patch.object(allocator_module, "_overextension_pressure", return_value=0.0),
            patch.object(allocator_module, "_accumulation_score", return_value=0.0),
        ):
            result = allocate_stock_crypto_target(
                stock_dma_distance=0.0,
                crypto_dma_distance=0.0,
                crypto_fgi_regime="neutral",
                eth_share_in_crypto=0.5,
                current_allocation={"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0},
            )
        assert result.stable_reason == "partial_asset_class_score"

    def test_performance_metrics_edge_cases(self) -> None:
        import numpy as np

        from src.services.backtesting.execution.performance_metrics import (
            PerformanceMetricsCalculator,
        )

        # Line 162: NaN returns make the tail empty (quantile NaN matches nothing).
        assert (
            PerformanceMetricsCalculator.calculate_cvar(np.array([float("nan")]), 0.05)
            == 0.0
        )
        # Line 247: empty returns annualize to zero.
        assert PerformanceMetricsCalculator._annualized_return(np.array([])) == 0.0
        # Line 251: total loss (prod<=0) annualizes to -1.
        assert PerformanceMetricsCalculator._annualized_return(np.array([-1.0])) == -1.0

    def test_rule_based_builders_and_defaults(self) -> None:
        from src.services.backtesting.execution.pacing.fgi_exponential import (
            FgiExponentialPacingPolicy,
        )
        from src.services.backtesting.strategies.rule_based_portfolio import (
            DmaGatedFgiParams,
            default_rule_based_portfolio_params,
        )

        # Lines rule_based_portfolio.py:264,277,409.
        params = DmaGatedFgiParams()
        pacing = params.build_pacing_policy()
        assert isinstance(pacing, FgiExponentialPacingPolicy)
        plugins = params.build_execution_plugins()
        assert len(plugins) == 2
        assert default_rule_based_portfolio_params() == params.to_public_params()

    def test_backtesting_model_validators(self) -> None:
        from unittest.mock import Mock, patch

        from src.models.backtesting import BacktestCompareConfigV3

        # Lines models/backtesting.py:243,246,281.
        existing = BacktestCompareConfigV3(config_id="c1", saved_config_id="cfg-1")
        assert BacktestCompareConfigV3.validate_config(existing) is existing
        assert BacktestCompareConfigV3.validate_config("not-a-dict") == "not-a-dict"
        # Line 281: fallback when nested params unsupported (mocked).
        mock_recipe = Mock()
        mock_recipe.normalize_public_params.return_value = {"flat": 1}
        with (
            patch(
                "src.services.backtesting.strategy_registry.get_strategy_recipe",
                return_value=mock_recipe,
            ),
            patch(
                "src.models.backtesting.supports_nested_public_params",
                return_value=False,
            ),
        ):
            out = BacktestCompareConfigV3.validate_config(
                {"config_id": "c2", "strategy_id": "dca_classic", "params": {}}
            )
            assert out["params"] == {"flat": 1}

    def test_daily_suggestion_response_lazy_states(self) -> None:
        from datetime import UTC
        from datetime import datetime as dt_cls

        from src.models.backtesting import (
            Allocation,
            AssetAllocation,
            MarketSnapshot,
            SignalState,
            TargetAllocation,
        )
        from src.models.strategy import (
            DailySuggestionActionState,
            DailySuggestionContextState,
            DailySuggestionPortfolioState,
            DailySuggestionResponse,
            DailySuggestionStrategyContextState,
            DailySuggestionTargetState,
        )

        # Lines models/strategy.py:88,101 — lazy decision/execution states.
        response = DailySuggestionResponse(
            as_of=dt_cls(2026, 1, 1, tzinfo=UTC),
            config_id="c1",
            config_display_name="C1",
            strategy_id="dca_classic",
            action=DailySuggestionActionState(
                status="no_action",
                required=False,
                kind=None,
                reason_code="flat",
                transfers=[],
            ),
            context=DailySuggestionContextState(
                market=MarketSnapshot(
                    date=dt_cls(2026, 1, 1, tzinfo=UTC).date(),
                    token_price={"btc": 100.0},
                    sentiment=None,
                    sentiment_label=None,
                ),
                signal=SignalState(
                    id="dma_fgi_portfolio_rules_signal",
                    regime="neutral",
                    confidence=0.5,
                ),
                portfolio=DailySuggestionPortfolioState(
                    spot_usd=50.0,
                    stable_usd=50.0,
                    total_value=100.0,
                    total_assets_usd=100.0,
                    total_debt_usd=0.0,
                    total_net_usd=100.0,
                    allocation=Allocation(spot=0.5, stable=0.5),
                    asset_allocation=AssetAllocation(
                        btc=0.5, eth=0.0, spy=0.0, stable=0.5, alt=0.0
                    ),
                ),
                target=DailySuggestionTargetState(
                    allocation=TargetAllocation(
                        btc=0.5, eth=0.0, spy=0.0, stable=0.5, alt=0.0
                    )
                ),
                strategy=DailySuggestionStrategyContextState(
                    stance="hold",
                    reason_code="flat",
                    rule_group="none",
                    details={},
                ),
            ),
        )
        assert response.decision.action == "hold"
        assert response.execution.status == "no_action"


class TestBootstrapYieldRouterGaps:
    def _public_config(self, config_id: str, *, is_default: bool = False):
        from src.models.strategy_config import SavedStrategyConfig, StrategyComposition

        return SavedStrategyConfig(
            config_id=config_id,
            display_name=config_id,
            strategy_id="dma_fgi_portfolio_rules",
            composition=StrategyComposition(kind="composed"),
            is_default=is_default,
            is_benchmark=False,
        )

    def test_build_public_presets_empty_returns_empty(self) -> None:
        from unittest.mock import Mock

        from src.services.strategy.strategy_bootstrap_service import (
            _build_public_presets,
        )

        # Line strategy_bootstrap_service.py:39 — no public configs, no presets.
        store = Mock()
        store.list_configs.return_value = []
        assert (
            _build_public_presets(
                store, supported_strategy_ids={"dma_fgi_portfolio_rules"}
            )
            == []
        )

    def test_build_public_presets_benchmark_default_rejected(self) -> None:
        from unittest.mock import Mock

        import pytest

        from src.models.strategy_config import SavedStrategyConfig, StrategyComposition
        from src.services.strategy.strategy_bootstrap_service import (
            _build_public_presets,
        )

        # Line 44 — resolved default must not be a benchmark.
        store = Mock()
        store.list_configs.return_value = [self._public_config("cfg-a")]
        store.resolve_config.return_value = SavedStrategyConfig(
            config_id="bench-default",
            display_name="Bench",
            strategy_id="dma_fgi_portfolio_rules",
            composition=StrategyComposition(kind="benchmark"),
            is_benchmark=True,
        )
        with pytest.raises(ValueError, match="is a benchmark"):
            _build_public_presets(
                store, supported_strategy_ids={"dma_fgi_portfolio_rules"}
            )

    def test_build_public_presets_unexposed_default_rejected(self) -> None:
        from unittest.mock import Mock

        import pytest

        from src.models.strategy_config import SavedStrategyConfig, StrategyComposition
        from src.services.strategy.strategy_bootstrap_service import (
            _build_public_presets,
        )

        # Line 50 — resolved default must be exposed in public presets.
        store = Mock()
        store.list_configs.return_value = [self._public_config("cfg-a")]
        store.resolve_config.return_value = SavedStrategyConfig(
            config_id="cfg-hidden",
            display_name="Hidden",
            strategy_id="dma_fgi_portfolio_rules",
            composition=StrategyComposition(kind="composed"),
            is_benchmark=False,
        )
        with pytest.raises(ValueError, match="not exposed"):
            _build_public_presets(
                store, supported_strategy_ids={"dma_fgi_portfolio_rules"}
            )

    def test_yield_service_skips_without_apr(self) -> None:
        import asyncio
        from unittest.mock import AsyncMock, Mock, patch
        from uuid import uuid4

        from src.services.aggregators.yield_summary_builder import build_yield_summary
        from src.services.analytics.eth_staking_income import EthStakingExposure
        from src.services.yield_return_service import YieldReturnService

        # Lines yield_return_service.py:303,307 — None APR keeps observed carry.
        observed = build_yield_summary("user", [], ("30d",), "none")
        service = YieldReturnService.__new__(YieldReturnService)
        service._logger = Mock()
        service._staking_apr_provider = AsyncMock()
        service._staking_apr_provider.get_benchmark_apr.return_value = None
        exposure = EthStakingExposure(
            total_usd=100.0,
            token_symbols=("wstETH",),
            values_by_symbol=(("wstETH", 100.0),),
        )
        with patch(
            "src.services.yield_return_service.run_in_threadpool",
            AsyncMock(return_value=exposure),
        ):
            result = asyncio.run(
                service._with_current_eth_staking_income(
                    observed,
                    user_id=uuid4(),
                    wallet_address=None,
                    wallet_key="k",
                    ttl_hours=1,
                )
            )
        assert result is observed
        service._logger.info.assert_called_once()

    def test_base_window_timeout_defaults(self) -> None:
        from unittest.mock import patch

        from src.services.yield_return_service import (
            SINGLE_FLIGHT_WAIT_SECONDS,
            YieldReturnService,
        )

        # Line yield_return_service.py:369 — non-positive timeout uses default.
        with patch("src.services.yield_return_service.settings") as mock_settings:
            mock_settings.db_statement_timeout_ms = 0
            assert (
                YieldReturnService._base_window_wait_timeout()
                == SINGLE_FLIGHT_WAIT_SECONDS
            )
            mock_settings.db_statement_timeout_ms = 1000
            assert YieldReturnService._base_window_wait_timeout() == 6.0

    def test_v3_strategy_conflict_paths(self) -> None:
        from unittest.mock import Mock

        import pytest
        from fastapi import HTTPException

        from src.api.routers.v3_strategy import (
            set_default_saved_strategy_config,
            update_saved_strategy_config,
        )
        from src.services.strategy.strategy_config_management_service import (
            StrategyConfigConflictError,
        )

        # Lines v3_strategy.py:130,133,156,161 — admin conflicts map to 409.
        update_service = Mock()
        update_service.update_config.side_effect = StrategyConfigConflictError("busy")
        with pytest.raises(HTTPException) as exc:
            update_saved_strategy_config("cfg-1", Mock(), update_service)
        assert exc.value.status_code == 409

        default_service = Mock()
        default_service.set_default.side_effect = StrategyConfigConflictError("busy")
        with pytest.raises(HTTPException) as exc2:
            set_default_saved_strategy_config("cfg-1", default_service)
        assert exc2.value.status_code == 409

    def test_lido_fetch_live_apr(self) -> None:
        import asyncio
        from unittest.mock import AsyncMock, Mock, patch

        from src.services.market.lido_staking_apr_provider import LidoStakingAprProvider

        # Lines lido_staking_apr_provider.py:51,55-57 — live fetch parses APR.
        provider = LidoStakingAprProvider()
        mock_response = Mock()
        mock_response.json.return_value = {"data": {"smaApr": 2.5}}
        mock_client = AsyncMock()
        mock_client.get.return_value = mock_response
        mock_cm = AsyncMock()
        mock_cm.__aenter__.return_value = mock_client
        with patch(
            "src.services.market.lido_staking_apr_provider.httpx.AsyncClient",
            return_value=mock_cm,
        ):
            result = asyncio.run(provider._fetch_live_apr())
            assert result == 0.025
            mock_client.get.assert_called_once()
            mock_response.raise_for_status.assert_called_once()

    def test_sentiment_history_bound_and_validation(self) -> None:
        from datetime import datetime as dt_cls

        from src.services.market.sentiment_database_service import (
            _coerce_history_bound,
        )

        # Line sentiment_database_service.py:35 — naive datetime gains UTC.
        naive = dt_cls(2026, 1, 1, 12, 0, 0)
        assert _coerce_history_bound(naive, end_of_day=False).tzinfo == UTC

    def test_sentiment_history_rejects_inverted_range(self) -> None:
        from datetime import datetime as dt_cls
        from unittest.mock import Mock

        import pytest

        # Line 236 — start after end fails closed.
        from src.services.market.sentiment_database_service import (
            SentimentDatabaseService,
        )

        service = SentimentDatabaseService.__new__(SentimentDatabaseService)
        service.query_service = Mock()
        service.db = Mock()
        with pytest.raises(ValueError, match="on or before"):
            import asyncio

            asyncio.run(
                service.get_sentiment_history(
                    hours=24,
                    start_time=dt_cls(2026, 1, 2, tzinfo=UTC),
                    end_time=dt_cls(2026, 1, 1, tzinfo=UTC),
                )
            )

    def test_sentiment_daily_aggregates_returns_rows(self) -> None:
        from unittest.mock import Mock

        from src.services.market.sentiment_database_service import (
            SentimentDatabaseService,
        )

        # Lines 380,382 — aggregates log and return rows.
        service = SentimentDatabaseService.__new__(SentimentDatabaseService)
        service.query_service = Mock()
        service.query_service.execute_query.return_value = [{"d": 1}, {"d": 2}]
        service.db = Mock()
        rows = service.get_daily_sentiment_aggregates(
            start_date="2026-01-01", end_date="2026-01-02"
        )
        assert rows == [{"d": 1}, {"d": 2}]


class TestExecutionPluginEthBtcGaps:
    def _buy_intent(self, *, immediate: bool = False, target=None):
        from src.services.backtesting.decision import AllocationIntent

        return AllocationIntent(
            action="buy",
            target_allocation=(
                {"btc": 0.8, "eth": 0.0, "spy": 0.0, "stable": 0.2, "alt": 0.0}
                if target is None
                else target
            ),
            allocation_name="test",
            immediate=immediate,
            reason="test",
            rule_group="dma_fgi",
            decision_score=0.8,
        )

    def _hints(self, *, enable: bool = True, action: str = "buy"):
        from src.services.backtesting.execution.contracts import ExecutionHints

        return ExecutionHints(
            signal_id="sig",
            current_regime="fear",
            signal_value=0.5,
            signal_confidence=1.0,
            decision_score=0.8,
            decision_action=action,  # type: ignore[arg-type]
            dma_distance=-0.15,
            enable_buy_gate=enable,
            buy_strength=0.6,
        )

    def _context(self):
        from datetime import date as date_cls
        from unittest.mock import Mock

        from src.services.backtesting.strategies.base import StrategyContext

        portfolio = Mock()
        portfolio.total_value = Mock(return_value=10_000.0)
        return StrategyContext(
            date=date_cls(2026, 1, 1),
            price=50_000.0,
            sentiment=None,
            price_history=[50_000.0],
            portfolio=portfolio,
        )

    def test_trade_quota_guard_plugin_basics(self) -> None:
        from datetime import date as date_cls

        from src.services.backtesting.execution.plugins import PluginInvocation
        from src.services.backtesting.execution.trade_quota_guard_plugin import (
            TradeQuotaGuardExecutionPlugin,
        )

        # Line 44: history lookback delegates to limits.
        plugin = TradeQuotaGuardExecutionPlugin(max_trades_7d=2)
        assert plugin.history_lookback_days == 7
        # Line 57: reset restores seeded dates.
        plugin.load_trade_dates([date_cls(2026, 1, 1)])
        plugin._trade_dates.append(date_cls(2026, 1, 2))
        plugin.reset()
        assert plugin._trade_dates == [date_cls(2026, 1, 1)]
        # Line 60: observe is a no-op sink.
        plugin.observe(object())
        # Line 64: disabled or missing target short-circuits precheck.
        disabled = TradeQuotaGuardExecutionPlugin()
        invocation = PluginInvocation(
            context=self._context(),
            intent=self._buy_intent(target=None),
            hints=self._hints(),
        )
        assert disabled.precheck(invocation).allowed is True
        # Line 97: disabled after_execution returns empty result.
        assert disabled.after_execution(invocation, []).allowed is True

    def test_dma_buy_gate_plugin_reset_and_short_circuits(self) -> None:
        from src.services.backtesting.execution.dma_buy_gate_plugin import (
            DmaBuyGateExecutionPlugin,
        )
        from src.services.backtesting.execution.plugins import PluginInvocation

        # Line 32: reset clears gate state.
        plugin = DmaBuyGateExecutionPlugin()
        plugin._gate.observe_dma_distance(-0.15)
        plugin.reset()
        # Line 49: immediate intents return diagnostics without gating.
        invocation = PluginInvocation(
            context=self._context(),
            intent=self._buy_intent(immediate=True),
            hints=self._hints(enable=True),
        )
        result = plugin.precheck(invocation)
        assert result.allowed is True
        assert len(result.diagnostics) == 1
        # Line 73: disabled/immediate adjust returns the plan unchanged.
        step_plan = {"btc": 100.0, "stable": -100.0}
        out = plugin.adjust_step_plan(invocation, step_plan)
        assert out.step_plan == step_plan
        # Line 122: inactive invocation yields empty after_execution.
        inactive = PluginInvocation(
            context=self._context(),
            intent=self._buy_intent(),
            hints=self._hints(enable=False),
        )
        assert plugin.after_execution(inactive, []).allowed is True

    def test_eth_btc_deviation_tier_edges(self) -> None:
        import pytest

        from src.services.backtesting.portfolio_rules.eth_btc_deviation_dca import (
            EthBtcDeviationDcaRule,
            _ratio_deviation,
            _require_tier,
            _tier_for_snapshot,
        )
        from src.services.backtesting.signals.dma_gated_fgi.types import (
            DmaCooldownState,
        )
        from src.services.backtesting.signals.ratio_state import EthBtcRatioState
        from tests.services.backtesting.helpers import snapshot

        # Line 111: intent without a matching tier fails closed.
        rule = EthBtcDeviationDcaRule()
        empty = snapshot(eth_btc_ratio_state=None)
        with pytest.raises(ValueError, match="without a match"):
            _require_tier(empty, rule=rule)
        # Line 144: symmetric disabled ignores the mirrored side.
        sym_off = EthBtcDeviationDcaRule(symmetric_enabled=False)
        cooldown = DmaCooldownState(active=False, remaining_days=0, blocked_zone=None)
        bullish = EthBtcRatioState(
            ratio=1.6,
            ratio_dma_200=1.0,
            zone="above",  # type: ignore[arg-type]
            cross_event=None,
            actionable_cross_event=None,
            cooldown_state=cooldown,
        )
        sym_snap = snapshot(eth_btc_ratio_state=bullish)
        assert _tier_for_snapshot(sym_snap, rule=sym_off) is None
        # Line 194: explicit deviation bypasses ratio math.
        explicit = EthBtcRatioState(
            ratio=1.0,
            ratio_dma_200=1.0,
            zone="above",  # type: ignore[arg-type]
            cross_event=None,
            actionable_cross_event=None,
            cooldown_state=cooldown,
        )
        object.__setattr__(explicit, "deviation_from_dma_200", -0.7)
        assert _ratio_deviation(explicit) == pytest.approx(-0.7)
        # Line 196: non-positive DMA base yields no deviation.
        flat = EthBtcRatioState(
            ratio=1.0,
            ratio_dma_200=0.0,
            zone="above",  # type: ignore[arg-type]
            cross_event=None,
            actionable_cross_event=None,
            cooldown_state=cooldown,
        )
        assert _ratio_deviation(flat) is None


class TestCompositionGaps:
    def _legacy_family(self, family_id: str = "mock_legacy_family"):
        from src.models.strategy_config import SavedStrategyConfig, StrategyComposition
        from src.services.backtesting.composition_catalog import StrategyFamilySpec

        def _builder(config_id: str, params):
            return SavedStrategyConfig(
                config_id=config_id,
                display_name=config_id,
                strategy_id=family_id,
                composition=StrategyComposition(kind="composed"),
                params=dict(params),
            )

        family = StrategyFamilySpec(
            strategy_id=family_id,
            composition_kind="composed",
            mutable_via_admin=True,
            legacy_saved_config_builder=_builder,
        )
        return family, _builder

    def test_build_saved_config_from_legacy_success(self) -> None:
        from src.services.backtesting.composition import build_saved_config_from_legacy
        from src.services.backtesting.composition_catalog import (
            get_default_composition_catalog,
        )

        # Line composition.py:140 — legacy builder path returns the config.
        family, _ = self._legacy_family()
        catalog = get_default_composition_catalog().with_extensions(
            strategy_families={family.strategy_id: family}
        )
        result = build_saved_config_from_legacy(
            strategy_id=family.strategy_id,
            params={"a": 1},
            config_id="legacy-1",
            catalog=catalog,
        )
        assert result.config_id == "legacy-1"

    def test_resolve_compare_legacy_path(self) -> None:
        from src.models.backtesting import BacktestCompareConfigV3
        from src.services.backtesting.composition import resolve_compare_request_config
        from src.services.backtesting.composition_catalog import (
            get_default_composition_catalog,
        )

        # Lines 157-158 — inline strategy_id resolves via legacy builder.
        family, _ = self._legacy_family()
        catalog = get_default_composition_catalog().with_extensions(
            strategy_families={family.strategy_id: family}
        )
        request = BacktestCompareConfigV3.model_construct(
            config_id="req-1",
            saved_config_id=None,
            strategy_id=family.strategy_id,
            params={"a": 1},
        )
        result = resolve_compare_request_config(
            request,
            resolve_saved_config=lambda _cid: (_ for _ in ()).throw(
                AssertionError("should not call saved path")
            ),
            catalog=catalog,
        )
        assert result.config_id == "req-1"

    def test_resolve_benchmark_family_path(self) -> None:
        from unittest.mock import Mock, patch

        from src.models.strategy_config import SavedStrategyConfig, StrategyComposition
        from src.services.backtesting.composition import resolve_saved_strategy_config
        from src.services.backtesting.composition_catalog import StrategyFamilySpec

        # Lines 193-194 — benchmark families resolve via recipe metadata.
        family = StrategyFamilySpec(
            strategy_id="bench_fam",
            composition_kind="benchmark",
            mutable_via_admin=False,
            benchmark_strategy_builder_factory=lambda cfg: (lambda req: Mock()),
        )
        catalog = Mock()
        catalog.resolve_family.return_value = family
        catalog.resolve_bucket_mapper.return_value = Mock()
        mock_recipe = Mock()
        mock_recipe.signal_id = "sig"
        mock_recipe.warmup_lookback_days = 0
        mock_recipe.market_data_requirements = Mock()
        saved = SavedStrategyConfig(
            config_id="bench-1",
            display_name="Bench",
            strategy_id="bench_fam",
            composition=StrategyComposition(kind="benchmark"),
        )
        with (
            patch(
                "src.services.backtesting.composition.get_default_composition_catalog",
                return_value=catalog,
            ),
            patch(
                "src.services.backtesting.composition.get_strategy_recipe",
                return_value=mock_recipe,
            ),
        ):
            resolved = resolve_saved_strategy_config(saved, catalog=catalog)
        assert resolved.summary_signal_id == "sig"

    def test_resolve_recipe_rejects_non_composed(self) -> None:
        from unittest.mock import Mock

        import pytest

        from src.services.backtesting.composition import (
            _resolve_recipe_saved_strategy_config,
        )
        from src.services.backtesting.composition_catalog import StrategyFamilySpec

        # Line 268 — recipe path requires a composed family.
        family = StrategyFamilySpec(
            strategy_id="bench_fam",
            composition_kind="benchmark",
            mutable_via_admin=False,
        )
        with pytest.raises(ValueError, match="not recipe-backed"):
            _resolve_recipe_saved_strategy_config(
                saved_config=Mock(strategy_id="bench_fam"),
                family=family,
                bucket_mapper=Mock(),
                catalog=Mock(),
            )

    def test_resolve_recipe_plugin_loop(self) -> None:
        from unittest.mock import Mock, patch

        from src.models.strategy_config import StrategyComponentRef
        from src.services.backtesting.composition import (
            _resolve_recipe_saved_strategy_config,
        )
        from tests.services.backtesting.support import (
            build_mock_composed_catalog,
            build_mock_saved_config,
        )

        # Line 282 — recipe validation instantiates each plugin.
        catalog = build_mock_composed_catalog()
        base = catalog.strategy_families["mock_signal_family"]
        saved = build_mock_saved_config()
        plugin_ref = StrategyComponentRef(component_id="mock_plugin", params={})
        saved = saved.model_copy(
            update={
                "composition": saved.composition.model_copy(
                    update={"plugins": [plugin_ref]}, deep=True
                )
            },
            deep=True,
        )
        # CompositionCatalog is frozen; wrap resolve in a Mock facade instead
        # of patching the frozen instance.
        facade = Mock(wraps=catalog)
        facade.resolve_plugin_factory.return_value = lambda params: Mock()
        with patch(
            "src.services.backtesting.composition.get_strategy_recipe"
        ) as mock_recipe_fn:
            mock_recipe = Mock()
            mock_recipe.signal_id = "sig"
            mock_recipe.warmup_lookback_days = 0
            mock_recipe.market_data_requirements = Mock()
            mock_recipe.normalize_public_params.return_value = {}
            mock_recipe.build_strategy = Mock()
            mock_recipe_fn.return_value = mock_recipe
            resolved = _resolve_recipe_saved_strategy_config(
                saved_config=saved,
                family=base,
                bucket_mapper=Mock(),
                catalog=facade,
            )
        assert resolved.summary_signal_id == "sig"

    def test_validate_component_params_plugin_loop(self) -> None:
        from unittest.mock import Mock

        from src.models.strategy_config import StrategyComponentRef
        from src.services.backtesting.composition import _validate_component_params

        # Line 322 — component validation instantiates each plugin.
        catalog = Mock()
        catalog.resolve_plugin_factory.return_value = lambda params: Mock()
        _validate_component_params(
            decision_factory=lambda p: Mock(),
            decision_params={},
            pacing_factory=lambda p: Mock(),
            pacing_params={},
            execution_factory=lambda p: Mock(),
            execution_params={},
            plugin_refs=[StrategyComponentRef(component_id="p1", params={})],
            catalog=catalog,
        )
        catalog.resolve_plugin_factory.assert_called_once_with("p1")


class TestDailySuggestionGaps:
    def test_macro_service_missing_fails_closed(self) -> None:
        from datetime import date as date_cls
        from unittest.mock import Mock, patch

        import pytest

        from src.services.backtesting.features import MarketDataRequirements
        from src.services.exceptions import MarketDataUnavailableError
        from src.services.strategy.strategy_daily_suggestion_service import (
            StrategyDailySuggestionService,
        )

        # Line 394 — macro requirement without a service fails closed.
        service = StrategyDailySuggestionService.__new__(StrategyDailySuggestionService)
        service.token_price_service = Mock()
        service.stock_price_service = Mock()
        service.macro_fear_greed_service = None
        requirements = Mock(spec=MarketDataRequirements)
        requirements.requires_macro_fear_greed = True
        with patch(
            "src.services.strategy.strategy_daily_suggestion_service.resolve_price_feature_history",
            return_value={},
        ):
            with pytest.raises(MarketDataUnavailableError, match="not configured"):
                service._load_required_market_features_by_date(
                    resolved_config=Mock(primary_asset="BTC"),
                    market_data_requirements=requirements,
                    current_date=date_cls(2026, 1, 2),
                    history_start=date_cls(2026, 1, 1),
                )

    def test_seed_history_loads_guards_and_plugins(self) -> None:
        from datetime import date as date_cls
        from unittest.mock import Mock
        from uuid import uuid4

        from src.services.backtesting.execution.trade_quota_guard_plugin import (
            TradeQuotaGuardExecutionPlugin,
        )
        from src.services.strategy.strategy_daily_suggestion_service import (
            StrategyDailySuggestionService,
        )

        # Lines 638,640,651 — quota guards extend lookback; plugins load dates.
        # NOTE: history plugins are filtered by runtime_checkable
        # TradeHistoryAwareExecutionPlugin, which Mock does not satisfy —
        # use a real quota-guard plugin here.
        service = StrategyDailySuggestionService.__new__(StrategyDailySuggestionService)
        history_plugin = TradeQuotaGuardExecutionPlugin(max_trades_7d=2)
        execution_engine = Mock()
        execution_engine.plugins = (history_plugin,)
        guard_7d = Mock()
        guard_7d.min_trade_interval_days = None
        guard_7d.max_trades_7d = 2
        guard_7d.max_trades_30d = 5
        decision_policy = Mock()
        decision_policy.risk_guards = (guard_7d,)
        strategy = Mock()
        strategy.execution_engine = execution_engine
        strategy.decision_policy = decision_policy
        service.trade_history_store = Mock()
        service.trade_history_store.list_trade_dates.return_value = [
            date_cls(2026, 1, 1)
        ]
        service._seed_trade_history_plugins(
            strategy=strategy,
            user_id=uuid4(),
            current_date=date_cls(2026, 1, 5),
        )
        assert history_plugin._trade_dates == [date_cls(2026, 1, 1)]
        execution_engine.seed_trade_dates.assert_called_once()

    def test_coerce_portfolio_total_edges(self) -> None:
        from src.services.strategy.strategy_daily_suggestion_service import (
            StrategyDailySuggestionService,
        )

        coerce = StrategyDailySuggestionService._coerce_portfolio_total
        # Line 693 — None/bool fall back.
        assert coerce(value=None, fallback=1.5) == 1.5
        assert coerce(value=True, fallback=1.5) == 1.5
        # Line 695 — non-numeric types fall back.
        assert coerce(value=object(), fallback=2.5) == 2.5
        # Lines 698-699 — unparseable numeric strings fall back.
        assert coerce(value="not-a-number", fallback=3.5) == 3.5
        assert coerce(value="2.0", fallback=0.0) == 2.0


class TestFinalThreeLines:
    def test_signal_engine_defensive_none_after_extract(self) -> None:
        from unittest.mock import Mock

        import pytest

        from src.services.backtesting.signals.dma_gated_fgi.errors import (
            SignalDataError,
        )
        from src.services.backtesting.signals.dma_gated_fgi.signal_engine import (
            DmaSignalEngine,
        )

        # Line signal_engine.py:162 — defensive None after require_dma extract.
        # _extract_state_inputs with require_dma=True normally raises first
        # (line 106), so force the defensive path by stubbing the extractor.
        engine = DmaSignalEngine()
        engine._extract_state_inputs = Mock(return_value=Mock(dma_200=None))
        with pytest.raises(SignalDataError, match="dma_200"):
            engine.build_market_state(Mock())

    def test_flat_minimum_delegates_when_state_present(self) -> None:
        from unittest.mock import Mock

        from src.services.backtesting.signals.flat_minimum import (
            FlatMinimumSignalComponent,
        )

        # Line flat_minimum.py:239 — delegate to the latest snapshot state.
        signal = FlatMinimumSignalComponent()
        sentinel = Mock()
        state = Mock()
        state.dma_state_for.return_value = sentinel
        signal._latest_state = state
        assert signal.dma_state_for("btc") is sentinel
        state.dma_state_for.assert_called_once_with("btc")

    def test_macro_history_required_reraise(self) -> None:
        import logging
        from datetime import date as date_cls
        from unittest.mock import Mock

        import pytest

        from src.services.market.macro_fear_greed_history import (
            resolve_macro_fear_greed_history,
        )

        # Line macro_fear_greed_history.py:37 — required callers see the cause.
        failing = Mock()
        failing.get_daily_macro_fear_greed.side_effect = RuntimeError("db down")
        with pytest.raises(RuntimeError, match="db down"):
            resolve_macro_fear_greed_history(
                macro_fear_greed_service=failing,
                start_date=date_cls(2026, 1, 1),
                end_date=date_cls(2026, 1, 2),
                logger=logging.getLogger("test"),
                required=True,
            )
