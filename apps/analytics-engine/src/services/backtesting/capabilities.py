"""Capability helpers shared across recipe-driven backtesting services."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Literal

from src.services.backtesting.execution.portfolio import Portfolio
from src.services.backtesting.utils.two_bucket import calculate_runtime_allocation

RuntimePortfolioMode = Literal["aggregate", "asset"]


@dataclass(frozen=True)
class PortfolioBuckets:
    """Normalized two-bucket portfolio view used by backtesting services."""

    spot_value: float
    stable_value: float
    btc_value: float | None = None
    eth_value: float | None = None
    stable_category_value: float | None = None
    alt_value: float | None = None

    @property
    def total_value(self) -> float:
        return self.spot_value + self.stable_value

    def allocation(self) -> dict[str, float]:
        return calculate_runtime_allocation(
            spot_value=self.spot_value,
            stable_value=self.stable_value,
        )

    def asset_allocation(self) -> dict[str, float] | None:
        if (
            self.btc_value is None
            and self.eth_value is None
            and self.stable_category_value is None
            and self.alt_value is None
        ):
            return None
        btc_value = max(0.0, float(0.0 if self.btc_value is None else self.btc_value))
        eth_value = max(0.0, float(0.0 if self.eth_value is None else self.eth_value))
        stable_value = max(
            0.0,
            float(
                self.stable_value
                if self.stable_category_value is None
                else self.stable_category_value
            ),
        )
        alt_value = max(0.0, float(0.0 if self.alt_value is None else self.alt_value))
        total = btc_value + eth_value + stable_value + alt_value
        if total <= 0.0:
            return {"btc": 0.0, "eth": 0.0, "stable": 1.0, "alt": 0.0}
        return {
            "btc": btc_value / total,
            "eth": eth_value / total,
            "stable": stable_value / total,
            "alt": alt_value / total,
        }

    def to_portfolio(
        self,
        current_price: float,
        price_map: dict[str, float] | None = None,
        spot_asset: str = "BTC",
        runtime_mode: RuntimePortfolioMode = "asset",
    ) -> Portfolio:
        if runtime_mode == "aggregate" or (
            self.btc_value is None and self.eth_value is None
        ):
            return Portfolio(
                spot_balance=(self.spot_value / current_price)
                if current_price > 0
                else 0.0,
                stable_balance=self.stable_value,
                spot_asset=spot_asset,
            )
        if runtime_mode != "asset":
            raise ValueError(f"Unsupported runtime portfolio mode '{runtime_mode}'")
        resolved_prices = (
            {"btc": current_price, "eth": current_price}
            if price_map is None
            else dict(price_map)
        )
        return Portfolio.from_asset_values(
            btc_value=float(0.0 if self.btc_value is None else self.btc_value),
            eth_value=float(0.0 if self.eth_value is None else self.eth_value),
            stable_value=float(self.stable_value),
            price=resolved_prices,
            spot_asset=spot_asset,
        )


PortfolioBucketMapper = Callable[[Any], PortfolioBuckets]


def map_portfolio_to_two_buckets(portfolio: Any) -> PortfolioBuckets:
    """Map landing-page allocation payloads into the runtime two-bucket model."""

    allocation = getattr(portfolio, "portfolio_allocation", None)
    if allocation is None:
        return PortfolioBuckets(spot_value=0.0, stable_value=0.0)
    spot_value = float(
        getattr(getattr(allocation, "btc", None), "total_value", 0.0)
        + getattr(getattr(allocation, "eth", None), "total_value", 0.0)
        + getattr(getattr(allocation, "others", None), "total_value", 0.0)
    )
    stable_value = float(
        getattr(getattr(allocation, "stablecoins", None), "total_value", 0.0)
    )
    return PortfolioBuckets(
        spot_value=spot_value,
        stable_value=stable_value,
        btc_value=float(getattr(getattr(allocation, "btc", None), "total_value", 0.0)),
        eth_value=float(getattr(getattr(allocation, "eth", None), "total_value", 0.0)),
        stable_category_value=stable_value,
        alt_value=float(
            getattr(getattr(allocation, "others", None), "total_value", 0.0)
        ),
    )


def map_portfolio_to_eth_btc_stable_buckets(portfolio: Any) -> PortfolioBuckets:
    """Map landing-page allocation payloads into BTC/ETH/stable runtime buckets."""

    allocation = getattr(portfolio, "portfolio_allocation", None)
    if allocation is None:
        return PortfolioBuckets(
            spot_value=0.0,
            stable_value=0.0,
            btc_value=0.0,
            eth_value=0.0,
            stable_category_value=0.0,
            alt_value=0.0,
        )
    btc_value = float(getattr(getattr(allocation, "btc", None), "total_value", 0.0))
    eth_value = float(getattr(getattr(allocation, "eth", None), "total_value", 0.0))
    stable_category_value = float(
        getattr(getattr(allocation, "stablecoins", None), "total_value", 0.0)
    )
    alt_value = float(getattr(getattr(allocation, "others", None), "total_value", 0.0))
    stable_value = stable_category_value + alt_value
    return PortfolioBuckets(
        spot_value=btc_value + eth_value,
        stable_value=stable_value,
        btc_value=btc_value,
        eth_value=eth_value,
        stable_category_value=stable_category_value,
        alt_value=alt_value,
    )


__all__ = [
    "PortfolioBucketMapper",
    "PortfolioBuckets",
    "RuntimePortfolioMode",
    "map_portfolio_to_eth_btc_stable_buckets",
    "map_portfolio_to_two_buckets",
]
