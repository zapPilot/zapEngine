"""Portfolio management for backtesting simulations."""

from __future__ import annotations

from collections.abc import Mapping

from src.services.backtesting.execution.cost_model import (
    CostModel,
    PercentageSlippageModel,
)

_BALANCE_EPSILON = 1e-12
_ASSET_BUCKETS = frozenset({"btc", "eth", "spy"})
_SUPPORTED_BUCKETS = frozenset({"spot", "stable", "btc", "eth", "spy"})


class Portfolio:
    """Tracks BTC, ETH, SPY, and stable balances with legacy spot compatibility."""

    def __init__(
        self,
        spot_balance: float = 0.0,
        stable_balance: float = 0.0,
        spot_asset: str = "BTC",
        cost_model: CostModel | None = None,
        *,
        btc_balance: float | None = None,
        eth_balance: float | None = None,
        spy_balance: float | None = None,
    ) -> None:
        normalized_asset = self._normalize_asset_symbol(spot_asset)
        self.default_spot_asset = normalized_asset
        self.cost_model = cost_model or PercentageSlippageModel()
        if btc_balance is None and eth_balance is None:
            self.btc_balance = float(spot_balance) if normalized_asset == "BTC" else 0.0
            self.eth_balance = float(spot_balance) if normalized_asset == "ETH" else 0.0
        else:
            self.btc_balance = float(0.0 if btc_balance is None else btc_balance)
            self.eth_balance = float(0.0 if eth_balance is None else eth_balance)
        self.spy_balance = float(0.0 if spy_balance is None else spy_balance)
        self.stable_balance = float(stable_balance)
        self._clamp_small_balance_residue()

    @classmethod
    def from_allocation(
        cls,
        total_capital: float,
        allocation: dict[str, float],
        price: float | Mapping[str, float],
        spot_asset: str = "BTC",
        cost_model: CostModel | None = None,
    ) -> Portfolio:
        normalized_asset = cls._normalize_asset_symbol(spot_asset)
        spot_price = cls._resolve_price_for_asset(price, normalized_asset)
        spot_value = total_capital * float(allocation.get("spot", 0.0))
        stable_value = total_capital * float(allocation.get("stable", 0.0))
        return cls(
            spot_balance=(spot_value / spot_price) if spot_price > 0 else 0.0,
            stable_balance=stable_value,
            spot_asset=normalized_asset,
            cost_model=cost_model,
        )

    @classmethod
    def from_asset_allocation(
        cls,
        total_capital: float,
        allocation: dict[str, float],
        price: float | Mapping[str, float],
        spot_asset: str = "BTC",
        cost_model: CostModel | None = None,
    ) -> Portfolio:
        btc = max(0.0, float(allocation.get("btc", 0.0)))
        eth = max(0.0, float(allocation.get("eth", 0.0)))
        spy = max(0.0, float(allocation.get("spy", 0.0)))
        stable = max(0.0, float(allocation.get("stable", 0.0)))
        total = btc + eth + spy + stable
        if total <= 0.0:
            stable = 1.0
            total = 1.0
        normalized = {
            "btc": btc / total,
            "eth": eth / total,
            "spy": spy / total,
            "stable": stable / total,
        }
        return cls.from_asset_values(
            btc_value=total_capital * normalized["btc"],
            eth_value=total_capital * normalized["eth"],
            spy_value=total_capital * normalized["spy"],
            stable_value=total_capital * normalized["stable"],
            price=price,
            spot_asset=spot_asset,
            cost_model=cost_model,
        )

    @classmethod
    def from_asset_values(
        cls,
        *,
        btc_value: float,
        eth_value: float,
        stable_value: float,
        price: float | Mapping[str, float],
        spot_asset: str = "BTC",
        cost_model: CostModel | None = None,
        spy_value: float = 0.0,
    ) -> Portfolio:
        btc_price = (
            1.0 if btc_value <= 0.0 else cls._resolve_price_for_asset(price, "BTC")
        )
        eth_price = (
            1.0 if eth_value <= 0.0 else cls._resolve_price_for_asset(price, "ETH")
        )
        spy_price = (
            1.0 if spy_value <= 0.0 else cls._resolve_price_for_asset(price, "SPY")
        )
        return cls(
            stable_balance=stable_value,
            spot_asset=spot_asset,
            cost_model=cost_model,
            btc_balance=(btc_value / btc_price) if btc_price > 0 else 0.0,
            eth_balance=(eth_value / eth_price) if eth_price > 0 else 0.0,
            spy_balance=(spy_value / spy_price) if spy_price > 0 else 0.0,
        )

    @property
    def spot_asset(self) -> str:
        active_asset = self.active_spot_asset
        return self.default_spot_asset if active_asset is None else active_asset

    @property
    def active_spot_asset(self) -> str | None:
        btc_active = self.btc_balance > _BALANCE_EPSILON
        eth_active = self.eth_balance > _BALANCE_EPSILON
        if btc_active and not eth_active:
            return "BTC"
        if eth_active and not btc_active:
            return "ETH"
        return None

    @property
    def spot_balance(self) -> float:
        active_asset = self.active_spot_asset
        if active_asset == "BTC":
            return self._sanitize_balance(self.btc_balance)
        if active_asset == "ETH":
            return self._sanitize_balance(self.eth_balance)
        return 0.0

    def total_value(self, price: float | Mapping[str, float]) -> float:
        asset_values = self.asset_values(price)
        return (
            asset_values["btc"]
            + asset_values["eth"]
            + asset_values["spy"]
            + asset_values["stable"]
        )

    def bucket_values(self, price: float | Mapping[str, float]) -> dict[str, float]:
        asset_values = self.asset_values(price)
        return {
            "spot": asset_values["btc"] + asset_values["eth"] + asset_values["spy"],
            "stable": asset_values["stable"],
        }

    def asset_values(self, price: float | Mapping[str, float]) -> dict[str, float]:
        btc_balance = self._sanitize_balance(self.btc_balance)
        eth_balance = self._sanitize_balance(self.eth_balance)
        spy_balance = self._sanitize_balance(self.spy_balance)
        return {
            "btc": 0.0
            if btc_balance <= 0.0
            else btc_balance * self._resolve_asset_value_price(price, "BTC"),
            "eth": 0.0
            if eth_balance <= 0.0
            else eth_balance * self._resolve_asset_value_price(price, "ETH"),
            "spy": 0.0
            if spy_balance <= 0.0
            else spy_balance * self._resolve_asset_value_price(price, "SPY"),
            "stable": self._sanitize_balance(self.stable_balance),
        }

    def values_for_allocation_keys(
        self,
        price: float | Mapping[str, float],
        allocation_keys: Mapping[str, float] | list[str] | tuple[str, ...] | set[str],
    ) -> dict[str, float]:
        keys = set(allocation_keys)
        if keys <= {"spot", "stable"}:
            values = self.bucket_values(price)
            return {key: float(values.get(key, 0.0)) for key in keys}
        values = self.asset_values(price)
        if "stable" in keys:
            values["stable"] = float(values["stable"])
        return {key: float(values.get(key, 0.0)) for key in keys}

    def allocation_percentages(
        self, price: float | Mapping[str, float]
    ) -> dict[str, float]:
        bucket_values = self.bucket_values(price)
        total = bucket_values["spot"] + bucket_values["stable"]
        if total <= 0:
            return {"spot": 0.0, "stable": 1.0}
        return {
            "spot": bucket_values["spot"] / total,
            "stable": bucket_values["stable"] / total,
        }

    def asset_allocation_percentages(
        self, price: float | Mapping[str, float]
    ) -> dict[str, float]:
        asset_values = self.asset_values(price)
        total = (
            asset_values["btc"]
            + asset_values["eth"]
            + asset_values["spy"]
            + asset_values["stable"]
        )
        if total <= 0:
            return {"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0, "alt": 0.0}
        return {
            "btc": asset_values["btc"] / total,
            "eth": asset_values["eth"] / total,
            "spy": asset_values["spy"] / total,
            "stable": asset_values["stable"] / total,
            "alt": 0.0,
        }

    def apply_daily_yield(
        self,
        price: float | Mapping[str, float],
        apr_rates: dict[str, float | dict[str, float]],
    ) -> dict[str, float]:
        stable_rate = apr_rates.get("stable", 0.0)
        if isinstance(stable_rate, dict):
            stable_rate = 0.0

        spot_rates = apr_rates.get("spot", 0.0)
        if isinstance(spot_rates, dict):
            fallback_rate = next(iter(spot_rates.values()), 0.0)
            btc_rate = float(spot_rates.get("btc", fallback_rate))
            eth_rate = float(spot_rates.get("eth", fallback_rate))
        else:
            btc_rate = float(spot_rates)
            eth_rate = float(spot_rates)

        btc_price = (
            0.0
            if self.btc_balance <= 0.0
            else self._resolve_asset_value_price(price, "BTC")
        )
        eth_price = (
            0.0
            if self.eth_balance <= 0.0
            else self._resolve_asset_value_price(price, "ETH")
        )
        btc_yield = self.btc_balance * btc_price * (btc_rate / 365.0)
        eth_yield = self.eth_balance * eth_price * (eth_rate / 365.0)
        stable_yield = self.stable_balance * (float(stable_rate) / 365.0)

        if btc_yield > 0 and btc_price > 0:
            self.btc_balance += btc_yield / btc_price
        if eth_yield > 0 and eth_price > 0:
            self.eth_balance += eth_yield / eth_price
        self.stable_balance += stable_yield
        self._clamp_small_balance_residue()

        return {
            "spot_yield": btc_yield + eth_yield,
            "stable_yield": stable_yield,
            "total_yield": btc_yield + eth_yield + stable_yield,
        }

    def execute_transfer(
        self,
        from_bucket: str,
        to_bucket: str,
        amount_usd: float,
        price: float | Mapping[str, float],
    ) -> None:
        if amount_usd <= 0:
            return
        if from_bucket == to_bucket:
            return
        resolved_from = self._resolve_trade_bucket(from_bucket, for_source=True)
        resolved_to = self._resolve_trade_bucket(to_bucket, for_source=False)
        if resolved_from == resolved_to:
            return
        if resolved_from == "stable":
            self._move_stable_to_asset(amount_usd, resolved_to, price)
            return
        if resolved_to == "stable":
            self._move_asset_to_stable(resolved_from, amount_usd, price)
            return
        self._move_asset_to_asset(resolved_from, resolved_to, amount_usd, price)

    def rotate_spot_asset(
        self,
        target_spot_asset: str,
        prices: float | Mapping[str, float],
    ) -> bool:
        target_asset = self._normalize_asset_symbol(target_spot_asset)
        if self.total_risk_value(prices) <= _BALANCE_EPSILON:
            self.default_spot_asset = target_asset
            return False
        moved = False
        for source_asset in ("BTC", "ETH", "SPY"):
            if source_asset == target_asset:
                continue
            source_value = self.asset_values(prices)[source_asset.lower()]
            if source_value <= _BALANCE_EPSILON:
                continue
            self._move_asset_to_asset(
                source_asset.lower(), target_asset.lower(), source_value, prices
            )
            moved = True
        self.default_spot_asset = target_asset
        self._clamp_small_balance_residue()
        return moved

    def snapshot(self) -> dict[str, float]:
        return {
            "btc_balance": float(self._sanitize_balance(self.btc_balance)),
            "eth_balance": float(self._sanitize_balance(self.eth_balance)),
            "spy_balance": float(self._sanitize_balance(self.spy_balance)),
            "stable_balance": float(self._sanitize_balance(self.stable_balance)),
            "spot_balance": float(self.spot_balance),
        }

    def total_risk_value(self, price: float | Mapping[str, float]) -> float:
        asset_values = self.asset_values(price)
        return asset_values["btc"] + asset_values["eth"] + asset_values["spy"]

    def resolve_spot_price(self, price: float | Mapping[str, float]) -> float:
        return self._resolve_price_for_asset(price, self.spot_asset)

    def serializable_spot_asset(self) -> str | None:
        return self.active_spot_asset

    @classmethod
    def _normalize_asset_symbol(cls, asset_symbol: str) -> str:
        normalized = str(asset_symbol).strip().upper()
        if not normalized:
            raise ValueError("spot asset symbol must not be empty")
        if normalized not in {"BTC", "ETH", "SPY"}:
            raise ValueError(f"Unsupported spot asset '{asset_symbol}'")
        return normalized

    @classmethod
    def _resolve_price_for_asset(
        cls,
        prices: float | Mapping[str, float],
        asset_symbol: str,
    ) -> float:
        if isinstance(prices, Mapping):
            key = asset_symbol.lower()
            if key not in prices:
                raise ValueError(f"Missing price for spot asset '{asset_symbol}'")
            raw_price = prices[key]
        else:
            raw_price = prices
        price = float(raw_price)
        if price <= 0:
            raise ValueError(f"price for '{asset_symbol}' must be positive")
        return price

    def _resolve_asset_value_price(
        self,
        prices: float | Mapping[str, float],
        asset_symbol: str,
    ) -> float:
        if not isinstance(prices, Mapping):
            if self.default_spot_asset != asset_symbol and (
                (asset_symbol == "BTC" and self.btc_balance > _BALANCE_EPSILON)
                or (asset_symbol == "ETH" and self.eth_balance > _BALANCE_EPSILON)
                or (asset_symbol == "SPY" and self.spy_balance > _BALANCE_EPSILON)
            ):
                raise ValueError(
                    "price map required for mixed-asset portfolio valuation"
                )
        return self._resolve_price_for_asset(prices, asset_symbol)

    def _resolve_trade_bucket(self, bucket: str, *, for_source: bool) -> str:
        normalized = str(bucket).strip().lower()
        if normalized not in _SUPPORTED_BUCKETS:
            raise ValueError(
                "Only spot<->stable transfers are supported in legacy mode; "
                f"use btc/eth asset buckets when needed, got {bucket}"
            )
        if normalized in {"stable", "btc", "eth"}:
            return normalized
        if not for_source:
            return self.default_spot_asset.lower()
        active_asset = self.active_spot_asset
        if active_asset is None:
            return self.default_spot_asset.lower()
        return active_asset.lower()

    def _move_stable_to_asset(
        self,
        amount_usd: float,
        target_bucket: str,
        prices: float | Mapping[str, float],
    ) -> None:
        target_price = self._resolve_price_for_asset(prices, target_bucket.upper())
        if target_price <= 0:  # pragma: no cover
            raise ValueError("price must be positive")
        amount = min(amount_usd, self.stable_balance)
        net_amount = self._apply_cost(amount, self.cost_model)
        self.stable_balance -= amount
        self._add_asset_balance(target_bucket, net_amount / target_price)
        self._clamp_small_balance_residue()

    def _move_asset_to_stable(
        self,
        source_bucket: str,
        amount_usd: float,
        prices: float | Mapping[str, float],
    ) -> None:
        source_price = self._resolve_price_for_asset(prices, source_bucket.upper())
        if source_price <= 0:  # pragma: no cover
            raise ValueError("price must be positive")
        available_usd = self._asset_balance(source_bucket) * source_price
        amount = min(amount_usd, available_usd)
        if amount <= 0:
            return
        self._add_asset_balance(source_bucket, -(amount / source_price))
        self.stable_balance += self._apply_cost(amount, self.cost_model)
        self._clamp_small_balance_residue()

    def _move_asset_to_asset(
        self,
        source_bucket: str,
        target_bucket: str,
        amount_usd: float,
        prices: float | Mapping[str, float],
    ) -> None:
        source_price = self._resolve_price_for_asset(prices, source_bucket.upper())
        target_price = self._resolve_price_for_asset(prices, target_bucket.upper())
        if source_price <= 0 or target_price <= 0:  # pragma: no cover
            raise ValueError("spot asset prices must be positive for rotation")
        available_usd = self._asset_balance(source_bucket) * source_price
        amount = min(amount_usd, available_usd)
        if amount <= 0:
            return
        self._add_asset_balance(source_bucket, -(amount / source_price))
        net_amount = self._apply_cost(amount, self.cost_model)
        self._add_asset_balance(target_bucket, net_amount / target_price)
        self._clamp_small_balance_residue()

    def _asset_balance(self, bucket: str) -> float:
        if bucket == "btc":
            return self.btc_balance
        if bucket == "eth":
            return self.eth_balance
        if bucket == "spy":
            return self.spy_balance
        raise ValueError(f"Unsupported asset bucket '{bucket}'")

    def _add_asset_balance(self, bucket: str, delta: float) -> None:
        if bucket == "btc":
            self.btc_balance += delta
            return
        if bucket == "eth":
            self.eth_balance += delta
            return
        if bucket == "spy":
            self.spy_balance += delta
            return
        raise ValueError(f"Unsupported asset bucket '{bucket}'")

    @staticmethod
    def _apply_cost(amount_usd: float, cost_model: CostModel) -> float:
        cost = float(cost_model.calculate_cost(amount_usd))
        return max(0.0, amount_usd - cost)

    @staticmethod
    def _sanitize_balance(value: float) -> float:
        return 0.0 if abs(value) < _BALANCE_EPSILON else value

    def _clamp_small_balance_residue(self) -> None:
        self.btc_balance = self._sanitize_balance(self.btc_balance)
        self.eth_balance = self._sanitize_balance(self.eth_balance)
        self.spy_balance = self._sanitize_balance(self.spy_balance)
        self.stable_balance = self._sanitize_balance(self.stable_balance)
