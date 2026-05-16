"""Service layer for handling wallet-related analytics and token balances."""

import logging
import time
from collections.abc import Mapping
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from src.services.interfaces import QueryServiceProtocol
from src.services.shared.query_names import QUERY_NAMES
from src.services.shared.value_objects import (
    WalletAggregate,
    create_empty_category_breakdown,
)

logger = logging.getLogger(__name__)


def _empty_wallet_aggregate() -> WalletAggregate:
    return WalletAggregate(categories=create_empty_category_breakdown())


def _apply_category_row(
    aggregate: WalletAggregate,
    row: Mapping[str, Any],
) -> None:
    category = str(row["category"])
    category_value = float(row["category_value"])
    token_count = int(row["token_count"])
    percentage = float(row.get("percentage") or 0.0)

    breakdown = aggregate.categories.get(category)
    if breakdown is not None:
        breakdown.value = category_value
        breakdown.percentage = percentage

    aggregate.total_value += category_value
    aggregate.token_count += token_count


class WalletService:
    """
    Provides business logic for wallet data processing.
    """

    def __init__(self, query_service: QueryServiceProtocol):
        """
        Initializes the WalletService with a query service dependency.

        Args:
            query_service: An instance of QueryService to execute database queries.
        """
        self.query_service = query_service

    def verify_wallet_ownership(
        self, db: Session, user_id: UUID, wallet_address: str
    ) -> bool:
        """
        Verify that a wallet address belongs to a specific user.

        Args:
            db: The database session.
            user_id: The user's UUID.
            wallet_address: The wallet address to verify (should be normalized/lowercase).

        Returns:
            True if the wallet belongs to the user, False otherwise.

        Example:
            >>> wallet_service.verify_wallet_ownership(
            ...     db,
            ...     UUID("..."),
            ...     "0x742d35cc6634c0532925a3b844bc9e7595f0beb"
            ... )
            True
        """
        rows = self.query_service.execute_query(
            db, QUERY_NAMES.USER_WALLETS, {"user_id": user_id}
        )

        # Normalize all wallet addresses to lowercase for comparison
        user_wallets = {row["wallet_address"].lower() for row in rows}

        return wallet_address.lower() in user_wallets

    def get_wallet_token_summary(
        self, db: Session, wallet_address: str
    ) -> WalletAggregate:
        """
        Fetches wallet token category summary with aggregated values and percentages.

        Args:
            db: The database session.
            wallet_address: The wallet address to fetch data for.

        Returns:
            WalletAggregate with category breakdowns and total/token counts.
        """
        # Get category data from the new query
        category_rows = self.query_service.execute_query(
            db,
            QUERY_NAMES.WALLET_TOKEN_CATEGORIES,
            {"wallet_address": wallet_address.lower()},
        )

        aggregate = _empty_wallet_aggregate()
        for row in category_rows:
            _apply_category_row(aggregate, row)

        return aggregate

    def get_wallet_token_summaries_batch(
        self, db: Session, wallet_addresses: list[str]
    ) -> dict[str, WalletAggregate]:
        """
        Fetches wallet token summaries for multiple wallets in a single query.

        Eliminates N+1 query pattern by fetching all wallet data at once.

        Args:
            db: The database session.
            wallet_addresses: List of wallet addresses to fetch data for.

        Returns:
            Dictionary mapping wallet_address -> WalletAggregate with category breakdowns.
        """
        start_time = time.time()

        if not wallet_addresses:
            return {}

        wallet_addresses = [w.lower() for w in wallet_addresses]

        # Get category data for all wallets in one query
        t1 = time.time()
        category_rows = self.query_service.execute_query(
            db,
            QUERY_NAMES.WALLET_TOKEN_CATEGORIES_BATCH,
            {"wallet_addresses": wallet_addresses},
        )
        logger.info(
            "PERF: [%s] Batch query (%d wallets): %.2fms",
            self.__class__.__name__,
            len(wallet_addresses),
            (time.time() - t1) * 1000,
        )

        wallet_data = {
            address: _empty_wallet_aggregate() for address in wallet_addresses
        }

        for row in category_rows:
            wallet_address = row["wallet_address"].lower()
            aggregate = wallet_data.get(wallet_address)
            if aggregate is not None:
                _apply_category_row(aggregate, row)

        logger.info(
            "PERF: [%s] Total: %.2fms",
            self.__class__.__name__,
            (time.time() - start_time) * 1000,
        )

        return wallet_data
