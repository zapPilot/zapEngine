"""Contract tests for get_sentiment_history.sql.

The backtest reads one fear and greed value per day, while alpha-etl writes a
snapshot every ten minutes. The query keeps the latest snapshot of each UTC
calendar day, so only one row per day leaves the database, whichever source
wrote it. ``BacktestDataProvider.fetch_sentiments`` keys each row by its UTC day.

The table is created here with the production columns and constraints
(``supabase/migrations/..._prod_baseline.sql``); the integration bootstrap does
not create it. Everything runs inside the test's rolled-back transaction.
"""

from datetime import UTC, datetime, timedelta, timezone

import pytest
from sqlalchemy import text

from src.services.shared.query_names import QUERY_NAMES

TOKYO = timezone(timedelta(hours=9))


@pytest.fixture
def sentiment_table(db_session):
    db_session.execute(text("CREATE SCHEMA IF NOT EXISTS alpha_raw"))
    db_session.execute(
        text("""
            CREATE TABLE IF NOT EXISTS alpha_raw.sentiment_snapshots (
                id uuid DEFAULT gen_random_uuid() NOT NULL,
                sentiment_value integer NOT NULL,
                classification text NOT NULL,
                source text DEFAULT 'alternative.me' NOT NULL,
                snapshot_time timestamp with time zone DEFAULT now() NOT NULL,
                raw_data jsonb,
                created_at timestamp with time zone DEFAULT now() NOT NULL
            )
        """)
    )
    db_session.execute(text("DELETE FROM alpha_raw.sentiment_snapshots"))
    return db_session


def _insert(session, snapshot_time, value, *, source="alternative.me"):
    session.execute(
        text("""
            INSERT INTO alpha_raw.sentiment_snapshots
                (sentiment_value, classification, source, snapshot_time)
            VALUES (:value, :classification, :source, :snapshot_time)
        """),
        {
            "value": value,
            "classification": "Fear" if value < 50 else "Greed",
            "source": source,
            "snapshot_time": snapshot_time,
        },
    )


def _run(query_service, session, min_timestamp, max_timestamp=None):
    return query_service.execute_query(
        session,
        QUERY_NAMES.SENTIMENT_HISTORY,
        {"min_timestamp": min_timestamp, "max_timestamp": max_timestamp},
    )


def _utc(day, hour, minute=0):
    return datetime(2025, 1, day, hour, minute, tzinfo=UTC)


def test_each_utc_day_keeps_only_its_latest_snapshot(query_service, sentiment_table):
    for hour, value in ((0, 20), (8, 30), (16, 40)):
        _insert(sentiment_table, _utc(1, hour), value)
    _insert(sentiment_table, _utc(2, 9), 70)

    rows = _run(query_service, sentiment_table, _utc(1, 0))

    assert [(row["snapshot_time"], row["sentiment_value"]) for row in rows] == [
        (_utc(1, 16), 40),
        (_utc(2, 9), 70),
    ]
    assert set(rows[0]) == {
        "sentiment_value",
        "classification",
        "source",
        "snapshot_time",
    }


def test_the_day_is_the_utc_day_across_midnight(query_service, sentiment_table):
    # 23:50 UTC and 00:10 UTC the next day are different days, whatever offset
    # the timestamp was written with (00:10 UTC is 09:10 in Tokyo).
    _insert(sentiment_table, _utc(1, 23, 50), 30)
    _insert(sentiment_table, datetime(2025, 1, 2, 9, 10, tzinfo=TOKYO), 60)

    rows = _run(query_service, sentiment_table, _utc(1, 0))

    assert [row["sentiment_value"] for row in rows] == [30, 60]
    assert [row["snapshot_time"].astimezone(UTC).date() for row in rows] == [
        _utc(1, 0).date(),
        _utc(2, 0).date(),
    ]


def test_the_latest_snapshot_wins_whichever_source_wrote_it(
    query_service, sentiment_table
):
    _insert(sentiment_table, _utc(1, 6), 25, source="coinmarketcap")
    _insert(sentiment_table, _utc(1, 12), 55, source="alternative.me")
    _insert(sentiment_table, _utc(2, 6), 35, source="alternative.me")
    _insert(sentiment_table, _utc(2, 12), 65, source="coinmarketcap")

    rows = _run(query_service, sentiment_table, _utc(1, 0))

    assert [(row["source"], row["sentiment_value"]) for row in rows] == [
        ("alternative.me", 55),
        ("coinmarketcap", 65),
    ]


def test_the_bounds_are_inclusive_and_the_upper_one_optional(
    query_service, sentiment_table
):
    _insert(sentiment_table, _utc(1, 12), 20)
    _insert(sentiment_table, _utc(2, 12), 40)
    _insert(sentiment_table, _utc(3, 12), 60)

    bounded = _run(query_service, sentiment_table, _utc(2, 12), _utc(2, 12))
    open_ended = _run(query_service, sentiment_table, _utc(2, 0))

    assert [row["sentiment_value"] for row in bounded] == [40]
    assert [row["sentiment_value"] for row in open_ended] == [40, 60]
