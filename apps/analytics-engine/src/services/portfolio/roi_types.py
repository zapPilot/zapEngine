"""ROI result types shared by portfolio services."""

from __future__ import annotations

from typing import NotRequired, TypedDict


class ROIWindowData(TypedDict):
    value: float
    data_points: int
    start_balance: float
    days_spanned: NotRequired[int]


RecommendedROIPeriod = str


class PortfolioROIComputed(TypedDict):
    windows: dict[RecommendedROIPeriod, ROIWindowData]
    recommended_roi: float
    recommended_period: RecommendedROIPeriod
    recommended_yearly_roi: float
    estimated_yearly_pnl: float
