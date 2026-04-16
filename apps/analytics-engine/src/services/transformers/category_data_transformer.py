"""Shared helpers for transforming category-based analytics rows."""

from __future__ import annotations

from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass, field
from datetime import date
from typing import Any

from src.core.utils import normalize_date, row_to_dict


@dataclass
class CategoryDailyAggregate:
    """Aggregated view of category analytics rows for a single date."""

    date: date  # Normalized to date object by CategoryDataTransformer
    total_value_usd: float = 0.0
    category_totals: dict[str, float] = field(default_factory=dict)
    protocols: set[str] = field(default_factory=set)
    rows: list[dict[str, Any]] = field(default_factory=list)

    def add_row(self, row: dict[str, Any]) -> None:
        """Incorporate a normalized row into the aggregate.

        Args:
            row: Dictionary with category data. MUST contain 'total_value_usd'.

        Raises:
            ValueError: If total_value_usd is missing (NULL) or negative
        """
        self.rows.append(row)

        total_value = row.get("total_value_usd")

        # Strict validation: total_value_usd is REQUIRED from SQL query
        if total_value is None:
            raise ValueError(
                f"Missing required field 'total_value_usd' in row for date {row.get('date')}. "
                "This indicates a SQL query error or data quality issue."
            )

        # Convert to float and validate non-negative
        total_value_float = float(total_value)
        if total_value_float < 0:
            raise ValueError(
                f"Invalid total_value_usd ({total_value_float}) for date {row.get('date')}. "
                "Portfolio net worth cannot be negative."
            )

        self.total_value_usd = total_value_float

        row_value = CategoryDataTransformer.extract_row_value(row)

        category = row.get("category")
        if category is not None:
            self.category_totals[category] = (
                self.category_totals.get(category, 0.0) + row_value
            )

        protocol = row.get("protocol")
        if protocol is not None:
            self.protocols.add(protocol)


class CategoryDataTransformer:
    """Utility class for normalizing and aggregating category analytics rows."""

    @staticmethod
    def normalize_rows(raw_rows: Iterable[Any]) -> list[dict[str, Any]]:
        """Convert database rows to dictionaries for downstream processing."""
        return [row_to_dict(row) for row in raw_rows]

    @staticmethod
    def extract_row_value(row: Mapping[str, Any]) -> float:
        """
        Best-effort extraction of a NET USD value from a row.

        Returns category_value_usd (NET = assets - debt) for portfolio value calculations.
        For assets-only calculations, use extract_assets_value() instead.
        """
        value = row.get("category_value_usd")
        if value is None:
            value = row.get("net_value_usd")
        return float(value or 0.0)

    @staticmethod
    def extract_assets_value(row: Mapping[str, Any]) -> float:
        """
        Extract ASSETS ONLY (excluding debt) from a row.

        Returns category_assets_usd for portfolio composition/allocation calculations.
        This represents "what you own" without accounting for borrowing positions.
        """
        value = row.get("category_assets_usd")
        return float(value or 0.0)

    def _aggregate_generic(
        self,
        raw_rows: Iterable[Any],
        value_extractor: Callable[[Mapping[str, Any]], float],
    ) -> list[CategoryDailyAggregate]:
        """
        Shared aggregation logic for both net value and assets-only calculations.

        Args:
            raw_rows: Database rows to process
            value_extractor: Function to extract the relevant value from a row

        Returns:
            List of aggregated daily buckets
        """
        normalized_rows = self.normalize_rows(raw_rows)
        aggregates: dict[Any, CategoryDailyAggregate] = {}

        for row in normalized_rows:
            date_value = row.get("date")
            if date_value is None:
                continue

            # Normalize date to ensure consistent type
            normalized_date = normalize_date(date_value, nullable=False)
            assert normalized_date is not None  # nullable=False guarantees this

            bucket = aggregates.get(normalized_date)
            if bucket is None:
                bucket = CategoryDailyAggregate(date=normalized_date)
                aggregates[normalized_date] = bucket

            # Create modified row with extracted value for consistent processing
            # CategoryDailyAggregate.add_row uses "total_value_usd" or extracted value
            # We standardize by ensuring the row reflects the value we want to aggregate
            processed_row = dict(row)

            # For assets calculation, we might need to override the value
            # The add_row method calculates total based on extracted value
            # so we let the value_extractor handle the specific logic

            # However, CategoryDailyAggregate.add_row calls extract_row_value internally
            # so for assets-only, we must modify the row's fields to trick it,
            # OR better yet, we pass the custom value via a standardized field
            # that add_row understands?

            # Actually, CategoryDailyAggregate.add_row is coupled to extract_row_value.
            # To avoid modifying CategoryDailyAggregate, we can just modify the
            # row passed to it if we want custom behavior, like aggregate_assets_only did.

            if value_extractor == self.extract_assets_value:
                # Assets-only logic overrides "category_value_usd"
                processed_row["category_value_usd"] = value_extractor(row)

            bucket.add_row(processed_row)

        return sorted(aggregates.values(), key=lambda agg: agg.date)

    def aggregate(self, raw_rows: Iterable[Any]) -> list[CategoryDailyAggregate]:
        """
        Aggregate rows into daily buckets with NET category totals (assets - debt).

        Used for portfolio value calculations where debt positions affect total value.
        """
        return self._aggregate_generic(raw_rows, self.extract_row_value)

    def aggregate_assets_only(
        self, raw_rows: Iterable[Any]
    ) -> list[CategoryDailyAggregate]:
        """
        Aggregate rows using ASSETS ONLY, excluding debt positions.

        This method calculates portfolio composition (allocation) by summing only
        category_assets_usd values, ignoring debt.
        """
        return self._aggregate_generic(raw_rows, self.extract_assets_value)
