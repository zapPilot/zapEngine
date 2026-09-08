"""Contract tests for get_canonical_snapshot_date.sql.

Every analytics endpoint anchors on this query, so its contract is asserted at
the SQL boundary rather than only through ``CanonicalSnapshotService``:

* the three output names are read positionally-by-name in
  ``canonical_snapshot_service.py`` (``snapshot_date`` / ``wallet_count`` /
  ``max_snapshot_at``), so a rename would degrade every endpoint to "no data";
* the date is the latest day where *any* wallet has data, which is what keeps a
  bundle containing an empty wallet from collapsing to zero.

Rows are seeded the way ``alpha-etl`` writes them (``portfolioWriter.ts``):
``wallet`` lower-cased and ``snapshot_date`` set to the UTC calendar day of
``snapshot_at``. ``user_crypto_wallets`` deliberately keeps checksummed casing,
because that is the side where case normalisation is load-bearing.
"""

from datetime import UTC, date, datetime
from uuid import uuid4

import pytest
from sqlalchemy import text

from src.services.shared.query_names import QUERY_NAMES

# Mixed-case on purpose: registration keeps EIP-55 casing, the ETL does not.
WALLET_A = "0xAbC1111111111111111111111111111111111111"
WALLET_B = "0xdEf2222222222222222222222222222222222222"
WALLET_OTHER_USER = "0xFfF3333333333333333333333333333333333333"


@pytest.fixture
def user_id():
    return uuid4()


@pytest.fixture
def wallets(db_session, user_id):
    """Two wallets for the test user, plus one owned by a different user."""
    other_user_id = uuid4()
    for uid in (user_id, other_user_id):
        db_session.execute(
            text("INSERT INTO users (id) VALUES (:user_id)"), {"user_id": str(uid)}
        )
    for uid, wallet in [
        (user_id, WALLET_A),
        (user_id, WALLET_B),
        (other_user_id, WALLET_OTHER_USER),
    ]:
        db_session.execute(
            text("""
                INSERT INTO user_crypto_wallets (id, user_id, wallet, label, created_at)
                VALUES (:id, :user_id, :wallet, 'Test', :created_at)
            """),
            {
                "id": str(uuid4()),
                "user_id": str(uid),
                "wallet": wallet,
                "created_at": datetime.now(UTC),
            },
        )
    db_session.commit()
    return {"owned": [WALLET_A, WALLET_B], "other": WALLET_OTHER_USER}


def _insert_position(db_session, wallet, snapshot_at, *, source="debank"):
    """Insert one position exactly as alpha-etl would write it."""
    db_session.execute(
        text("""
            INSERT INTO analytics.daily_portfolio_positions
                (id, wallet, snapshot_at, snapshot_date, chain, source,
                 name, name_item, asset_usd_value, net_usd_value)
            VALUES (:id, :wallet, :snapshot_at, :snapshot_date, 'eth', :source,
                    'TestProtocol', 'Lending', 100, 100)
        """),
        {
            "id": str(uuid4()),
            "wallet": wallet.lower(),
            "snapshot_at": snapshot_at,
            "snapshot_date": snapshot_at.astimezone(UTC).date(),
            "source": source,
        },
    )
    db_session.commit()


def _at(day: date, hour: int = 12, minute: int = 0) -> datetime:
    return datetime(day.year, day.month, day.day, hour, minute, tzinfo=UTC)


def _run(query_service, db_session, user_id, wallet_address=None):
    return query_service.execute_query(
        db_session,
        QUERY_NAMES.CANONICAL_SNAPSHOT_DATE,
        {"user_id": str(user_id), "wallet_address": wallet_address},
    )


def test_output_names_match_what_the_service_reads(
    query_service, db_session, user_id, wallets
):
    """CanonicalSnapshotService reads these three keys by name."""
    _insert_position(db_session, wallets["owned"][0], _at(date(2026, 3, 4)))

    rows = _run(query_service, db_session, user_id)

    assert len(rows) == 1
    assert set(rows[0]) == {"snapshot_date", "wallet_count", "max_snapshot_at"}
    assert rows[0]["snapshot_date"] == date(2026, 3, 4)
    assert isinstance(rows[0]["snapshot_date"], date)


def test_only_the_latest_day_is_returned(query_service, db_session, user_id, wallets):
    """Older days never win, even when they hold more wallets."""
    first, second = wallets["owned"]
    _insert_position(db_session, first, _at(date(2026, 3, 1)))
    _insert_position(db_session, second, _at(date(2026, 3, 1)))
    _insert_position(db_session, first, _at(date(2026, 3, 4)))

    rows = _run(query_service, db_session, user_id)

    assert len(rows) == 1
    assert rows[0]["snapshot_date"] == date(2026, 3, 4)
    assert rows[0]["wallet_count"] == 1


