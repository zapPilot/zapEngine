"""Tests for regime tracking models and helper functions."""

from __future__ import annotations

from datetime import UTC

import pytest

from src.models.regime_tracking import (
    DirectionType,
    DurationInfo,
    RegimeId,
    RegimeTransition,
    format_duration_human_readable,
)


class TestRegimeIdEnum:
    """Tests for RegimeId enum properties."""

    def test_regime_id_str_representation(self):
        """RegimeId __str__ returns the enum value."""
        assert str(RegimeId.ef) == "ef"
        assert str(RegimeId.f) == "f"
        assert str(RegimeId.n) == "n"
        assert str(RegimeId.g) == "g"
        assert str(RegimeId.eg) == "eg"

    def test_regime_id_label_property(self):
        """RegimeId.label returns human-readable label."""
        assert RegimeId.ef.label == "Extreme Fear"
        assert RegimeId.f.label == "Fear"
        assert RegimeId.n.label == "Neutral"
        assert RegimeId.g.label == "Greed"
        assert RegimeId.eg.label == "Extreme Greed"

    def test_regime_id_sentiment_range_property(self):
        """RegimeId.sentiment_range returns (min, max) tuple."""
        assert RegimeId.ef.sentiment_range == (0, 25)
        assert RegimeId.f.sentiment_range == (26, 45)
        assert RegimeId.n.sentiment_range == (46, 54)
        assert RegimeId.g.sentiment_range == (55, 75)
        assert RegimeId.eg.sentiment_range == (76, 100)

    def test_all_regimes_have_valid_ranges(self):
        """All regime sentiment ranges are valid and non-overlapping."""
        ranges = [regime.sentiment_range for regime in RegimeId]
        for i, (min_val, max_val) in enumerate(ranges):
            assert min_val <= max_val
            if i > 0:
                _, prev_max = ranges[i - 1]
                assert min_val == prev_max + 1, "Ranges should be contiguous"


class TestDirectionType:
    """Tests for DirectionType enum."""

    def test_direction_type_str_representation(self):
        """DirectionType __str__ returns the enum value."""
        assert str(DirectionType.fromLeft) == "fromLeft"
        assert str(DirectionType.fromRight) == "fromRight"
        assert str(DirectionType.default) == "default"


class TestFormatDurationHumanReadable:
    """Tests for format_duration_human_readable helper function."""

    def test_less_than_one_hour_returns_minutes(self):
        """Duration < 1 hour returns minutes."""
        assert format_duration_human_readable(0.5) == "30 minutes"
        assert format_duration_human_readable(0.25) == "15 minutes"
        assert format_duration_human_readable(0.0167) == "1 minute"

    def test_singular_minute(self):
        """One minute uses singular form."""
        result = format_duration_human_readable(1 / 60)  # ~1 minute
        assert result == "1 minute"

    def test_hours_only(self):
        """Duration in whole hours only."""
        assert format_duration_human_readable(2) == "2 hours"
        assert format_duration_human_readable(5) == "5 hours"

    def test_singular_hour(self):
        """One hour uses singular form."""
        assert format_duration_human_readable(1) == "1 hour"

    def test_hours_and_minutes(self):
        """Duration with hours and minutes."""
        assert format_duration_human_readable(2.5) == "2 hours"  # Rounds down

    def test_days_only(self):
        """Duration in whole days only."""
        assert format_duration_human_readable(48) == "2 days"
        assert format_duration_human_readable(72) == "3 days"

    def test_singular_day(self):
        """One day uses singular form."""
        assert format_duration_human_readable(24) == "1 day"

    def test_days_and_hours(self):
        """Duration with days and hours."""
        assert format_duration_human_readable(25) == "1 day, 1 hour"
        assert format_duration_human_readable(50.5) == "2 days, 2 hours"

    def test_large_duration(self):
        """Large duration is formatted correctly."""
        # 7 days + 12 hours = 180 hours
        assert format_duration_human_readable(180) == "7 days, 12 hours"


class TestDurationInfoModel:
    """Tests for DurationInfo Pydantic model."""

    def test_valid_duration_info(self):
        """Valid DurationInfo is created successfully."""
        info = DurationInfo(
            hours=51.5,
            days=2.1,
            human_readable="2 days, 3 hours",
        )
        assert info.hours == 51.5
        assert info.days == 2.1
        assert info.human_readable == "2 days, 3 hours"

    def test_duration_info_rejects_negative_hours(self):
        """DurationInfo rejects negative hours."""
        with pytest.raises(ValueError):
            DurationInfo(
                hours=-1.0,
                days=0.0,
                human_readable="Invalid",
            )

    def test_duration_info_rejects_negative_days(self):
        """DurationInfo rejects negative days."""
        with pytest.raises(ValueError):
            DurationInfo(
                hours=0.0,
                days=-1.0,
                human_readable="Invalid",
            )


class TestRegimeTransition:
    """Tests for RegimeTransition Pydantic model."""

    def test_valid_regime_transition(self):
        """Valid RegimeTransition is created successfully."""
        from datetime import datetime

        transition = RegimeTransition(
            id="550e8400-e29b-41d4-a716-446655440000",
            from_regime=RegimeId.f,
            to_regime=RegimeId.n,
            sentiment_value=48,
            transitioned_at=datetime(2025, 1, 17, 10, 30, tzinfo=UTC),
            duration_hours=50.5,
        )
        assert transition.from_regime == RegimeId.f
        assert transition.to_regime == RegimeId.n
        assert transition.sentiment_value == 48

    def test_regime_transition_with_null_from_regime(self):
        """First transition can have null from_regime."""
        from datetime import datetime

        transition = RegimeTransition(
            id="550e8400-e29b-41d4-a716-446655440000",
            from_regime=None,
            to_regime=RegimeId.ef,
            sentiment_value=15,
            transitioned_at=datetime(2025, 1, 1, 0, 0, tzinfo=UTC),
        )
        assert transition.from_regime is None

    def test_regime_transition_sentiment_bounds(self):
        """Sentiment value must be 0-100."""
        from datetime import datetime

        with pytest.raises(ValueError):
            RegimeTransition(
                id="550e8400-e29b-41d4-a716-446655440000",
                to_regime=RegimeId.n,
                sentiment_value=150,  # Invalid
                transitioned_at=datetime(2025, 1, 1, tzinfo=UTC),
            )

        with pytest.raises(ValueError):
            RegimeTransition(
                id="550e8400-e29b-41d4-a716-446655440000",
                to_regime=RegimeId.n,
                sentiment_value=-10,  # Invalid
                transitioned_at=datetime(2025, 1, 1, tzinfo=UTC),
            )
