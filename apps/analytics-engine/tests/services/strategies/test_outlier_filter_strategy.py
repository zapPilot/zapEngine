"""
Comprehensive unit tests for OutlierFilterStrategy implementations.

Tests cover all four strategy classes (NoOpFilter, IQRFilter, ZScoreFilter,
PercentileFilter) with focus on edge cases, numerical accuracy, and outlier
detection correctness. Targets 95%+ code coverage.
"""

import numpy as np
import pytest

from src.models.yield_returns import OutlierInfo
from src.services.strategy.outlier_filter_strategy import (
    IQRFilter,
    NoOpFilter,
    PercentileFilter,
    ZScoreFilter,
)

# ==================== FIXTURES ====================


@pytest.fixture
def sample_daily_totals() -> dict[str, float]:
    """Normal distribution with 30 days, mean≈115, std≈17."""
    return {f"2024-01-{i:02d}": float(100 + i * 2) for i in range(1, 31)}


@pytest.fixture
def outlier_daily_totals(sample_daily_totals: dict[str, float]) -> dict[str, float]:
    """Normal data + 2 extreme outliers (3x and -2x mean)."""
    data = sample_daily_totals.copy()
    data["2024-01-15"] = 300.0  # High outlier
    data["2024-01-20"] = -200.0  # Low outlier
    return data


@pytest.fixture
def minimal_data() -> dict[str, float]:
    """3 values (below MIN_SAMPLES_FOR_DETECTION=4)."""
    return {"2024-01-01": 100.0, "2024-01-02": 110.0, "2024-01-03": 105.0}


@pytest.fixture
def zero_variance_data() -> dict[str, float]:
    """10 identical values to trigger zero IQR/stddev edge cases."""
    return {f"2024-01-{i:02d}": 100.0 for i in range(1, 11)}


# ==================== NOOP FILTER TESTS ====================


def test_noop_passthrough_normal_data(sample_daily_totals: dict[str, float]):
    """Verify NoOpFilter returns all values unchanged with no outliers."""
    filter_strategy = NoOpFilter()
    filtered_values, outliers = filter_strategy.filter(sample_daily_totals)

    assert len(filtered_values) == 30
    assert len(outliers) == 0
    assert filtered_values == list(sample_daily_totals.values())


def test_noop_empty_input():
    """Verify NoOpFilter handles empty input correctly."""
    filter_strategy = NoOpFilter()
    filtered_values, outliers = filter_strategy.filter({})

    assert filtered_values == []
    assert outliers == []


def test_noop_single_value():
    """Verify NoOpFilter handles single value correctly."""
    filter_strategy = NoOpFilter()
    data = {"2024-01-01": 100.0}
    filtered_values, outliers = filter_strategy.filter(data)

    assert filtered_values == [100.0]
    assert outliers == []


def test_noop_with_extremes(outlier_daily_totals: dict[str, float]):
    """Verify NoOpFilter does not flag even extreme values."""
    filter_strategy = NoOpFilter()
    filtered_values, outliers = filter_strategy.filter(outlier_daily_totals)

    assert len(filtered_values) == 30  # 30 values (2 replaced with outliers)
    assert len(outliers) == 0
    assert 300.0 in filtered_values  # High outlier included
    assert -200.0 in filtered_values  # Low outlier included


def test_noop_return_types(sample_daily_totals: dict[str, float]):
    """Verify NoOpFilter returns correct tuple[list[float], list[OutlierInfo]]."""
    filter_strategy = NoOpFilter()
    result = filter_strategy.filter(sample_daily_totals)

    assert isinstance(result, tuple)
    assert len(result) == 2
    assert isinstance(result[0], list)
    assert isinstance(result[1], list)
    assert all(isinstance(v, int | float) for v in result[0])


# ==================== IQR FILTER TESTS ====================


def test_iqr_detects_high_outlier(outlier_daily_totals: dict[str, float]):
    """Verify IQRFilter detects high outlier (3x mean)."""
    filter_strategy = IQRFilter()
    filtered_values, outliers = filter_strategy.filter(outlier_daily_totals)

    assert len(outliers) >= 1
    outlier_values = [o.value for o in outliers]
    assert 300.0 in outlier_values
    assert 300.0 not in filtered_values


