"""Never publish an invented deployment or a non-reproducible historical example."""

import json
from decimal import Decimal

import pytest
from pyrevm import EVM, AccountInfo

from scripts.pinned_strategy.codec import EMPTY_STATES, epoch_day
from scripts.pinned_strategy.compile import ARTIFACT
from scripts.pinned_strategy.deploy import (
    DEPLOYMENTS,
    FACTORY,
    FACTORY_CODE,
    SALT,
    predicted_address,
    verify_code,
)
from scripts.pinned_strategy.evm import CALLER, SliceEVM
from scripts.pinned_strategy.export_landing_examples import (
    OUTPUT,
    TRACK_RECORD,
    decimal_value,
    obs_args,
)


def test_create2_address_against_real_local_evm():
    artifact = json.loads(ARTIFACT.read_text())
    evm = EVM(spec_id="SHANGHAI")
    evm.insert_account_info(FACTORY, AccountInfo(code=bytes.fromhex(FACTORY_CODE[2:])))
    output = evm.message_call(
        CALLER, FACTORY, SALT + bytes.fromhex(artifact["initcode"][2:])
    )
    address = predicted_address(artifact["initcode"])
    assert output.hex().lower() == address[2:].lower()
    assert "0x" + evm.basic(address).code_hash.hex() == artifact["runtime_codehash"]


def test_landing_bundle_is_honest_and_reproducible():
    from datetime import date

    data = json.loads(OUTPUT.read_text())
    artifact = json.loads(ARTIFACT.read_text())
    deployment = json.loads(DEPLOYMENTS.read_text())
    assert data["researchOnly"] is True
    assert data["rulesCovered"] == ["cross_down_exit"]
    assert data["abi"] == artifact["abi"]
    assert data["runtimeCodehash"] == artifact["runtime_codehash"]
    assert data["deployment"] == deployment
    if deployment is None:
        assert data["examples"] == []
        return
    assert deployment["chainId"] == 421614
    assert deployment["address"] == predicted_address(artifact["initcode"])
    assert deployment["runtimeCodehash"] == artifact["runtime_codehash"]
    evm = SliceEVM()
    published = json.loads(TRACK_RECORD.read_text())
    for example in data["examples"]:
        for observation in example["previous"] + example["current"]:
            for field in ("price", "dma"):
                assert Decimal(observation[field]["decimal"]) * 10**18 == int(
                    observation[field]["wad"]
                )
        for value in example["allocation"]:
            assert Decimal(value["decimal"]) * 10**18 == int(value["wad"])
        warmup = evm.call("warmup", EMPTY_STATES, obs_args(example["previous"]))
        if example["stateMode"] == "warmup":
            assert warmup == tuple(tuple(s) for s in example["priorStates"])
            assert all(s[3] == 0 for s in warmup)
        states = warmup if example["stateMode"] == "warmup" else example["priorStates"]
        day = epoch_day(date.fromisoformat(example["date"]))
        assert day - epoch_day(date.fromisoformat(example["previousDate"])) == 1
        views, _ = evm.call(
            "observe",
            states,
            obs_args(example["current"]),
            day,
            example["crossOnTouch"],
        )
        result = evm.call(
            "cross_down_exit",
            views,
            [int(v["wad"]) for v in example["allocation"]],
            example["lastExecutedDay"],
            day,
        )
        assert result[0] and not result[1]
        assert list(map(str, result[6])) == example["expected"]["pyrevmTarget"]
        assert result[3:6] == tuple(
            example["expected"][k]
            for k in ("triggerMask", "exitMask", "liquidatedMask")
        )
        assert all(
            abs(
                Decimal(result[6][i]) / 10**18
                - Decimal(example["expected"]["pythonTarget"][i])
            )
            <= Decimal("1e-12")
            for i in range(4)
        )
        assert example["publishedEvent"] in published["events"]
        assert example["publishedEvent"]["reason"] == "portfolio_cross_down_exit"
        series = next(s for s in published["series"] if s["id"] == "strategy")
        index = next(
            i for i, p in enumerate(series["values"]) if p["date"] == example["date"]
        )
        assert example["expected"]["publishedTarget"] == list(
            map(str, published["allocations"]["values"][index])
        )


