"""Measured slice latency and full compare shadow overhead (history required by default)."""

from __future__ import annotations

import argparse
import json
import platform
import statistics
import time
from contextlib import nullcontext
from datetime import date, timedelta

from scripts.pinned_strategy.codec import EMPTY_STATES, WAD
from scripts.pinned_strategy.evm import SliceEVM
from scripts.pinned_strategy.record_market_history import HISTORY, read_history
from scripts.pinned_strategy.shadow import shadow_compare
from src.models.backtesting import BacktestCompareConfigV3, BacktestCompareRequestV3
from src.services.backtesting.execution.compare import run_compare_v3_on_data


def synthetic_history(days=500):
    """Deterministic boundary stream; explicitly never represented as real market history."""
    from tests.services.backtesting.support.scenarios import price_row

    start = date(2025, 1, 1)
    prices, sentiments = [], {}
    for i in range(-14, days):
        day = start + timedelta(days=i)
        values = [
            float([90, 110, 100, 110, 90][((i + j * 7) // 9) % 5]) for j in range(3)
        ]
        row = price_row(day, price=values[1], dma_200=100.0)
        row["prices"] = dict(zip(("spy", "btc", "eth"), values, strict=True))
        row["extra_data"].update(
            eth_price_usd=values[2],
            eth_dma_200=100.0,
            spy_price=values[0],
            spy_dma_200=100.0,
            eth_btc_ratio=values[2] / values[1],
            eth_btc_ratio_dma_200=1.0,
            macro_fear_greed={
                "label": "neutral",
                "score": 50,
                "source": "synthetic",
                "updated_at": day.isoformat(),
            },
        )
        if i % 41 == 0:
            row["extra_data"].pop("eth_dma_200")
        prices.append(row)
        sentiments[day] = {
            "label": ["fear", "neutral", "greed"][(i // 13) % 3],
            "value": 50,
        }
    return prices, sentiments, start, start + timedelta(days=days - 1)


def run_compare(history, touch):
    prices, sentiments, start, end = history
    from src.config.strategy_presets import _DMA_FGI_PORTFOLIO_RULES_OPTIMIZED_PARAMS

    params = (
        {"signal": {"cross_on_touch": True}}
        if touch
        else _DMA_FGI_PORTFOLIO_RULES_OPTIMIZED_PARAMS
    )
    request = BacktestCompareRequestV3(
        token_symbol="BTC",
        start_date=start,
        end_date=end,
        total_capital=10000,
        configs=[
            BacktestCompareConfigV3(
                config_id="slice", strategy_id="dma_fgi_portfolio_rules", params=params
            )
        ],
    )
    return run_compare_v3_on_data(prices, sentiments, request, start)


class PyEVMHost:
    """Use titanoboa's py-evm backend with the same raw calldata, bypassing its ABI wrappers."""

    def __init__(self):
        from scripts.pinned_strategy.compile import ARTIFACT

        artifact = json.loads(ARTIFACT.read_text())
        from unittest.mock import patch

        from boa.environment import Env
        from boa.vm.py_evm import GENESIS_PARAMS
        from eth.chains.mainnet import MainnetChain
        from eth.db.atomic import AtomicDB
        from eth.vm.forks.shanghai import ShanghaiVM

        def shanghai_chain():
            chain = MainnetChain.configure(vm_configuration=((0, ShanghaiVM),))
            return chain.from_genesis(
                AtomicDB(), {**GENESIS_PARAMS, "difficulty": 0, "nonce": bytes(8)}
            )

        with patch("boa.vm.py_evm._make_chain", shanghai_chain):
            self.env = Env()
        self.address, computation = self.env.deploy(
            bytecode=bytes.fromhex(artifact["initcode"][2:])
        )
        if computation.is_error:
            raise RuntimeError(str(computation.error))
        self.codec = SliceEVM().codec
        self.gas = 0

    def call(self, name, *args):
        computation = self.env.execute_code(
            to_address=self.address,
            data=self.codec.encode(name, args),
            is_modifying=False,
        )
        if computation.is_error:
            raise RuntimeError(str(computation.error))
        self.gas = computation.get_gas_used()
        result = self.codec.decode(name, computation.output)
        return result[0] if len(result) == 1 else result


def latency(host, iterations):
    obs = [(90 * WAD, 100 * WAD)] * 3
    states = ((1, 1, 0, 0),) * 3
    views, states = host.call("observe", states, obs, 20000, True)
    calls = {
        "warmup": (EMPTY_STATES, obs),
        "observe": (states, obs, 20000, True),
        "commit": (states, views, 20000, 7, True, 7),
        "cross_down_exit": (views, [WAD // 4] * 4 + [0], 0, 20000),
    }
    result = {}
    for name, args in calls.items():
        for _ in range(20):
            host.call(name, *args)
        samples = []
        for _ in range(iterations):
            begin = time.perf_counter_ns()
            host.call(name, *args)
            samples.append((time.perf_counter_ns() - begin) / 1000)
        median = statistics.median(samples)
        result[name] = {
            "median_us": median,
            "p95_us": sorted(samples)[int(len(samples) * 0.95)],
            "gas": host.gas,
            "gas_semantics": "transaction including intrinsic calldata"
            if isinstance(host, SliceEVM)
            else "execution only",
            "execution_gas": host.gas
            - (21000 + sum(4 if b == 0 else 16 for b in host.codec.encode(name, args)))
            if isinstance(host, SliceEVM)
            else host.gas,
            "daily_45_calls_ms": median * 45 / 1000,
            "study_144000_calls_s": median * 144000 / 1e6,
        }
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--synthetic", action="store_true")
    parser.add_argument("--backend", choices=["pyrevm", "py-evm"], default="pyrevm")
    parser.add_argument("--iterations", type=int, default=500)
    parser.add_argument("--output", type=str)
    args = parser.parse_args()
    if args.iterations < 20:
        parser.error("At least 20 iterations required")
    host = SliceEVM() if args.backend == "pyrevm" else PyEVMHost()
    report = {
        "python": platform.python_version(),
        "platform": platform.platform(),
        "backend": args.backend,
        "latency": latency(host, args.iterations),
    }
    if args.backend == "pyrevm":
        if not args.synthetic and not HISTORY.exists():
            raise SystemExit(
                "Real history missing: run approved recorder first, or explicitly choose --synthetic"
            )
        history = synthetic_history() if args.synthetic else read_history()
        report["history"] = (
            "synthetic-boundary-stream" if args.synthetic else str(HISTORY)
        )
        report["compare"] = {}
        for touch in (True, False):
            timings = {}
            baseline = None
            for enabled in (False, True):
                samples = []
                for _ in range(3):
                    with shadow_compare(host) if enabled else nullcontext() as metrics:
                        begin = time.perf_counter()
                        result = run_compare(history, touch)
                        samples.append(time.perf_counter() - begin)
                    if baseline is None:
                        baseline = result
                    assert result == baseline, "Shadow changed production output"
                timings["shadow" if enabled else "python"] = statistics.median(samples)
                if enabled:
                    timings["parity"] = metrics.dict()
            timings["overhead_ratio"] = timings["shadow"] / timings["python"]
            report["compare"][str(touch)] = timings
    output = json.dumps(report, indent=2, sort_keys=True) + "\n"
    if args.output:
        from pathlib import Path

        Path(args.output).write_text(output)
    print(output)


if __name__ == "__main__":
    main()
