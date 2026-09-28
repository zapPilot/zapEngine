import pytest

from scripts.pinned_strategy.benchmark import run_compare, synthetic_history
from scripts.pinned_strategy.codec import to_wad
from scripts.pinned_strategy.record_market_history import HISTORY, read_history
from scripts.pinned_strategy.shadow import shadow_compare


@pytest.mark.parametrize("touch", [True, False])
def test_500_day_boundary_stream(touch):
    history = synthetic_history()
    baseline = run_compare(history, touch)
    with shadow_compare(strict_distance=True) as metrics:
        assert run_compare(history, touch) == baseline
    assert metrics.days == 500
    assert metrics.matched > 0
    assert metrics.executions > 0


@pytest.mark.parametrize("touch", [True, False])
def test_recorded_history(touch):
    if not HISTORY.exists():
        pytest.skip("Production read-only recording awaits explicit approval")
    history = read_history()
    with shadow_compare(strict_distance=True) as metrics:
        run_compare(history, touch)
    # Recorded fixture spans 514 calendar days with one production gap
    # (2026-08-24 missing): 513 rows = 14 warmup + 499 evaluated.
    assert metrics.days == len(history[0]) - 14
    assert metrics.days >= 499
    assert metrics.matched > 0


def test_float_relative_distance_limit_is_explicit():
    # Integer WAD division cannot guarantee relative 1e-15 parity with
    # Python's rounded division followed by cancellation near DMA.
    price = 100.00000000000001
    python_distance = price / 100.0 - 1.0
    wad_distance = (to_wad(price) * 10**18 // to_wad(100.0) - 10**18) / 10**18
    assert abs(wad_distance - python_distance) / abs(python_distance) > 1e-15


def test_history_roundtrip(tmp_path, monkeypatch):
    from scripts.pinned_strategy import record_market_history as recorder

    target = tmp_path / "history.jsonl.gz"
    monkeypatch.setattr(recorder, "HISTORY", target)
    history = synthetic_history(2)
    recorder.write_history(target, *history)
    assert read_history(target) == history
    with pytest.raises(FileExistsError):
        recorder.write_history(target, *history)
    with pytest.raises(ValueError):
        recorder.write_history(tmp_path / "other" / "history.jsonl.gz", *history)
