"""Export proven historical examples, or an honest empty deployment placeholder."""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
from datetime import date
from decimal import ROUND_FLOOR, Decimal, localcontext
from unittest.mock import patch

from scripts.pinned_strategy import shadow
from scripts.pinned_strategy.benchmark import run_compare
from scripts.pinned_strategy.codec import EMPTY_STATES, KEYS, epoch_day, mask
from scripts.pinned_strategy.compile import ARTIFACT, ROOT
from scripts.pinned_strategy.deploy import DEPLOYMENTS
from scripts.pinned_strategy.evm import SliceEVM
from scripts.pinned_strategy.record_market_history import HISTORY, read_history
from src.services.backtesting.signals.flat_minimum import (
    _ASSET_SPECS,
    _build_asset_dma_context,
)

LANDING = ROOT.parent / "landing-page"
OUTPUT = LANDING / "src/data/verifiable-strategy.json"
TRACK_RECORD = LANDING / "src/data/equity-curve.json"


def decimal_value(value):
    # The engine input is already binary float; publish its round-trip decimal,
    # explicitly quantized to 18 decimals. Browser parsing never uses Number.
    with localcontext() as ctx:
        ctx.prec = 1100
        decimal = Decimal(str(value)).quantize(Decimal("1e-18"), rounding=ROUND_FLOOR)
        return {"decimal": format(decimal, "f"), "wad": str(int(decimal * 10**18))}


def observation(context):
    result = []
    for spec in _ASSET_SPECS:
        asset = _build_asset_dma_context(context, spec)
        result.append(
            {
                "symbol": spec.symbol,
                "price": decimal_value(0 if asset is None else asset.price),
                "dma": decimal_value(
                    0 if asset is None else asset.extra_data["dma_200"]
                ),
            }
        )
    return result


def obs_args(obs):
    return [(int(row["price"]["wad"]), int(row["dma"]["wad"])) for row in obs]


def replay(dates):
    """Replay recorded Python inputs and pyrevm without consulting rolling snapshots."""
    examples = []
    if dates:
        history = read_history()
        evm = SliceEVM()

        class ExportShadow(shadow.Shadow):
            def install(self):
                super().install()
                component = self.strategy.signal_component
                policy = self.strategy.decision_policy
                warmup, observe, decide = (
                    component.warmup,
                    component.observe,
                    policy.decide,
                )
                self.previous = None

                def wrapped_warmup(context):
                    warmup(context)
                    self.previous = (context.date, observation(context))

                def wrapped_observe(context):
                    self.before = self.states
                    self.previous_for_day = self.previous
                    self.current = observation(context)
                    self.previous = (context.date, self.current)
                    return observe(context)

                def wrapped_decide(snapshot):
                    intent = decide(snapshot)
                    if snapshot.current_date.isoformat() not in dates:
                        return intent
                    assert (intent.diagnostics or {}).get(
                        "matched_rule_name"
                    ) == "cross_down_exit", "Historical winner is not cross_down_exit"
                    assert self.previous_for_day is not None
                    previous_date, previous = self.previous_for_day
                    assert (snapshot.current_date - previous_date).days == 1, (
                        "Previous calendar day missing"
                    )
                    warm = evm.call("warmup", EMPTY_STATES, obs_args(previous))
                    use_warmup = warm == self.before and all(
                        state[3] == 0 for state in self.before
                    )
                    states = warm if use_warmup else self.before
                    views, _ = evm.call(
                        "observe",
                        states,
                        obs_args(self.current),
                        epoch_day(snapshot.current_date),
                        component.config.cross_on_touch,
                    )
                    allocation = [
                        decimal_value(snapshot.current_asset_allocation.get(key, 0))
                        for key in KEYS
                    ]
                    result = evm.call(
                        "cross_down_exit",
                        views,
                        [int(v["wad"]) for v in allocation],
                        epoch_day(self.last_execution),
                        epoch_day(snapshot.current_date),
                    )
                    assert result[0] and not result[1]
                    diag = intent.diagnostics
                    assert result[3:6] == tuple(
                        mask(diag[key])
                        for key in (
                            "portfolio_rule_trigger_assets",
                            "portfolio_rule_exit_assets",
                            "portfolio_rule_assets",
                        )
                    )
                    python_target = [
                        decimal_value(intent.target_allocation[key])["decimal"]
                        for key in KEYS[:4]
                    ]
                    assert all(
                        abs(Decimal(result[6][i]) / 10**18 - Decimal(python_target[i]))
                        <= Decimal("1e-12")
                        for i in range(4)
                    ), "Decimal-input EVM target differs from Python"
                    examples.append(
                        {
                            "date": snapshot.current_date.isoformat(),
                            "previousDate": previous_date.isoformat(),
                            "previous": previous,
                            "current": self.current,
                            "allocation": allocation,
                            "lastExecutedDay": epoch_day(self.last_execution),
                            "crossOnTouch": component.config.cross_on_touch,
                            "stateMode": "warmup" if use_warmup else "explicit",
                            "priorStates": [list(s) for s in self.before],
                            "expected": {
                                "pythonTarget": python_target,
                                "pyrevmTarget": [str(v) for v in result[6]],
                                "triggerMask": result[3],
                                "exitMask": result[4],
                                "liquidatedMask": result[5],
                            },
                            "provenance": {
                                "historySha256": hashlib.sha256(
                                    HISTORY.read_bytes()
                                ).hexdigest(),
                                "source": "read-only production compare inputs; replayed Python strategy",
                                "encoding": "engine float round-trip decimal, floored to 18 decimal places; allocation tolerance 1e-12",
                            },
                        }
                    )
                    return intent

                component.warmup = wrapped_warmup
                component.observe = wrapped_observe
                policy.decide = wrapped_decide

        with patch.object(shadow, "Shadow", ExportShadow), shadow.shadow_compare(evm):
            run_compare(history, True)
        assert {e["date"] for e in examples} == set(dates), (
            "Requested decision date missing"
        )
    return examples


