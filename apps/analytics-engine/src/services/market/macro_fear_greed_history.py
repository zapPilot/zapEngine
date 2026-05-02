"""Shared Macro Fear & Greed history access helpers."""

from __future__ import annotations

import logging
from datetime import date
from typing import Any

from src.services.interfaces.market import MacroFearGreedDatabaseServiceProtocol


def resolve_macro_fear_greed_history(
    *,
    macro_fear_greed_service: MacroFearGreedDatabaseServiceProtocol | None,
    start_date: date,
    end_date: date,
    logger: logging.Logger,
    required: bool = False,
    missing_service_message: str = "macro_fear_greed_service is required",
    failure_log_message: str = "Failed to fetch macro Fear & Greed data: %s",
) -> dict[date, Any]:
    """Fetch daily Macro Fear & Greed rows with optional required semantics."""
    if macro_fear_greed_service is None:
        if required:
            raise ValueError(missing_service_message)
        return {}

    try:
        return dict(
            macro_fear_greed_service.get_daily_macro_fear_greed(
                start_date=start_date,
                end_date=end_date,
            )
        )
    except Exception as error:
        if required:
            raise
        logger.warning(failure_log_message, error)
        return {}
