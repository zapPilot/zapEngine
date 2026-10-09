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

    def test_cross_up_equal_weight_has_no_public_params_section(self) -> None:
        from src.services.backtesting.portfolio_rules.cross_up_equal_weight import (
            CrossUpEqualWeightRule,
        )

        # Line cross_up_equal_weight.py:32 — rule has no tunable public section.
        assert CrossUpEqualWeightRule.public_params_section() is None

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


class TestRiskValidationEngineGaps:
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


class TestMetricsAndRuleBoundaries:
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
        from src.services.backtesting.strategies.rule_based_portfolio import (
            DmaGatedFgiParams,
            default_rule_based_portfolio_params,
        )

        # Line rule_based_portfolio.py:409.
        params = DmaGatedFgiParams()
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


class TestBootstrapYieldRouterGaps:
    def _public_config(self, config_id: str, *, is_default: bool = False):
        from src.models.strategy_config import SavedStrategyConfig

        return SavedStrategyConfig(
            config_id=config_id,
            display_name=config_id,
            strategy_id="dma_fgi_portfolio_rules",
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

        from src.models.strategy_config import SavedStrategyConfig
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
            is_benchmark=True,
        )
        with pytest.raises(ValueError, match="is a benchmark"):
            _build_public_presets(
                store, supported_strategy_ids={"dma_fgi_portfolio_rules"}
            )

    def test_build_public_presets_unexposed_default_rejected(self) -> None:
        from unittest.mock import Mock

        import pytest

        from src.models.strategy_config import SavedStrategyConfig
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
            service.get_sentiment_history(
                hours=24,
                start_time=dt_cls(2026, 1, 2, tzinfo=UTC),
                end_time=dt_cls(2026, 1, 1, tzinfo=UTC),
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


class TestEthBtcRuleGaps:
    def test_eth_btc_deviation_tier_edges(self) -> None:
        import pytest

        from src.services.backtesting.portfolio_rules.eth_btc_deviation_dca import (
            EthBtcDeviationDcaRule,
            _match_for_snapshot,
            _ratio_deviation,
            _require_match,
        )
        from src.services.backtesting.signals.dma_gated_fgi.types import (
            DmaCooldownState,
        )
        from src.services.backtesting.signals.ratio_state import EthBtcRatioState
        from tests.services.backtesting.helpers import snapshot

        # An intent without a matching tier fails closed.
        rule = EthBtcDeviationDcaRule()
        empty = snapshot(eth_btc_ratio_state=None)
        with pytest.raises(ValueError, match="without a match"):
            _require_match(empty, rule=rule)
        # Without an upper leg the mirrored side is ignored.
        sym_off = EthBtcDeviationDcaRule(above=None)
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
        assert _match_for_snapshot(sym_snap, rule=sym_off) is None
        # An explicit deviation bypasses the ratio math.
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
        # A non-positive DMA base yields no deviation.
        flat = EthBtcRatioState(
            ratio=1.0,
            ratio_dma_200=0.0,
            zone="above",  # type: ignore[arg-type]
            cross_event=None,
            actionable_cross_event=None,
            cooldown_state=cooldown,
        )
        assert _ratio_deviation(flat) is None


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
