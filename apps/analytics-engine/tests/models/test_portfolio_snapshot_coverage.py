"""Supplemental tests for PortfolioSnapshot coverage."""

from datetime import date

from src.models.portfolio_snapshot import (
    CategoryTotals,
    PortfolioSnapshot,
    WalletTrendOverride,
)


def test_category_totals_total():
    """Test CategoryTotals.total() sums all fields."""
    totals = CategoryTotals(btc=1.0, eth=2.0, stablecoins=3.0, others=4.0)
    assert totals.total() == 10.0


def test_wallet_trend_override_ensure_categories():
    """Test WalletTrendOverride.ensure_categories() returns all categories."""
    override = WalletTrendOverride(categories={"btc": 100.0, "unknown": 50.0})
    ensured = override.ensure_categories()

    assert "btc" in ensured
    assert ensured["btc"] == 100.0
    assert "eth" in ensured
    assert ensured["eth"] == 0.0
    # others, stablecoins should be present
    assert "stablecoins" in ensured
    assert "others" in ensured

    # "unknown" should be ignored? Logic says: for category in CATEGORIES: self.categories.get(category, 0.0)
    assert "unknown" not in ensured


def test_portfolio_snapshot_has_data():
    """Test PortfolioSnapshot.has_data property."""
    snapshot_empty = PortfolioSnapshot(
        user_id="u1", snapshot_date=date(2023, 1, 1), total_assets=0.0, total_debt=0.0
    )
    assert not snapshot_empty.has_data

    snapshot_assets = PortfolioSnapshot(
        user_id="u1", snapshot_date=date(2023, 1, 1), total_assets=100.0, total_debt=0.0
    )
    assert snapshot_assets.has_data

    snapshot_debt = PortfolioSnapshot(
        user_id="u1", snapshot_date=date(2023, 1, 1), total_assets=0.0, total_debt=50.0
    )
    assert snapshot_debt.has_data
