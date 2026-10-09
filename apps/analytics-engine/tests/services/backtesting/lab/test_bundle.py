from __future__ import annotations

import gzip
import json
import os
from datetime import date
from pathlib import Path
from typing import Any

import pytest

from src.services.backtesting.features import MarketDataRequirements
from src.services.backtesting.lab.bundle import (
    BUNDLE_SCHEMA,
    BundleCorruptError,
    BundleExistsError,
    BundleManifest,
    BundleNotFoundError,
    BundleReferenceError,
    build_manifest,
    check_bundle_name,
    encode_bundle,
    load_bundle,
    read_bundle,
    reference_requirements,
    requirements_as_dict,
    resolve_bundle_path,
    synthetic_bundle,
    write_bundle,
)
from src.services.backtesting.lab.synthetic import synthetic_market


def _market(days: int = 300):
    return synthetic_market(seed=1, days=days)


def _write(bundles_dir: Path, name: str = "prod", days: int = 300) -> Path:
    market = _market(days)
    manifest = build_manifest(
        name=name,
        source="production-read-only",
        prices=market.prices,
        sentiments=market.sentiments,
        start=market.user_start_date,
        end=market.prices[-1]["date"],
        requirements=reference_requirements(),
    )
    return write_bundle(
        bundles_dir,
        manifest=manifest,
        prices=market.prices,
        sentiments=market.sentiments,
    )


def _rewrite(path: Path, edit: Any) -> None:
    """Re-gzip the bundle after ``edit`` changed its decompressed lines."""
    lines = gzip.decompress(path.read_bytes()).decode().splitlines()
    path.write_bytes(
        gzip.compress("".join(f"{line}\n" for line in edit(lines)).encode())
    )


def _as_json(value: Any) -> Any:
    """What a value becomes in a bundle: dates and datetimes turn into text."""
    return json.loads(json.dumps(value, default=lambda item: item.isoformat()))


def test_a_bundle_round_trips_through_disk(tmp_path: Path) -> None:
    market = _market()

    bundle = read_bundle(_write(tmp_path))

    assert bundle.prices == market.prices
    assert bundle.sentiments == {
        day: _as_json(value) for day, value in market.sentiments.items()
    }
    assert bundle.manifest.name == "prod"
    assert bundle.manifest.start == market.user_start_date
    assert bundle.manifest.end == market.prices[-1]["date"]
    assert bundle.manifest.coverage["rows"] == len(market.prices)
    assert bundle.manifest.requirements == reference_requirements()
    assert bundle.path is not None


def test_a_bundle_lives_under_its_identity(tmp_path: Path) -> None:
    path = _write(tmp_path)
    manifest = read_bundle(path).manifest

    assert path == tmp_path / "prod" / f"{manifest.bundle_id}.jsonl.gz"
    assert manifest.bundle_id == (
        f"{manifest.end.isoformat()}-{manifest.content_sha256[:12]}"
    )


def test_the_same_data_gives_the_same_bytes() -> None:
    market = _market()
    manifest = build_manifest(
        name="prod",
        source="production-read-only",
        prices=market.prices,
        sentiments=market.sentiments,
        start=market.user_start_date,
        end=market.prices[-1]["date"],
        requirements=reference_requirements(),
    )

    first = encode_bundle(manifest, market.prices, market.sentiments)
    second = encode_bundle(manifest, market.prices, market.sentiments)

    assert first == second
    assert first[4:8] == b"\x00\x00\x00\x00"


def test_a_bundle_is_never_overwritten(tmp_path: Path) -> None:
    _write(tmp_path)

    with pytest.raises(BundleExistsError, match="already exists"):
        _write(tmp_path)


def test_history_hands_out_copies(tmp_path: Path) -> None:
    bundle = read_bundle(_write(tmp_path))

    prices, sentiments, start, end = bundle.history()
    prices[0]["price"] = -1.0
    sentiments.clear()

    assert bundle.prices[0]["price"] != -1.0
    assert bundle.sentiments
    assert (start, end) == (bundle.manifest.start, bundle.manifest.end)


def test_a_missing_file_is_not_found(tmp_path: Path) -> None:
    with pytest.raises(BundleNotFoundError):
        read_bundle(tmp_path / "nope.jsonl.gz")


