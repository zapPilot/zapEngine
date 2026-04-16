from types import SimpleNamespace

from .mock_composed_family import (
    MOCK_COMPOSED_STRATEGY_ID,
    build_mock_composed_catalog,
    build_mock_saved_config,
)
from .mock_recipe import make_mock_recipe, register_mock_recipe
from .scenarios import (
    compare_request,
    price_row,
    price_series,
    sentiment_map,
)
from .snapshots import make_strategy_snapshot


def mock_portfolio(
    *,
    btc: float = 0.0,
    eth: float = 0.0,
    stable: float = 0.0,
    others: float = 0.0,
    debt: float = 0.0,
) -> object:
    """Build a mock portfolio object for daily suggestion and parity tests."""
    total_assets = btc + eth + stable + others
    return SimpleNamespace(
        total_assets_usd=total_assets,
        total_debt_usd=debt,
        total_net_usd=total_assets - debt,
        portfolio_allocation=SimpleNamespace(
            btc=None if btc == 0 else SimpleNamespace(total_value=btc),
            eth=None if eth == 0 else SimpleNamespace(total_value=eth),
            stablecoins=None if stable == 0 else SimpleNamespace(total_value=stable),
            others=None if others == 0 else SimpleNamespace(total_value=others),
        ),
    )


__all__ = [
    "compare_request",
    "build_mock_composed_catalog",
    "build_mock_saved_config",
    "make_mock_recipe",
    "make_strategy_snapshot",
    "mock_portfolio",
    "MOCK_COMPOSED_STRATEGY_ID",
    "price_row",
    "price_series",
    "register_mock_recipe",
    "sentiment_map",
]
