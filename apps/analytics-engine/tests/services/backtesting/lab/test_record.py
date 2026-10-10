from __future__ import annotations

from pathlib import Path

import pytest

from src.core.config import settings
from src.services.backtesting.lab.bundle import (
    BundleExistsError,
    read_bundle,
    resolve_bundle_path,
)
from src.services.backtesting.lab.record import (
    RecordRefused,
    ensure_read_only,
    record_bundle,
)
from src.services.backtesting.lab.synthetic import synthetic_market
from tests.services.backtesting.support.synthetic_services import (
    SyntheticMarketServices,
)


def _service(days: int = 300):
    market = synthetic_market(seed=3, days=days)
    return market, SyntheticMarketServices(market).build_backtesting_service()


def test_recording_keeps_the_prepared_window_as_a_bundle(tmp_path: Path) -> None:
    market, service = _service()
    end = market.prices[-1]["date"]

    recording = record_bundle(
        service,
        name="prod",
        start=market.user_start_date,
        end=end,
        bundles_dir=tmp_path,
        dry_run=False,
    )

    assert recording.path is not None
    bundle = read_bundle(recording.path)
    assert bundle.manifest == recording.manifest
    assert recording.rows == len(bundle.prices)
    assert bundle.manifest.source == "production-read-only"
    assert bundle.manifest.start == market.user_start_date
    assert bundle.manifest.end == end
    assert bundle.prices[-1]["date"] == end
    assert bundle.manifest.coverage["complete_window"]["days"] > 300
    assert resolve_bundle_path("prod:latest", tmp_path) == recording.path


def test_a_dry_run_reports_the_coverage_and_writes_nothing(tmp_path: Path) -> None:
    market, service = _service()

    recording = record_bundle(
        service,
        name="prod",
        start=market.user_start_date,
        end=market.prices[-1]["date"],
        bundles_dir=tmp_path,
        dry_run=True,
    )

    assert recording.path is None
    assert recording.manifest.coverage["rows"] == recording.rows
    assert list(tmp_path.iterdir()) == []


def test_a_recording_never_overwrites_an_earlier_one(tmp_path: Path) -> None:
    market, service = _service()
    arguments = {
        "name": "prod",
        "start": market.user_start_date,
        "end": market.prices[-1]["date"],
        "bundles_dir": tmp_path,
        "dry_run": False,
    }
    record_bundle(service, **arguments)

    with pytest.raises(BundleExistsError):
        record_bundle(service, **arguments)


def test_recording_follows_the_reference_strategys_data_needs(tmp_path: Path) -> None:
    market, service = _service()

    recording = record_bundle(
        service,
        name="prod",
        start=market.user_start_date,
        end=market.prices[-1]["date"],
        bundles_dir=tmp_path,
        dry_run=True,
    )

    requirements = recording.manifest.requirements
    assert requirements["requires_macro_fear_greed"] is True
    assert "eth_btc_relative_strength" in "".join(requirements["required_aux_series"])


def test_recording_is_refused_unless_the_service_is_read_only(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "database_read_only", False)

    with pytest.raises(RecordRefused, match="DATABASE_READ_ONLY must be true"):
        ensure_read_only()


def test_recording_needs_a_read_only_database_url(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "database_read_only", True)
    monkeypatch.setattr(settings, "database_read_only_url", "placeholder_db_url")

    with pytest.raises(RecordRefused, match="DATABASE_READ_ONLY_URL is not set"):
        ensure_read_only()


def test_recording_may_run_when_read_only_with_a_url(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "database_read_only", True)
    monkeypatch.setattr(
        settings, "database_read_only_url", "postgresql://reader@example/db"
    )

    ensure_read_only()