def test_a_file_that_is_not_gzip_is_corrupt(tmp_path: Path) -> None:
    path = tmp_path / "x.jsonl.gz"
    path.write_bytes(b"not a gzip stream")

    with pytest.raises(BundleCorruptError, match="not a gzip"):
        read_bundle(path)


@pytest.mark.parametrize("payload", [b"", b"not json\n", b"{}\n"])
def test_a_file_without_a_manifest_is_corrupt(tmp_path: Path, payload: bytes) -> None:
    path = tmp_path / "x.jsonl.gz"
    path.write_bytes(gzip.compress(payload))

    with pytest.raises(BundleCorruptError):
        read_bundle(path)


def test_an_unsupported_schema_is_refused(tmp_path: Path) -> None:
    path = _write(tmp_path)

    def edit(lines: list[str]) -> list[str]:
        manifest = json.loads(lines[0])
        manifest["schema"] = 1
        return [json.dumps(manifest), *lines[1:]]

    _rewrite(path, edit)

    with pytest.raises(BundleCorruptError, match=f"reads schema {BUNDLE_SCHEMA}"):
        read_bundle(path)


def test_a_manifest_missing_a_field_is_corrupt(tmp_path: Path) -> None:
    path = _write(tmp_path)

    def edit(lines: list[str]) -> list[str]:
        manifest = json.loads(lines[0])
        del manifest["window"]
        return [json.dumps(manifest), *lines[1:]]

    _rewrite(path, edit)

    with pytest.raises(BundleCorruptError, match="Malformed bundle manifest"):
        read_bundle(path)


def test_changed_rows_no_longer_match_their_hash(tmp_path: Path) -> None:
    path = _write(tmp_path)

    def edit(lines: list[str]) -> list[str]:
        return [lines[0], lines[1] + " ", *lines[2:]]

    _rewrite(path, edit)

    with pytest.raises(BundleCorruptError, match="content hash"):
        read_bundle(path)


def test_not_a_number_cannot_be_recorded() -> None:
    row = {
        "date": date(2025, 1, 1),
        "price": float("nan"),
        "prices": {},
        "extra_data": {},
    }

    with pytest.raises(ValueError, match="not JSON compliant"):
        build_manifest(
            name="prod",
            source="x",
            prices=[row],
            sentiments={},
            start=row["date"],
            end=row["date"],
            requirements={},
        )


def test_a_value_json_cannot_hold_is_rejected() -> None:
    row = {
        "date": date(2025, 1, 1),
        "price": 1.0,
        "prices": {},
        "extra_data": {"x": {1}},
    }

    with pytest.raises(TypeError, match="set is not JSON serializable"):
        build_manifest(
            name="prod",
            source="x",
            prices=[row],
            sentiments={},
            start=row["date"],
            end=row["date"],
            requirements={},
        )


@pytest.mark.parametrize("name", ["prod", "prod-2026", "a_b", "x" * 48])
def test_good_names(name: str) -> None:
    check_bundle_name(name)


@pytest.mark.parametrize("name", ["", "Prod", "../x", "a/b", "1prod", "x" * 49, "a b"])
def test_bad_names(name: str) -> None:
    with pytest.raises(BundleReferenceError, match="not a bundle name"):
        check_bundle_name(name)


def test_the_manifest_names_what_the_data_is() -> None:
    market = _market(50)
    manifest = build_manifest(
        name="prod",
        source="production-read-only",
        prices=market.prices,
        sentiments=market.sentiments,
        start=market.user_start_date,
        end=market.prices[-1]["date"],
        requirements={"k": 1},
    )

    dumped = manifest.as_dict()

    assert dumped["schema"] == BUNDLE_SCHEMA
    assert dumped["window"] == {
        "start": market.user_start_date.isoformat(),
        "end": market.prices[-1]["date"].isoformat(),
    }
    assert BundleManifest.from_dict(dumped) == manifest


def test_latest_is_the_newest_end_date(tmp_path: Path) -> None:
    older = _write(tmp_path, days=250)
    newer = _write(tmp_path, days=300)

    assert resolve_bundle_path("prod:latest", tmp_path) == newer
    assert newer.name > older.name


def test_latest_breaks_a_tie_by_modification_time(tmp_path: Path) -> None:
    directory = tmp_path / "prod"
    directory.mkdir()
    first = directory / "2026-01-01-aaaaaaaaaaaa.jsonl.gz"
    second = directory / "2026-01-01-bbbbbbbbbbbb.jsonl.gz"
    first.write_bytes(b"")
    second.write_bytes(b"")
    os.utime(first, ns=(2, 2))
    os.utime(second, ns=(1, 1))

    assert resolve_bundle_path("prod:latest", tmp_path) == first


