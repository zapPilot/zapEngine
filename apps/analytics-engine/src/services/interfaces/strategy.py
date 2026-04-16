"""Protocol interfaces for strategy services."""

from datetime import date
from typing import Protocol
from uuid import UUID

from src.models.strategy import DailySuggestionResponse
from src.models.strategy_config import (
    CreateSavedStrategyConfigRequest,
    SavedStrategyConfig,
    UpdateSavedStrategyConfigRequest,
)


class StrategyDailySuggestionServiceProtocol(Protocol):
    """Protocol for DMA-first daily suggestion service."""

    def get_daily_suggestion(
        self,
        user_id: UUID,
        config_id: str | None = None,
        drift_threshold: float | None = None,
        regime_history_days: int | None = None,
    ) -> DailySuggestionResponse:
        """Get the current DMA-first daily suggestion."""
        ...  # pragma: no cover


class StrategyTradeHistoryStoreProtocol(Protocol):
    """Protocol for reading persisted trade history used by live quota checks."""

    def list_trade_dates(
        self,
        user_id: UUID,
        *,
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> list[date]:
        """Return executed trade dates for one user, ordered ascending."""
        ...  # pragma: no cover


class StrategyConfigManagementServiceProtocol(Protocol):
    """Protocol for admin saved-config management."""

    def list_configs(self) -> list[SavedStrategyConfig]:
        """Return all saved strategy configs."""
        ...  # pragma: no cover

    def get_config(self, config_id: str) -> SavedStrategyConfig:
        """Return one saved strategy config."""
        ...  # pragma: no cover

    def create_config(
        self,
        request: CreateSavedStrategyConfigRequest,
    ) -> SavedStrategyConfig:
        """Create a new saved strategy config."""
        ...  # pragma: no cover

    def update_config(
        self,
        config_id: str,
        request: UpdateSavedStrategyConfigRequest,
    ) -> SavedStrategyConfig:
        """Update an existing saved strategy config."""
        ...  # pragma: no cover

    def set_default(self, config_id: str) -> SavedStrategyConfig:
        """Promote a saved strategy config to the global default."""
        ...  # pragma: no cover
