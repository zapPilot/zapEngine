"""
============================================================================
⚠️ CRITICAL SAFEGUARD: Anti-Deduplication Regression Test ⚠️
============================================================================

This test PREVENTS future AI assistants from adding ROW_NUMBER() or
PARTITION BY deduplication logic to daily_portfolio_snapshots.

WHY THIS EXISTS:
----------------
DeBank's id_raw is PROTOCOL-level, NOT position-level.
Multiple distinct positions can share the same id_raw.
Example: superOETHb and cbBTC lending both have id_raw='morpho:lending'
ROW_NUMBER dedup drops valid positions, causing SILENT DATA LOSS.

DO NOT ADD:
-----------
- ROW_NUMBER() OVER (PARTITION BY id_raw)
- DISTINCT ON (id_raw)
- Any position-level deduplication

CORRECT APPROACH:
-----------------
Keep ALL records from the latest batch per PROTOCOL per day.
See: migrations/015_simplify_daily_portfolio_snapshots.sql

DOCUMENTATION:
--------------
- CLAUDE.md "Critical Data Integrity Rules" section
- migrations/015_simplify_daily_portfolio_snapshots.sql header comments

If this test fails, someone added incorrect deduplication logic.
The MV should keep ALL records from a protocol's latest batch.
============================================================================
"""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import text


