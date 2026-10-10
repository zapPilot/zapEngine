import pytest

from scripts.pinned_strategy import history as history_module
from scripts.pinned_strategy.benchmark import run_compare, synthetic_history
from scripts.pinned_strategy.codec import to_wad
from scripts.pinned_strategy.history import BUNDLE_REF, recorded_bundle
from scripts.pinned_strategy.shadow import shadow_compare
from src.services.backtesting.lab.bundle import BundleError, synthetic_bundle


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
    try:
        bundle = recorded_bundle()
    except BundleError:
        pytest.skip("No recorded production history; an operator records prod:latest")
    history = bundle.history()
    with shadow_compare(strict_distance=True) as metrics:
        run_compare(history, touch)
    # The first 14 rows are warmup; every later row is an evaluated day.
    assert metrics.days == len(history[0]) - 14
    assert metrics.matched > 0


def test_float_relative_distance_limit_is_explicit():
    # Integer WAD division cannot guarantee relative 1e-15 parity with
    # Python's rounded division followed by cancellation near DMA.
    price = 100.00000000000001
    python_distance = price / 100.0 - 1.0
    wad_distance = (to_wad(price) * 10**18 // to_wad(100.0) - 10**18) / 10**18
    assert abs(wad_distance - python_distance) / abs(python_distance) > 1e-15


def test_the_recorded_history_is_the_latest_prod_bundle(monkeypatch):
    bundle = synthetic_bundle("synthetic:regimes?seed=1&days=300")
    asked = []
    monkeypatch.setattr(
        history_module, "load_bundle", lambda ref: asked.append(ref) or bundle
    )

    assert recorded_bundle() is bundle
    assert asked == [BUNDLE_REF] == ["prod:latest"]


def test_prices_the_evm_codec_would_conflate_are_refused(monkeypatch):
    bundle = synthetic_bundle("synthetic:regimes?seed=1&days=300")
    # Two distinct floats below 1e-18 both floor to the same WAD.
    bundle.prices[0]["prices"]["btc"] = 1e-19
    bundle.prices[1]["prices"]["btc"] = 2e-19
    monkeypatch.setattr(history_module, "load_bundle", lambda ref: bundle)

    with pytest.raises(ValueError, match="WAD collision"):
        recorded_bundle()