def test_decimal_export_and_codehash_check():
    assert decimal_value(1e-12) == {"decimal": "0.000000000001000000", "wad": "1000000"}
    artifact = json.loads(ARTIFACT.read_text())

    class Rpc:
        def call(self, *args):
            return artifact["runtime_code"]

    verify_code(Rpc(), "0x00", artifact)
    with pytest.raises(RuntimeError, match="codehash"):
        verify_code(Rpc(), "0x00", {"runtime_codehash": "wrong"})


def test_exporter_replays_real_strategy_with_synthetic_test_inputs(
    tmp_path, monkeypatch
):
    from scripts.pinned_strategy import export_landing_examples as exporter
    from scripts.pinned_strategy.benchmark import run_compare
    from tests.test_validation_events import EVENTS, _synthetic_market_history

    history = _synthetic_market_history(
        event=next(
            e for e in EVENTS if e.id == "btc_cross_down_preserve_spy_2025_10_18"
        )
    )
    result = run_compare(history, True).model_dump(mode="json")
    last = result["timeline"][-1]["strategies"]["slice"]["portfolio"][
        "asset_allocation"
    ]
    published = {
        "window": {"start": history[2].isoformat(), "end": history[3].isoformat()},
        "events": [
            {
                "date": "2025-10-18",
                "reason": "portfolio_cross_down_exit",
                "fromAssets": ["BTC", "ETH"],
            }
        ],
        "series": [{"id": "strategy", "values": [{"date": "2025-10-18"}]}],
        "allocations": {
            "assets": ["btc", "eth", "spy", "stable"],
            "values": [[round(last[k], 4) for k in ("btc", "eth", "spy", "stable")]],
        },
    }
    artifact = json.loads(ARTIFACT.read_text())
    deployment = tmp_path / "deployments.json"
    deployment.write_text(json.dumps({"runtimeCodehash": artifact["runtime_codehash"]}))
    track = tmp_path / "track.json"
    track.write_text(json.dumps(published))
    history_path = tmp_path / "history"
    history_path.write_text("synthetic-test-only")
    monkeypatch.setattr(exporter, "DEPLOYMENTS", deployment)
    monkeypatch.setattr(exporter, "TRACK_RECORD", track)
    monkeypatch.setattr(exporter, "HISTORY", history_path)
    monkeypatch.setattr(exporter, "OUTPUT", tmp_path / "output.json")
    monkeypatch.setattr(exporter, "read_history", lambda: history)
    payload = exporter.generate(["2025-10-18"])
    assert len(payload["examples"]) == 1
    example = payload["examples"][0]
    assert example["stateMode"] == "warmup"
    assert example["expected"]["exitMask"] == 6
    assert example["expected"]["pyrevmTarget"][:2] == ["0", "0"]
    deployment.write_text("null")
    with pytest.raises(RuntimeError, match="Deploy first"):
        exporter.generate(["2025-10-18"])
    before = exporter.OUTPUT.read_bytes()
    assert exporter.generate(["2025-10-18"], validate_only=True)["examples"]
    assert exporter.OUTPUT.read_bytes() == before
    assert exporter.generate([])["examples"] == []


def test_approved_historical_example_before_deployment():
    from scripts.pinned_strategy.export_landing_examples import generate

    before = OUTPUT.read_bytes()
    example = generate(["2025-10-18"], validate_only=True)["examples"][0]
    assert example["stateMode"] == "warmup"
    assert example["lastExecutedDay"] == 0
    assert example["expected"]["triggerMask"] == 2
    assert example["expected"]["exitMask"] == 6
    assert example["expected"]["liquidatedMask"] == 6
    assert example["expected"]["pyrevmTarget"][:2] == ["0", "0"]
    assert OUTPUT.read_bytes() == before