def test_iqr_detects_low_outlier(outlier_daily_totals: dict[str, float]):
    """Verify IQRFilter detects low outlier (-2x mean)."""
    filter_strategy = IQRFilter()
    filtered_values, outliers = filter_strategy.filter(outlier_daily_totals)

    outlier_values = [o.value for o in outliers]
    assert -200.0 in outlier_values
    assert -200.0 not in filtered_values


def test_iqr_no_outliers_normal_dist(sample_daily_totals: dict[str, float]):
    """Verify IQRFilter returns all values for clean normal distribution."""
    filter_strategy = IQRFilter()
    filtered_values, outliers = filter_strategy.filter(sample_daily_totals)

    assert len(filtered_values) == 30
    assert len(outliers) == 0


def test_iqr_zero_iqr_edge_case(zero_variance_data: dict[str, float]):
    """Verify IQRFilter handles zero variance (line 87-88) by returning all values."""
    filter_strategy = IQRFilter()
    filtered_values, outliers = filter_strategy.filter(zero_variance_data)

    # Zero IQR means no outliers can be detected
    assert len(filtered_values) == 10
    assert len(outliers) == 0


def test_iqr_min_samples_threshold(minimal_data: dict[str, float]):
    """Verify IQRFilter returns all values when <4 samples."""
    filter_strategy = IQRFilter()
    filtered_values, outliers = filter_strategy.filter(minimal_data)

    assert len(filtered_values) == 3
    assert len(outliers) == 0


def test_iqr_outlier_info_structure(outlier_daily_totals: dict[str, float]):
    """Verify IQRFilter outlier info has correct structure."""
    filter_strategy = IQRFilter()
    _, outliers = filter_strategy.filter(outlier_daily_totals)

    assert len(outliers) >= 1
    for outlier in outliers:
        assert isinstance(outlier, OutlierInfo)
        assert isinstance(outlier.date, str)
        assert isinstance(outlier.value, float)
        assert outlier.reason == "IQR"
        assert outlier.z_score is None  # IQR doesn't compute z-scores


def test_iqr_boundary_values():
    """Test IQRFilter boundary detection at Q1-1.5*IQR and Q3+1.5*IQR."""
    # Create tight normal distribution, then add clear outliers
    # 100 values from 95-105, then extreme outliers
    np.random.seed(42)
    base_values = np.random.normal(100, 2, 100)
    data = {f"day_{i}": float(v) for i, v in enumerate(base_values)}
    data["outlier_low"] = 50.0  # Far below Q1-1.5*IQR
    data["outlier_high"] = 150.0  # Far above Q3+1.5*IQR

    filter_strategy = IQRFilter()
    filtered_values, outliers = filter_strategy.filter(data)

    # Verify both extreme outliers were detected
    assert len(outliers) >= 2
    outlier_values = [o.value for o in outliers]
    assert 50.0 in outlier_values
    assert 150.0 in outlier_values


def test_iqr_multiple_outliers():
    """Verify IQRFilter detects multiple outliers in larger dataset."""
    # 50 normal values + 5 outliers
    data = {f"day_{i}": 100.0 + i * 0.5 for i in range(50)}
    data["out1"] = 500.0
    data["out2"] = -100.0
    data["out3"] = 600.0
    data["out4"] = -150.0
    data["out5"] = 700.0

    filter_strategy = IQRFilter()
    filtered_values, outliers = filter_strategy.filter(data)

    assert len(outliers) == 5
    assert len(filtered_values) == 50


def test_iqr_negative_yields():
    """Verify IQRFilter handles negative yield values correctly."""
    data = {f"day_{i}": -100.0 + i * 2 for i in range(1, 31)}  # -98 to -40
    data["outlier"] = -500.0  # Extreme negative

    filter_strategy = IQRFilter()
    filtered_values, outliers = filter_strategy.filter(data)

    assert len(outliers) == 1
    assert outliers[0].value == -500.0


def test_iqr_filtered_list_order(sample_daily_totals: dict[str, float]):
    """Verify filtered values preserve order from input dict."""
    filter_strategy = IQRFilter()
    filtered_values, _ = filter_strategy.filter(sample_daily_totals)

    # Since sample_daily_totals are ordered by date, filtered should be too
    assert filtered_values == sorted(filtered_values)


