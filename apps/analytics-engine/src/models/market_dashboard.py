"""
Market Dashboard Models

Self-describing schema for the market dashboard endpoint.

The response carries a `series` registry up front (declaring kind/unit/label/
frequency/color_hint/scale per series), then dated `snapshots` whose `values`
map fills in a uniform `SeriesPoint` keyed by the same series id.

Adding a new data source (gold, NDX, 10Y yield, etc.) is a server-side
addition only — register a descriptor, populate values per snapshot. Adding
a new derived metric (RSI, dma_50, etc.) is just another `indicators` entry.

Series id conventions:
- lowercase snake_case
- ratios use `<base>_<quote>` (e.g. `eth_btc`)
- raw assets use ticker (e.g. `btc`, `eth`, `spy`)
- indices use a short label (e.g. `fgi`)
"""

import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


class SeriesKind(str, Enum):
    """Coarse type of the series — drives axis grouping on the client."""

    asset = "asset"
    ratio = "ratio"
    gauge = "gauge"  # named "gauge" (not "index") to avoid shadowing str.index


class SeriesFrequency(str, Enum):
    """Native sample cadence of the underlying data source."""

    daily = "daily"  # 7 days/week (crypto, FGI)
    weekdays = "weekdays"  # market days only (SPY)
    ad_hoc = "ad-hoc"


class SeriesDescriptor(BaseModel):
    """Static metadata for a series. Lives in the response's `series` registry."""

    kind: SeriesKind
    unit: str = Field(..., description='e.g. "usd", "ratio", "score"')
    label: str = Field(..., description="Human-readable label for axes/legend")
    frequency: SeriesFrequency
    color_hint: str | None = Field(
        None, description='Suggested color in "#RRGGBB"; UI may override'
    )
    scale: tuple[float, float] | None = Field(
        None,
        description="Fixed scale [min, max] for indices like FGI; null for free-scale",
    )


class Indicator(BaseModel):
    """A derived numeric metric on a series (DMA, RSI, etc.)."""

    value: float
    is_above: bool | None = Field(
        None,
        description="Whether the series value is above this indicator (null if undefined)",
    )


class SeriesPoint(BaseModel):
    """A single dated observation of a series."""

    value: float
    indicators: dict[str, Indicator] = Field(
        default_factory=dict,
        description="Numeric derived metrics keyed by indicator id (e.g. dma_200)",
    )
    tags: dict[str, str] = Field(
        default_factory=dict,
        description="Categorical derived labels keyed by tag id (e.g. regime)",
    )


class MarketSnapshot(BaseModel):
    """All series' observations for a single date. Missing key = no data."""

    snapshot_date: datetime.date
    values: dict[str, SeriesPoint] = Field(
        ..., description="Series id → SeriesPoint; absent ids have no data on this date"
    )


class DashboardMeta(BaseModel):
    """Response-level metadata."""

    primary_series: str = Field(
        ..., description="Series id the dashboard should focus on by default"
    )
    days_requested: int
    count: int
    timestamp: datetime.datetime


class MarketDashboardResponse(BaseModel):
    """Self-describing market dashboard payload."""

    series: dict[str, SeriesDescriptor] = Field(
        ...,
        description="Series registry — declares each id's kind/unit/label/frequency",
    )
    snapshots: list[MarketSnapshot]
    meta: DashboardMeta

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "series": {
                    "btc": {
                        "kind": "asset",
                        "unit": "usd",
                        "label": "BTC",
                        "frequency": "daily",
                        "color_hint": "#FFFFFF",
                        "scale": None,
                    },
                    "eth": {
                        "kind": "asset",
                        "unit": "usd",
                        "label": "ETH",
                        "frequency": "daily",
                        "color_hint": "#627EEA",
                        "scale": None,
                    },
                    "spy": {
                        "kind": "asset",
                        "unit": "usd",
                        "label": "S&P 500 (SPY)",
                        "frequency": "weekdays",
                        "color_hint": "#3B82F6",
                        "scale": None,
                    },
                    "eth_btc": {
                        "kind": "ratio",
                        "unit": "ratio",
                        "label": "ETH/BTC",
                        "frequency": "daily",
                        "color_hint": "#34D399",
                        "scale": None,
                    },
                    "fgi": {
                        "kind": "gauge",
                        "unit": "score",
                        "label": "Fear & Greed",
                        "frequency": "daily",
                        "color_hint": "#10B981",
                        "scale": [0, 100],
                    },
                },
                "snapshots": [
                    {
                        "snapshot_date": "2026-04-24",
                        "values": {
                            "btc": {
                                "value": 78260.6,
                                "indicators": {
                                    "dma_200": {"value": 85657.6, "is_above": False}
                                },
                                "tags": {},
                            },
                            "eth": {
                                "value": 3120.4,
                                "indicators": {
                                    "dma_200": {"value": 2940.1, "is_above": True}
                                },
                                "tags": {},
                            },
                            "spy": {
                                "value": 713.9,
                                "indicators": {
                                    "dma_200": {"value": 665.5, "is_above": True}
                                },
                                "tags": {},
                            },
                            "eth_btc": {
                                "value": 0.0297,
                                "indicators": {
                                    "dma_200": {"value": 0.0324, "is_above": False}
                                },
                                "tags": {},
                            },
                            "fgi": {
                                "value": 45,
                                "indicators": {},
                                "tags": {"regime": "f"},
                            },
                        },
                    }
                ],
                "meta": {
                    "primary_series": "btc",
                    "days_requested": 365,
                    "count": 1,
                    "timestamp": "2026-04-25T12:00:00Z",
                },
            }
        }
    )
