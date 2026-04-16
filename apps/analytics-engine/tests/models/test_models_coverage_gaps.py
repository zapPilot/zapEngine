from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from src.core.utils import normalize_date, parse_iso_datetime
from src.models.yield_returns import DailyYieldReturn, PeriodInfo


class TestModelsCoverageGaps:
    def test_parse_iso_datetime_with_datetime(self):
        """Test parse_iso_datetime returns the object if already datetime."""
        dt = datetime(2025, 1, 1, 12, 0, 0, tzinfo=UTC)
        assert parse_iso_datetime(dt) == dt

    def test_period_info_null_dates(self):
        """Test PeriodInfo validation with None dates."""
        # This triggers the 'validate_iso8601_dates' validator with None
        # Pydantic calls field validators before checking for 'required' if mode='before'
        with pytest.raises(ValidationError) as exc:
            PeriodInfo(start_date=None, end_date=None, days=1)  # type: ignore

        errors = str(exc.value)
        assert "start_date is required" in errors or "end_date is required" in errors

    def test_daily_yield_return_null_date(self):
        """Test DailyYieldReturn validation with None date."""
        with pytest.raises(ValidationError) as exc:
            DailyYieldReturn(
                date=None,  # type: ignore
                protocol_name="Aave",
                chain="Ethereum",
                yield_return_usd=100.0,
                tokens=[],
            )
        assert "date is required" in str(exc.value)

    def test_normalize_date_coverage(self):
        """Extra coverage for normalize_date if needed."""
        dt = datetime(2025, 1, 1, 12, 0, 0, tzinfo=UTC)
        assert normalize_date(dt) == dt.date()
        assert normalize_date(dt.date()) == dt.date()
        assert normalize_date("2025-01-01") == dt.date()

        with pytest.raises(ValueError):
            normalize_date(None)

        assert normalize_date(None, nullable=True) is None

    def test_analytics_response_model_dict_access(self):
        """Test dict-like access for AnalyticsResponseModel."""
        from src.models.analytics_responses import (
            AnalyticsResponseModel,
            MaxDrawdownResponse,
            PeriodInfo,
        )

        class TestModel(AnalyticsResponseModel):
            foo: str = "bar"

        model = TestModel()

        # Test .get()
        assert model.get("foo") == "bar"
        assert model.get("missing", "default") == "default"

        # Test __contains__ with non-string
        assert 1 not in model
        assert "foo" in model

        # Test MaxDrawdownResponse.max_drawdown_date with None (line 172)
        mdd = MaxDrawdownResponse(
            user_id="u1",
            period_days=30,
            data_points=10,
            max_drawdown_pct=-10.0,
            peak_value=100,
            trough_value=90,
            peak_date=datetime(2025, 1, 1, tzinfo=UTC),
            trough_date=None,  # This triggers line 172
            drawdown_duration_days=5,
            period_info=PeriodInfo(
                start_date=datetime(2025, 1, 1, tzinfo=UTC),
                end_date=datetime(2025, 1, 30, tzinfo=UTC),
                days=30,
            ),
        )
        assert mdd.max_drawdown_date is None

    def test_rolling_sharpe_allocation_data(self):
        """Test RollingSharpeAnalysisResponse.allocation_data (line 399)."""
        from src.models.analytics_responses import (
            PeriodInfo,
            RollingSharpeAnalysisResponse,
            RollingSharpeDataPoint,
        )

        resp = RollingSharpeAnalysisResponse(
            user_id="u1",
            period_days=30,
            data_points=1,
            rolling_sharpe=[
                RollingSharpeDataPoint(
                    date=datetime(2025, 1, 1, tzinfo=UTC),
                    sharpe_ratio=2.0,
                    interpretation="Good",
                    reliable=True,
                )
            ],
            reliability_assessment="Good",
            period_info=PeriodInfo(
                start_date=datetime(2025, 1, 1, tzinfo=UTC),
                end_date=datetime(2025, 1, 30, tzinfo=UTC),
                days=30,
            ),
        )
        data = resp.allocation_data
        assert len(data) == 1
        assert data[0]["sharpe_ratio"] == 2.0