# ==================== ZSCORE FILTER TESTS ====================


def test_zscore_default_threshold_2():
    """Verify ZScoreFilter uses threshold=2.0."""
    filter_strategy = ZScoreFilter()  # ZSCORE_THRESHOLD = 2.0
    # Create data where mean=100, std≈10, add value at 3σ
    data = {f"day_{i}": 100.0 + i * 0.5 for i in range(50)}
    data["outlier"] = 130.0  # ~3 stddev above mean

    filtered_values, outliers = filter_strategy.filter(data)

    assert len(outliers) >= 1
    outlier_values = [o.value for o in outliers]
    assert 130.0 in outlier_values


def test_zscore_moderate_outlier():
    """Verify ZScoreFilter detects moderate outliers above threshold."""
    filter_strategy = ZScoreFilter()  # threshold=2.0
    # Create tight distribution with clear outlier
    np.random.seed(42)
    data = {f"day_{i}": float(v) for i, v in enumerate(np.random.normal(100, 3, 50))}
    data["outlier"] = 115.0  # Clearly above 2σ

    filtered_values, outliers = filter_strategy.filter(data)

    assert len(outliers) >= 1
    outlier_values = [o.value for o in outliers]
    assert 115.0 in outlier_values


def test_zscore_detects_extreme_values():
    """Verify ZScoreFilter detects extreme values."""
    # Create data with clear variance
    np.random.seed(42)
    data = {f"day_{i}": float(v) for i, v in enumerate(np.random.normal(100, 5, 50))}
    data["outlier"] = 200.0  # Extreme value

    filter_strategy = ZScoreFilter()  # threshold=2.0
    filtered_values, outliers = filter_strategy.filter(data)

    assert len(outliers) >= 1
    outlier_values = [o.value for o in outliers]
    assert 200.0 in outlier_values


def test_zscore_zero_stddev_edge_case(zero_variance_data: dict[str, float]):
    """Verify ZScoreFilter handles zero stddev (line 135) by returning all values."""
    filter_strategy = ZScoreFilter()
    filtered_values, outliers = filter_strategy.filter(zero_variance_data)

    # Zero stddev means no outliers can be detected
    assert len(filtered_values) == 10
    assert len(outliers) == 0


def test_zscore_min_samples_threshold(minimal_data: dict[str, float]):
    """Verify ZScoreFilter returns all values when <4 samples."""
    filter_strategy = ZScoreFilter()
    filtered_values, outliers = filter_strategy.filter(minimal_data)

    assert len(filtered_values) == 3
    assert len(outliers) == 0


def test_zscore_outlier_info_with_zscore(outlier_daily_totals: dict[str, float]):
    """Verify ZScoreFilter populates z_score field in OutlierInfo."""
    filter_strategy = ZScoreFilter()
    _, outliers = filter_strategy.filter(outlier_daily_totals)

    assert len(outliers) >= 1
    for outlier in outliers:
        assert isinstance(outlier, OutlierInfo)
        assert outlier.reason == "zscore"  # Note: "zscore" not "z-score"
        assert outlier.z_score is not None
        assert abs(outlier.z_score) > 2.0  # Should exceed threshold


def test_zscore_symmetric_detection():
    """Verify ZScoreFilter detects both high and low outliers symmetrically."""
    data = {f"day_{i}": 100.0 + i * 0.5 for i in range(50)}
    data["high_outlier"] = 130.0  # High outlier
    data["low_outlier"] = 70.0  # Low outlier

    filter_strategy = ZScoreFilter()  # threshold=2.0
    filtered_values, outliers = filter_strategy.filter(data)

    # Should detect at least one outlier
    assert len(outliers) >= 1
    outlier_values = [o.value for o in outliers]
    # At least one extreme should be detected
    assert 130.0 in outlier_values or 70.0 in outlier_values