def test_a_bundle_with_an_empty_wallet_still_reports_the_latest_day(
    query_service, db_session, user_id, wallets
):
    """The documented consistency guarantee: ANY wallet having data is enough."""
    _insert_position(db_session, wallets["owned"][0], _at(date(2026, 3, 4)))

    rows = _run(query_service, db_session, user_id)

    assert rows[0]["snapshot_date"] == date(2026, 3, 4)
    # The user owns two wallets; only one has snapshots on that day.
    assert rows[0]["wallet_count"] == 1


def test_wallet_count_counts_distinct_wallets_not_positions(
    query_service, db_session, user_id, wallets
):
    """Several positions per wallet must not inflate the count."""
    first, second = wallets["owned"]
    day = date(2026, 3, 4)
    _insert_position(db_session, first, _at(day, hour=9))
    _insert_position(db_session, first, _at(day, hour=10))
    _insert_position(db_session, second, _at(day, hour=11))

    rows = _run(query_service, db_session, user_id)

    assert rows[0]["wallet_count"] == 2


def test_max_snapshot_at_is_the_latest_timestamp_on_the_chosen_day(
    query_service, db_session, user_id, wallets
):
    """last_updated on the API response comes straight from this column."""
    first, second = wallets["owned"]
    day = date(2026, 3, 4)
    _insert_position(db_session, first, _at(day, hour=6))
    _insert_position(db_session, second, _at(day, hour=21, minute=15))
    # A newer timestamp on an older day must not leak into the result.
    _insert_position(db_session, first, _at(date(2026, 3, 3), hour=23, minute=59))

    rows = _run(query_service, db_session, user_id)

    assert rows[0]["max_snapshot_at"] == _at(day, hour=21, minute=15)


def test_the_day_boundary_is_utc(query_service, db_session, user_id, wallets):
    """A 23:30Z row and a 00:30Z row belong to different canonical days."""
    wallet = wallets["owned"][0]
    _insert_position(db_session, wallet, _at(date(2026, 3, 4), hour=23, minute=30))
    _insert_position(db_session, wallet, _at(date(2026, 3, 5), hour=0, minute=30))

    rows = _run(query_service, db_session, user_id)

    assert rows[0]["snapshot_date"] == date(2026, 3, 5)
    assert rows[0]["max_snapshot_at"] == _at(date(2026, 3, 5), hour=0, minute=30)


def test_hyperliquid_rows_also_anchor_the_canonical_day(
    query_service, db_session, user_id, wallets
):
    """Unlike the LST query, this one is source-agnostic."""
    wallet = wallets["owned"][0]
    _insert_position(db_session, wallet, _at(date(2026, 3, 4)))
    _insert_position(db_session, wallet, _at(date(2026, 3, 5)), source="hyperliquid")

    rows = _run(query_service, db_session, user_id)

    assert rows[0]["snapshot_date"] == date(2026, 3, 5)


def test_wallet_filter_is_case_insensitive_and_narrows_the_day(
    query_service, db_session, user_id, wallets
):
    """Callers pass checksummed addresses; storage is lower-cased."""
    first, second = wallets["owned"]
    _insert_position(db_session, first, _at(date(2026, 3, 1)))
    _insert_position(db_session, second, _at(date(2026, 3, 4)))

    rows = _run(query_service, db_session, user_id, wallet_address=first.upper())

    assert len(rows) == 1
    assert rows[0]["snapshot_date"] == date(2026, 3, 1)
    assert rows[0]["wallet_count"] == 1


def test_another_users_wallet_never_moves_the_canonical_day(
    query_service, db_session, user_id, wallets
):
    """User scoping is enforced in SQL, not by the caller."""
    _insert_position(db_session, wallets["owned"][0], _at(date(2026, 3, 1)))
    _insert_position(db_session, wallets["other"], _at(date(2026, 3, 9)))

    rows = _run(query_service, db_session, user_id)

    assert rows[0]["snapshot_date"] == date(2026, 3, 1)


def test_no_rows_when_the_user_has_no_snapshots(
    query_service, db_session, user_id, wallets
):
    """The service treats an empty result as "no data", never as an error."""
    assert _run(query_service, db_session, user_id) == []


def test_no_rows_when_the_wallet_filter_matches_nothing(
    query_service, db_session, user_id, wallets
):
    """A wallet the user does not own yields no canonical day."""
    _insert_position(db_session, wallets["owned"][0], _at(date(2026, 3, 4)))

    rows = _run(query_service, db_session, user_id, wallet_address=wallets["other"])

    assert rows == []
