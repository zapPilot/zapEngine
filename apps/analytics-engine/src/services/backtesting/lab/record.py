"""Record a market data bundle from the production read-only database.

This is the only code in the lab that touches production data. It refuses to
run unless the service is in read-only mode, takes the same prepared window the
compare path takes (``BacktestingService.prepare_market_window``), and never
overwrites a bundle. Operators run it through the environment runner, which
supplies the read-only secrets:

    node scripts/env/run.mjs --environment prod -- \\
        pnpm --filter @zapengine/analytics-engine strategy-lab bundle record \\
        --name prod --start 2017-01-01
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import TYPE_CHECKING

from src.services.backtesting.lab.bundle import (
    PRODUCTION_SOURCE,
    BundleManifest,
    build_manifest,
    requirements_as_dict,
    write_bundle,
)
from src.services.backtesting.spec import load_spec
from src.services.backtesting.strategy_registry import resolve_spec_strategy_config

if TYPE_CHECKING:
    from src.services.strategy.backtesting_service import BacktestingService

REFERENCE_SPEC = "reference/dma_fgi"
RECORD_ASSET = "BTC"
_PLACEHOLDER_URL = "placeholder_db_url"


class RecordRefused(Exception):
    """The environment is not one a production recording may run in."""


@dataclass(frozen=True)
class Recording:
    """What a recording found, and where it was written (``None`` for a dry run)."""

    manifest: BundleManifest
    path: Path | None
    rows: int


def ensure_read_only() -> None:
    """Refuse unless the service is read-only and has a read-only database URL."""
    from src.core.config import settings

    if not settings.is_read_only:
        raise RecordRefused("DATABASE_READ_ONLY must be true to record a bundle")
    if settings.database_read_only_url == _PLACEHOLDER_URL:
        raise RecordRefused("DATABASE_READ_ONLY_URL is not set")


@contextmanager
def database_service() -> Iterator[BacktestingService]:  # pragma: no cover
    """A backtesting service over the read-only database (needs its secrets)."""
    from src.core.database import close_database, init_database, session_scope
    from src.services.market.macro_fear_greed_service import (
        MacroFearGreedDatabaseService,
    )
    from src.services.market.sentiment_database_service import (
        SentimentDatabaseService,
    )
    from src.services.market.stock_price_service import StockPriceService
    from src.services.market.token_price_service import TokenPriceService
    from src.services.shared.query_service import get_query_service
    from src.services.strategy.backtesting_service import BacktestingService
    from src.services.strategy.strategy_config_store import StrategyConfigStore

    init_database()
    try:
        with session_scope() as session:
            queries = get_query_service()
            yield BacktestingService(
                TokenPriceService(session, queries),
                SentimentDatabaseService(session, queries),
                strategy_config_store=StrategyConfigStore(),
                stock_price_service=StockPriceService(session, queries),
                macro_fear_greed_service=MacroFearGreedDatabaseService(
                    session, queries
                ),
            )
    finally:
        close_database()


def record_bundle(
    service: BacktestingService,
    *,
    name: str,
    start: date,
    end: date,
    bundles_dir: Path,
    dry_run: bool,
) -> Recording:
    """Prepare the reference strategy's market window and keep it as a bundle.

    A dry run reports the manifest, coverage included, without writing.
    Raises ``MarketDataUnavailableError`` when the database cannot serve it.
    """
    resolved = resolve_spec_strategy_config(
        load_spec(REFERENCE_SPEC), config_id="reference"
    )
    prepared = service.prepare_market_window(
        resolved_configs=[resolved],
        token_symbol=RECORD_ASSET,
        start_date=start,
        end_date=end,
        days=None,
    )
    manifest = build_manifest(
        name=name,
        source=PRODUCTION_SOURCE,
        prices=prepared.prices,
        sentiments=prepared.sentiments,
        start=prepared.user_start_date,
        end=end,
        requirements=requirements_as_dict(resolved.market_data_requirements),
    )
    path = (
        None
        if dry_run
        else write_bundle(
            bundles_dir,
            manifest=manifest,
            prices=prepared.prices,
            sentiments=prepared.sentiments,
        )
    )
    return Recording(manifest=manifest, path=path, rows=len(prepared.prices))


__all__ = [
    "REFERENCE_SPEC",
    "RecordRefused",
    "Recording",
    "database_service",
    "ensure_read_only",
    "record_bundle",
]