def validate_publication(examples, published):
    history = read_history()
    if (history[2].isoformat(), history[3].isoformat()) != (
        published["window"]["start"],
        published["window"]["end"],
    ):
        raise RuntimeError(
            "Recorded window differs from the published track record; obtain a matching approved recording"
        )
    assert published["allocations"]["assets"] == list(KEYS[:4])
    series = next(s for s in published["series"] if s["id"] == "strategy")
    for example in examples:
        event = next(
            e
            for e in published["events"]
            if e["date"] == example["date"]
            and e["reason"] == "portfolio_cross_down_exit"
        )
        index = next(
            i
            for i, row in enumerate(series["values"])
            if row["date"] == example["date"]
        )
        target = list(map(str, published["allocations"]["values"][index]))
        assert all(
            abs(Decimal(a) - Decimal(b)) <= Decimal("0.00005")
            for a, b in zip(example["expected"]["pythonTarget"], target, strict=True)
        ), "Replayed target differs from the published four-decimal allocation"
        example["expected"]["publishedTarget"] = target
        example["publishedEvent"] = event
        example["provenance"]["trackRecordSha256"] = hashlib.sha256(
            TRACK_RECORD.read_bytes()
        ).hexdigest()


def generate(dates, *, validate_only=False, refresh_deployment=False):
    artifact = json.loads(ARTIFACT.read_text())
    deployment = json.loads(DEPLOYMENTS.read_text())
    if (
        deployment is not None
        and deployment["runtimeCodehash"] != artifact["runtime_codehash"]
    ):
        raise RuntimeError("Deployment artifact mismatch")
    if refresh_deployment:
        payload = json.loads(OUTPUT.read_text())
        if (
            payload["runtimeCodehash"] != artifact["runtime_codehash"]
            or payload["abi"] != artifact["abi"]
        ):
            raise RuntimeError("Published artifact mismatch")
        payload["deployment"] = deployment
        write_payload(payload)
        return payload
    if dates and not HISTORY.exists():
        published = json.loads(TRACK_RECORD.read_text())
        subprocess.run(
            [
                sys.executable,
                str(ROOT / "scripts/pinned_strategy/record_market_history.py"),
                "--start",
                published["window"]["start"],
                "--end",
                published["window"]["end"],
            ],
            cwd=ROOT,
            check=True,
        )
    examples = replay(dates)
    if examples and not validate_only:
        validate_publication(examples, json.loads(TRACK_RECORD.read_text()))
    source_commit = subprocess.check_output(
        [
            "git",
            "log",
            "-1",
            "--format=%H",
            "--",
            str(ROOT / "contracts/pinned_strategy/dma_cross_down_slice.vy"),
        ],
        text=True,
    ).strip()
    payload = {
        "schemaVersion": 1,
        "rulesCovered": ["cross_down_exit"],
        "researchOnly": True,
        "compiler": "0.4.3",
        "evmVersion": "shanghai",
        "runtimeCodehash": artifact["runtime_codehash"],
        "sourceUrl": f"https://github.com/zapPilot/zapEngine/blob/{source_commit}/apps/analytics-engine/contracts/pinned_strategy/dma_cross_down_slice.vy",
        "abi": artifact["abi"],
        "deployment": deployment,
        "examples": examples,
    }
    if validate_only:
        return payload
    write_payload(payload)
    return payload


def write_payload(payload):
    OUTPUT.write_text(json.dumps(payload, indent=2) + "\n")
    subprocess.run(
        ["pnpm", "exec", "prettier", "--write", str(OUTPUT)], cwd=LANDING, check=True
    )
    return payload


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dates", nargs="+", default=["2025-10-18"])
    parser.add_argument(
        "--empty",
        action="store_true",
        help="Publish ABI and real deployment status without inventing examples",
    )
    parser.add_argument(
        "--validate-only",
        action="store_true",
        help="Replay approved recorded inputs without publishing or requiring deployment",
    )
    parser.add_argument(
        "--refresh-deployment",
        action="store_true",
        help="Update deployment only; preserve frozen examples without replay",
    )
    args = parser.parse_args()
    if args.refresh_deployment and (args.empty or args.validate_only):
        parser.error(
            "--refresh-deployment cannot be combined with --empty or --validate-only"
        )
    for value in args.dates:
        date.fromisoformat(value)
    payload = generate(
        [] if args.empty else args.dates,
        validate_only=args.validate_only,
        refresh_deployment=args.refresh_deployment,
    )
    if args.validate_only:
        print(
            json.dumps(
                {
                    "validatedDates": [e["date"] for e in payload["examples"]],
                    "published": False,
                }
            )
        )


if __name__ == "__main__":
    main()
