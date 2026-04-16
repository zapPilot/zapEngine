"""Supplemental tests for Portfolio models coverage."""

import pytest
from pydantic import ValidationError

from src.models.portfolio import PortfolioResponse

# Sample valid data
VALID_ALLOCATION = {
    "total_value": 100.0,
    "percentage_of_portfolio": 25.0,
    "wallet_tokens_value": 50.0,
    "other_sources_value": 50.0,
}

VALID_PORTFOLIO_ALLOCATION = {
    "btc": VALID_ALLOCATION,
    "eth": VALID_ALLOCATION,
    "stablecoins": VALID_ALLOCATION,
    "others": VALID_ALLOCATION,
}

VALID_PORTFOLIO_DATA = {
    "total_assets_usd": 400.0,
    "total_debt_usd": 0.0,
    "total_net_usd": 400.0,
    "wallet_count": 1,
    "last_updated": "2023-01-01T12:00:00Z",
    "portfolio_allocation": VALID_PORTFOLIO_ALLOCATION,
    "wallet_token_summary": {"total_value_usd": 100.0, "token_count": 1},
    "portfolio_roi": {
        "recommended_roi": 10.0,
        "recommended_period": "roi_30d",
        "windows": {
            "roi_30d": {"value": 10.0, "data_points": 1, "start_balance": 90.0}
        },
    },
    "category_summary_debt": {"btc": 0, "eth": 0, "stablecoins": 0, "others": 0},
    "positions": 0,
    "protocols": 0,
    "chains": 0,
    "borrowing_summary": {"has_debt": False},
}


def test_net_portfolio_value_mismatch():
    """Test ValueError raised when net_portfolio_value mismatches total_net_usd."""
    data = VALID_PORTFOLIO_DATA.copy()
    data["net_portfolio_value"] = 300.0  # Mismatch (should be 400.0)

    with pytest.raises(ValidationError, match="net_portfolio_value .* does not match"):
        PortfolioResponse(**data)
