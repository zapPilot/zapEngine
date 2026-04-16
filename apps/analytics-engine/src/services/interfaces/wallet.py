from __future__ import annotations

from typing import Protocol
from uuid import UUID

from sqlalchemy.orm import Session

from src.services.shared.value_objects import WalletAggregate


class WalletServiceProtocol(Protocol):
    """Interface for wallet-related services"""

    def verify_wallet_ownership(
        self, db: Session, user_id: UUID, wallet_address: str
    ) -> bool:
        """Verify that a wallet address belongs to a specific user"""
        ...  # pragma: no cover

    def get_wallet_token_summary(
        self, db: Session, wallet_address: str
    ) -> WalletAggregate:
        """Get token summary for a wallet"""
        ...  # pragma: no cover

    def get_wallet_token_summaries_batch(
        self, db: Session, wallet_addresses: list[str]
    ) -> dict[str, WalletAggregate]:
        """Get token summaries for multiple wallets in a single query"""
        ...  # pragma: no cover