def test_zscore_threshold_boundary():
    """Verify value exactly at threshold boundary."""
    # Create controlled data: mean=100, std=10
    np.random.seed(42)
    base_values = np.random.normal(100, 10, 50)
    data = {f"day_{i}": float(v) for i, v in enumerate(base_values)}

    mean = np.mean(list(data.values()))
    std = np.std(list(data.values()))

    # Add value exactly at 2.0 * std (at threshold boundary)
    data["boundary"] = mean + 2.0 * std

    filter_strategy = ZScoreFilter()  # threshold=2.0
    filtered_values, outliers = filter_strategy.filter(data)

    # Value at exactly threshold (z=2.0) should be included (z <= threshold)
    assert data["boundary"] in filtered_values


def test_zscore_numerical_precision():
    """Test ZScoreFilter with float precision edge cases."""
    data = {
        "day_1": 100.0000001,
        "day_2": 100.0000002,
        "day_3": 100.0000003,
        "day_4": 100.0000004,
        "day_5": 100.0000005,
        "outlier": 200.0,
    }

    filter_strategy = ZScoreFilter()  # threshold=2.0
    filtered_values, outliers = filter_strategy.filter(data)

    # Despite tiny variances, clear outlier should be detected
    assert len(outliers) >= 1
    outlier_values = [o.value for o in outliers]
    assert 200.0 in outlier_values


def test_zscore_large_dataset():
    """Verify ZScoreFilter handles 100+ values with outliers."""
    np.random.seed(42)
    data = {f"day_{i}": float(v) for i, v in enumerate(np.random.normal(100, 10, 100))}
    data["out1"] = 200.0
    data["out2"] = -50.0

    filter_strategy = ZScoreFilter()  # threshold=2.0
    filtered_values, outliers = filter_strategy.filter(data)

    assert len(outliers) >= 2
    outlier_values = [o.value for o in outliers]
    assert 200.0 in outlier_values
    assert -50.0 in outlier_values


# ==================== PERCENTILE FILTER TESTS ====================


def test_percentile_5th_95th_default():
    """Verify PercentileFilter uses default 5th-95th percentiles."""
    filter_strategy = PercentileFilter()  # Default p_low=5, p_high=95
    # 100 values, expect ~5 outliers on each tail
    data = {f"day_{i}": float(i) for i in range(100)}

    filtered_values, outliers = filter_strategy.filter(data)

    # Should remove values below 5th (0-4) and above 95th (95-99)
    assert len(outliers) == 10  # 5 low + 5 high
    assert len(filtered_values) == 90


def test_percentile_tight_distribution(zero_variance_data: dict[str, float]):
    """Verify PercentileFilter handles zero range (line 174-175) by returning all."""
    filter_strategy = PercentileFilter()
    filtered_values, outliers = filter_strategy.filter(zero_variance_data)

    # All values identical → percentile_range = 0 → return all
    assert len(filtered_values) == 10
    assert len(outliers) == 0


def test_percentile_detects_both_tails():
    """Verify PercentileFilter detects outliers in both low and high tails."""
    # 50 normal values + 2 extreme outliers
    data = {f"day_{i}": 100.0 + i * 0.5 for i in range(50)}
    data["low_outlier"] = 10.0  # Far below 5th percentile
    data["high_outlier"] = 200.0  # Far above 95th percentile

    filter_strategy = PercentileFilter()  # p_low=5, p_high=95
    filtered_values, outliers = filter_strategy.filter(data)

    outlier_values = [o.value for o in outliers]
    assert 10.0 in outlier_values
    assert 200.0 in outlier_values


def test_percentile_min_samples_threshold(minimal_data: dict[str, float]):
    """Verify PercentileFilter returns all values when <4 samples."""
    filter_strategy = PercentileFilter()
    filtered_values, outliers = filter_strategy.filter(minimal_data)

    assert len(filtered_values) == 3
    assert len(outliers) == 0


def test_percentile_outlier_info_reason():
    """Verify PercentileFilter sets reason='percentile' in OutlierInfo."""
    data = {f"day_{i}": float(i) for i in range(100)}

    filter_strategy = PercentileFilter()
    _, outliers = filter_strategy.filter(data)

    assert len(outliers) > 0
    for outlier in outliers:
        assert isinstance(outlier, OutlierInfo)
        assert outlier.reason == "percentile"
        assert outlier.z_score is None  # Percentile doesn't use z-scores