class TestDeduplicationSafeguards:
    """
    CRITICAL REGRESSION TESTS: Prevent position-level deduplication in MVs.

    If any of these tests fail, it means someone added incorrect deduplication
    logic that causes data loss. DO NOT "fix" these tests by changing assertions -
    fix the MV logic instead.
    """

    def test_preserves_multiple_positions_with_same_id_raw(
        self, db_session, refresh_materialized_views
    ):
        """
        CRITICAL: Verifies that positions with SAME id_raw are NOT deduplicated.

        Scenario:
        - User has 2 different Morpho positions (e.g., superOETHb + cbBTC lending)
        - Both positions have the SAME id_raw (DeBank's protocol-level ID)
        - Both come in the same ETL batch (same snapshot_at)

        Expected: BOTH records must appear in daily_portfolio_snapshots.
        Failure: If count == 1, someone added ROW_NUMBER()/PARTITION BY id_raw logic.
        """

        wallet = "0xSafeguardTestWallet"
        # Use a fixed timestamp for the batch
        batch_time = datetime.now(UTC)

        # Shared protocol ID that previously caused incorrect dedup
        shared_id_raw = "morpho_position_123"

        # Insert Record 1: Position A
        db_session.execute(
            text("""
                INSERT INTO portfolio_item_snapshots (
                    id, wallet, snapshot_at, chain, name, has_supported_portfolio,
                    id_raw, logo_url, site_url, asset_dict, asset_token_list,
                    detail, detail_types, pool, proxy_detail,
                    asset_usd_value, debt_usd_value, net_usd_value, update_at, name_item
                ) VALUES (
                    :id1, :wallet, :snapshot_at, 'ethereum', 'Morpho', true,
                    :id_raw, 'url', 'url', '{}', '[]',
                    '{}', ARRAY['lending'], 'pool_a', '{}',
                    100.0, 0.0, 100.0, :update_at, 'Position A'
                )
            """),
            {
                "id1": str(uuid.uuid4()),
                "wallet": wallet,
                "snapshot_at": batch_time,
                "id_raw": shared_id_raw,
                "update_at": batch_time,
            },
        )

        # Insert Record 2: Position B (Same id_raw, Same Batch, Different Value)
        db_session.execute(
            text("""
                INSERT INTO portfolio_item_snapshots (
                    id, wallet, snapshot_at, chain, name, has_supported_portfolio,
                    id_raw, logo_url, site_url, asset_dict, asset_token_list,
                    detail, detail_types, pool, proxy_detail,
                    asset_usd_value, debt_usd_value, net_usd_value, update_at, name_item
                ) VALUES (
                    :id2, :wallet, :snapshot_at, 'ethereum', 'Morpho', true,
                    :id_raw, 'url', 'url', '{}', '[]',
                    '{}', ARRAY['lending'], 'pool_b', '{}',
                    200.0, 0.0, 200.0, :update_at, 'Position B'
                )
            """),
            {
                "id2": str(uuid.uuid4()),
                "wallet": wallet,
                "snapshot_at": batch_time,
                "id_raw": shared_id_raw,
                "update_at": batch_time,
            },
        )

        db_session.commit()

        # Refresh the Materialized View
        # Note: In production this runs via 'migrations/rebuild_materialized_views.sql'
        # or the scheduled job. Here we force it.
        refresh_materialized_views(include_portfolio_category_trend=False)

        # Assert: Count should be 2, ensuring NO dedup happened
        result = db_session.execute(
            text("""
                SELECT COUNT(*)
                FROM daily_portfolio_snapshots
                WHERE wallet = :wallet
                AND snapshot_at = :snapshot_at
            """),
            {"wallet": wallet.lower(), "snapshot_at": batch_time},
        )

        count = result.scalar()

        # If count is 1, it means incorrect deduplication logic was applied!
        assert count == 2, (
            f"CRITICAL DATA LOSS: Expected 2 positions with same id_raw, got {count}. "
            f"Someone added ROW_NUMBER()/PARTITION BY id_raw deduplication! "
            f"This drops valid positions and causes silent data loss. "
            f"FIX: Remove position-level dedup from daily_portfolio_snapshots. "
            f"See migrations/015_simplify_daily_portfolio_snapshots.sql for correct logic."
        )

    def test_deduplicates_different_batches(
        self, db_session, refresh_materialized_views
    ):
        """
        Verify that we DO still deduplicate by keeping only the LATEST batch.
        This ensures we haven't removed ALL logic, just the incorrect one.
        """
        wallet = "0xBatchTestWallet"
        wallet = "0xBatchTestWallet"
        # Ensure both timestamps are on the SAME day to test same-day deduplication
        base_date = datetime.now(UTC).date()
        newer_batch = datetime.combine(
            base_date, datetime.min.time().replace(hour=12), tzinfo=UTC
        )
        older_batch = newer_batch - timedelta(hours=2)
        # Insert Old Batch Record
        db_session.execute(
            text("""
                INSERT INTO portfolio_item_snapshots (
                    id, wallet, snapshot_at, chain, name, has_supported_portfolio,
                    id_raw, asset_usd_value
                ) VALUES (
                    :id, :wallet, :snapshot_at, 'ethereum', 'Protocol', true,
                    'same_id', 100.0
                )
            """),
            {"id": str(uuid.uuid4()), "wallet": wallet, "snapshot_at": older_batch},
        )

        # Insert New Batch Record
        db_session.execute(
            text("""
                INSERT INTO portfolio_item_snapshots (
                    id, wallet, snapshot_at, chain, name, has_supported_portfolio,
                    id_raw, asset_usd_value
                ) VALUES (
                    :id, :wallet, :snapshot_at, 'ethereum', 'Protocol', true,
                    'same_id', 200.0
                )
            """),
            {"id": str(uuid.uuid4()), "wallet": wallet, "snapshot_at": newer_batch},
        )

        db_session.commit()
        refresh_materialized_views(include_portfolio_category_trend=False)

        # Query should return ONLY the newer batch
        result = db_session.execute(
            text("""
                SELECT asset_usd_value
                FROM daily_portfolio_snapshots
                WHERE wallet = :wallet
            """),
            {"wallet": wallet.lower()},
        )
        rows = result.fetchall()

        assert len(rows) == 1
        assert rows[0][0] == 200.0  # Should be the value from the newer batch

    def test_preserves_same_id_raw_on_different_chains(
        self, db_session, refresh_materialized_views
    ):
        """
        CRITICAL: Verifies that positions with SAME id_raw on DIFFERENT chains are NOT deduplicated.

        Scenario:
        - User has 'morpho_position' on 'ethereum'
        - User has SAME 'morpho_position' on 'base'
        - Both come in the same ETL batch

        Expected: BOTH records must appear.
        Failure: If count == 1, dedup logic is ignoring 'chain'.
        """
        wallet = "0xChainTestWallet"
        batch_time = datetime.now(UTC)
        shared_id_raw = "morpho_position_multi_chain"

        # Insert Ethereum Record
        db_session.execute(
            text("""
                INSERT INTO portfolio_item_snapshots (
                    id, wallet, snapshot_at, chain, name, has_supported_portfolio,
                    id_raw, asset_usd_value
                ) VALUES (
                    :id1, :wallet, :snapshot_at, 'ethereum', 'Morpho', true,
                    :id_raw, 100.0
                )
            """),
            {
                "id1": str(uuid.uuid4()),
                "wallet": wallet,
                "snapshot_at": batch_time,
                "id_raw": shared_id_raw,
            },
        )

        # Insert Base Record (Same id_raw, Different Chain)
        db_session.execute(
            text("""
                INSERT INTO portfolio_item_snapshots (
                    id, wallet, snapshot_at, chain, name, has_supported_portfolio,
                    id_raw, asset_usd_value
                ) VALUES (
                    :id2, :wallet, :snapshot_at, 'base', 'Morpho', true,
                    :id_raw, 200.0
                )
            """),
            {
                "id2": str(uuid.uuid4()),
                "wallet": wallet,
                "snapshot_at": batch_time,
                "id_raw": shared_id_raw,
            },
        )

        db_session.commit()
        refresh_materialized_views(include_portfolio_category_trend=False)

        # Count records for this wallet/batch
        result = db_session.execute(
            text("""
                SELECT COUNT(*)
                FROM daily_portfolio_snapshots
                WHERE wallet = :wallet AND snapshot_at = :snapshot_at
            """),
            {"wallet": wallet.lower(), "snapshot_at": batch_time},
        )

        count = result.scalar()
        assert count == 2, (
            f"Expected 2 records (different chains), got {count}. "
            f"Deduplication logic incorrectly merged chains!"
        )

    def test_updates_are_per_protocol(self, db_session, refresh_materialized_views):
        """
        Verify that updates are ISOLATED per protocol.
        Updating 'Protocol A' should NOT remove 'Protocol B' data from an older batch,
        even if they share the same 'id_raw' structure or just happen to exist.
        """
        # Use lowercase wallet to avoid any casing complexity in the join
        wallet = "0xupdateproutestwallet"
        now = datetime.now(UTC).replace(microsecond=0)
        time_t1 = now - timedelta(hours=2)
        time_t2 = now

        # T1: Insert Protocol A
        db_session.execute(
            text("""
                INSERT INTO portfolio_item_snapshots (
                    id, wallet, snapshot_at, chain, name, has_supported_portfolio,
                    id_raw, asset_usd_value
                ) VALUES (
                    :id, :wallet, :snapshot_at, 'ethereum', 'ProtA', true,
                    'pos_a', 100.0
                )
            """),
            {"id": str(uuid.uuid4()), "wallet": wallet, "snapshot_at": time_t1},
        )

        # T1: Insert Protocol B
        db_session.execute(
            text("""
                INSERT INTO portfolio_item_snapshots (
                    id, wallet, snapshot_at, chain, name, has_supported_portfolio,
                    id_raw, asset_usd_value
                ) VALUES (
                    :id, :wallet, :snapshot_at, 'ethereum', 'ProtB', true,
                    'pos_b', 500.0
                )
            """),
            {"id": str(uuid.uuid4()), "wallet": wallet, "snapshot_at": time_t1},
        )

        # T2: Update Protocol A ONLY
        db_session.execute(
            text("""
                INSERT INTO portfolio_item_snapshots (
                    id, wallet, snapshot_at, chain, name, has_supported_portfolio,
                    id_raw, asset_usd_value
                ) VALUES (
                    :id, :wallet, :snapshot_at, 'ethereum', 'ProtA', true,
                    'pos_a', 150.0
                )
            """),
            {"id": str(uuid.uuid4()), "wallet": wallet, "snapshot_at": time_t2},
        )

        db_session.commit()
        refresh_materialized_views(include_portfolio_category_trend=False)

        # Check Results
        # Protocol A should be from T2 (150.0)
        # Protocol B should still be from T1 (500.0)
        rows = db_session.execute(
            text("""
                SELECT name, asset_usd_value
                FROM daily_portfolio_snapshots
                WHERE wallet = :wallet
                ORDER BY name
            """),
            {"wallet": wallet},
        ).fetchall()

        data = {row[0]: row[1] for row in rows}

        assert data.get("ProtA") == 150.0, "ProtA should be updated to T2 value"
        assert data.get("ProtB") == 500.0, f"ProtB should persist from T1. Data: {data}"
        assert len(data) == 2, "Both protocols should exist"
