"""Critical safeguards against position-level ``id_raw`` deduplication.

DeBank's ``id_raw`` is protocol-level, not position-level. Canonical daily
storage must keep every row in the ETL replacement batch; ``ROW_NUMBER()``,
``DISTINCT ON (id_raw)``, or equivalent logic silently loses positions.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import text


def _insert_position(
    db_session,
    *,
    wallet: str,
    snapshot_at: datetime,
    chain: str,
    protocol: str,
    id_raw: str,
    name_item: str,
    value: float,
) -> str:
    snapshot_id = str(uuid.uuid4())
    db_session.execute(
        text(
            """
            INSERT INTO analytics.daily_portfolio_positions (
              id,
              wallet,
              snapshot_at,
              snapshot_date,
              chain,
              name,
              has_supported_portfolio,
              id_raw,
              name_item,
              asset_usd_value,
              debt_usd_value,
              net_usd_value
            )
            VALUES (
              :snapshot_id,
              lower(:wallet),
              :snapshot_at,
              (:snapshot_at AT TIME ZONE 'UTC')::date,
              :chain,
              :protocol,
              true,
              :id_raw,
              :name_item,
              :value,
              0,
              :value
            )
            """
        ),
        {
            "snapshot_id": snapshot_id,
            "wallet": wallet,
            "snapshot_at": snapshot_at,
            "chain": chain,
            "protocol": protocol,
            "id_raw": id_raw,
            "name_item": name_item,
            "value": value,
        },
    )
    return snapshot_id


def _replace_wallet_day(db_session, wallet: str, snapshot_at: datetime) -> None:
    db_session.execute(
        text(
            """
            DELETE FROM analytics.daily_portfolio_positions
            WHERE wallet = lower(:wallet)
              AND snapshot_date = (:snapshot_at AT TIME ZONE 'UTC')::date
            """
        ),
        {"wallet": wallet, "snapshot_at": snapshot_at},
    )


class TestDeduplicationSafeguards:
    def test_preserves_multiple_positions_with_same_id_raw(self, db_session):
        wallet = "0xSafeguardTestWallet"
        batch_time = datetime.now(UTC)
        shared_id_raw = "morpho_position_123"

        _insert_position(
            db_session,
            wallet=wallet,
            snapshot_at=batch_time,
            chain="ethereum",
            protocol="Morpho",
            id_raw=shared_id_raw,
            name_item="Position A",
            value=100,
        )
        _insert_position(
            db_session,
            wallet=wallet,
            snapshot_at=batch_time,
            chain="ethereum",
            protocol="Morpho",
            id_raw=shared_id_raw,
            name_item="Position B",
            value=200,
        )

        rows = db_session.execute(
            text(
                """
                SELECT name_item
                FROM daily_portfolio_snapshots
                WHERE wallet = lower(:wallet) AND id_raw = :id_raw
                ORDER BY name_item
                """
            ),
            {"wallet": wallet, "id_raw": shared_id_raw},
        ).scalars()
        assert list(rows) == ["Position A", "Position B"]

    def test_replace_batch_removes_the_previous_wallet_day(self, db_session):
        wallet = "0xBatchTestWallet"
        batch_time = datetime.now(UTC)

        old_id = _insert_position(
            db_session,
            wallet=wallet,
            snapshot_at=batch_time,
            chain="ethereum",
            protocol="Morpho",
            id_raw="morpho",
            name_item="Old position",
            value=100,
        )
        _replace_wallet_day(db_session, wallet, batch_time)
        new_id = _insert_position(
            db_session,
            wallet=wallet,
            snapshot_at=batch_time,
            chain="ethereum",
            protocol="Morpho",
            id_raw="morpho",
            name_item="New position",
            value=200,
        )

        ids = db_session.execute(
            text(
                """
                SELECT id
                FROM daily_portfolio_snapshots
                WHERE wallet = lower(:wallet)
                """
            ),
            {"wallet": wallet},
        ).scalars()
        assert list(ids) == [new_id]
        assert old_id != new_id

    def test_preserves_same_id_raw_on_different_chains(self, db_session):
        wallet = "0xChainTestWallet"
        batch_time = datetime.now(UTC)
        shared_id_raw = "morpho_position_multi_chain"

        for chain in ("ethereum", "base"):
            _insert_position(
                db_session,
                wallet=wallet,
                snapshot_at=batch_time,
                chain=chain,
                protocol="Morpho",
                id_raw=shared_id_raw,
                name_item=chain,
                value=100,
            )

        chains = db_session.execute(
            text(
                """
                SELECT chain
                FROM daily_portfolio_snapshots
                WHERE wallet = lower(:wallet) AND id_raw = :id_raw
                ORDER BY chain
                """
            ),
            {"wallet": wallet, "id_raw": shared_id_raw},
        ).scalars()
        assert list(chains) == ["base", "ethereum"]

    def test_replacement_batch_keeps_all_protocols(self, db_session):
        wallet = "0xProtocolBatchWallet"
        batch_time = datetime.now(UTC)
        _replace_wallet_day(db_session, wallet, batch_time)

        for protocol in ("Aave", "Morpho"):
            _insert_position(
                db_session,
                wallet=wallet,
                snapshot_at=batch_time,
                chain="ethereum",
                protocol=protocol,
                id_raw=protocol.lower(),
                name_item=f"{protocol} position",
                value=100,
            )

        protocols = db_session.execute(
            text(
                """
                SELECT name
                FROM daily_portfolio_snapshots
                WHERE wallet = lower(:wallet)
                ORDER BY name
                """
            ),
            {"wallet": wallet},
        ).scalars()
        assert list(protocols) == ["Aave", "Morpho"]