def test_a_bundle_is_found_by_its_id_or_its_path(tmp_path: Path) -> None:
    path = _write(tmp_path)
    bundle_id = path.name.removesuffix(".jsonl.gz")

    assert resolve_bundle_path(f"prod:{bundle_id}", tmp_path) == path
    assert resolve_bundle_path(str(path), tmp_path) == path
    assert load_bundle(f"prod:{bundle_id}", tmp_path).manifest.name == "prod"


@pytest.mark.parametrize("ref", ["prod", "prod:", ":latest"])
def test_a_reference_needs_a_name_and_a_version(ref: str, tmp_path: Path) -> None:
    with pytest.raises(BundleReferenceError):
        resolve_bundle_path(ref, tmp_path)


def test_latest_of_an_unknown_name_is_not_found(tmp_path: Path) -> None:
    with pytest.raises(BundleNotFoundError, match="No bundle named 'prod'"):
        resolve_bundle_path("prod:latest", tmp_path)


def test_latest_of_an_empty_folder_is_not_found(tmp_path: Path) -> None:
    (tmp_path / "prod").mkdir()

    with pytest.raises(BundleNotFoundError):
        resolve_bundle_path("prod:latest", tmp_path)


def test_a_synthetic_reference_builds_a_deterministic_bundle() -> None:
    bundle = load_bundle("synthetic:regimes?seed=2&days=300")
    again = synthetic_bundle("synthetic:regimes?seed=2&days=300")
    market = synthetic_market(seed=2, scenario="regimes", days=300)

    assert bundle.manifest.content_sha256 == again.manifest.content_sha256
    assert bundle.prices == market.prices
    assert bundle.manifest.source == "synthetic"
    assert bundle.manifest.name == "synthetic-regimes-2-300"
    assert bundle.path is None


def test_a_synthetic_reference_has_defaults() -> None:
    bundle = synthetic_bundle("synthetic:stress")

    assert bundle.manifest.name == "synthetic-stress-1-400"


@pytest.mark.parametrize(
    "ref",
    [
        "synthetic:nope",
        "synthetic:regimes?speed=3",
        "synthetic:regimes?seed=abc",
        "synthetic:regimes?days=0",
    ],
)
def test_a_bad_synthetic_reference_is_refused(ref: str) -> None:
    with pytest.raises(BundleReferenceError):
        load_bundle(ref)


def test_requirements_are_plain_json() -> None:
    requirements = MarketDataRequirements(
        requires_sentiment=True,
        required_price_features=frozenset({"b", "a"}),
        required_aux_series=frozenset({"z"}),
        max_lag_days=3,
    )

    dumped = requirements_as_dict(requirements)

    assert dumped["required_price_features"] == ["a", "b"]
    assert dumped["required_aux_series"] == ["z"]
    assert dumped["max_lag_days"] == 3
    assert json.loads(json.dumps(dumped)) == dumped
    assert reference_requirements()["requires_macro_fear_greed"] is True


def test_a_recorded_run_is_the_run_on_the_original_data(tmp_path: Path) -> None:
    """The engine ignores what a bundle turns into text, so nothing changes."""
    from dataclasses import replace

    from src.services.backtesting.spec import load_spec
    from src.services.backtesting.strategy_registry import (
        resolve_spec_strategy_config,
    )
    from tests.services.backtesting.support.synthetic_runs import run_resolved_compare

    market = _market(250)
    resolved = [
        replace(
            resolve_spec_strategy_config(load_spec("reference/dma_fgi"), config_id="r"),
            request_config_id="r",
        )
    ]
    bundle = read_bundle(_write(tmp_path, days=250))
    prices, sentiments, start, end = bundle.history()

    original = run_resolved_compare(
        prices=market.prices,
        sentiments=market.sentiments,
        start=market.user_start_date,
        end=market.prices[-1]["date"],
        resolved=resolved,
    )
    replayed = run_resolved_compare(
        prices=prices, sentiments=sentiments, start=start, end=end, resolved=resolved
    )

    assert replayed.model_dump(mode="json") == original.model_dump(mode="json")
    assert replayed.strategies["r"].trade_count > 0
