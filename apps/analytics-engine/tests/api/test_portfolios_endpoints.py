"""
Unit tests for Portfolio API endpoints.

Tests portfolio analytics endpoints including trend analysis.
"""

from datetime import date

import pytest
from httpx import AsyncClient

from src.services.analytics.trend_analysis_service import TrendAnalysisService
from src.services.portfolio.canonical_snapshot_service import CanonicalSnapshotService


def _period_dict(start: str, end: str, days: int) -> dict[str, str | int]:
    """Helper to build period payloads reused across tests."""
    return {"start_date": start, "end_date": end, "days": days}


class TestTrendsByUserEndpoint:
    """Tests for the /trends/by-user/{user_id} endpoint."""

    @pytest.mark.asyncio
    async def test_trends_by_user_successful_response(
        self, client: AsyncClient, mocker
    ):
        """Verify successful response from trends by user endpoint."""
        period = _period_dict(
            start="2023-01-01T00:00:00", end="2023-01-31T00:00:00", days=30
        )
        mock_response = {
            "user_id": "123e4567-e89b-12d3-a456-426614174000",
            "period": period,
            "period_info": period,
            "period_days": 30,
            "data_points": 1,
            "daily_values": [
                {
                    "date": "2023-01-01T00:00:00",
                    "total_value_usd": 10000.0,
                    "change_percentage": 0.0,
                    "protocols": ["compound", "aave"],
                    "by_protocol": {"compound": 6000.0, "aave": 4000.0},
                    "by_chain": {"ethereum": 10000.0},
                    "categories": [],
                }
            ],
            "summary": {
                "data_points": 1,
                "latest_value": 10000.0,
                "change_usd": 0.0,
                "change_percentage": 0.0,
            },
        }

        mock_service = mocker.patch.object(
            TrendAnalysisService,
            "get_portfolio_trend",
            return_value=mock_response,
        )
        mocker.patch.object(
            CanonicalSnapshotService,
            "get_snapshot_date",
            return_value=date(2023, 1, 1),
        )

        response = await client.get(
            "/api/v2/analytics/123e4567-e89b-12d3-a456-426614174000/trend",
            params={"days": 30, "limit": 100},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["user_id"] == "123e4567-e89b-12d3-a456-426614174000"
        assert "trend_data" not in data
        assert "summary" in data
        mock_service.assert_called_once()

    @pytest.mark.asyncio
    async def test_trends_by_user_with_custom_limit(self, client: AsyncClient, mocker):
        """Verify endpoint handles custom limit parameter."""
        period = _period_dict(
            start="2023-01-01T00:00:00", end="2023-01-31T00:00:00", days=30
        )
        mock_response = {
            "user_id": "123e4567-e89b-12d3-a456-426614174000",
            "period": period,
            "period_info": period,
            "period_days": 30,
            "data_points": 0,
            "daily_values": [],
            "summary": {
                "data_points": 0,
                "latest_value": 0.0,
                "change_usd": 0.0,
                "change_percentage": 0.0,
            },
        }

        mocker.patch.object(
            TrendAnalysisService,
            "get_portfolio_trend",
            return_value=mock_response,
        )
        mocker.patch.object(
            CanonicalSnapshotService,
            "get_snapshot_date",
            return_value=date(2023, 1, 1),
        )

        response = await client.get(
            "/api/v2/analytics/123e4567-e89b-12d3-a456-426614174000/trend",
            params={"days": 30, "limit": 50},
        )

        assert response.status_code == 200
