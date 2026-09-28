"""Record the exact read-only compare inputs, without updating snapshot/marketing fixtures.

Requires explicit operator approval before use with production secrets.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import os
from datetime import date, datetime
from unittest.mock import patch

from scripts.pinned_strategy.codec import check_collisions
from scripts.pinned_strategy.compile import ROOT

HISTORY = ROOT / "tests/fixtures/pinned_strategy/market_history.jsonl.gz"


def json_default(value):
    if isinstance(value, date | datetime):
        return value.isoformat()
    raise TypeError(type(value).__name__)


def write_history(path, prices, sentiments, start, end):
    if path.resolve().parent != HISTORY.parent.resolve():
        raise ValueError("Recorder may only write its own fixture directory")
    if path.exists():
        raise FileExistsError(path)
    check_collisions(
        float(value)
        for row in prices
        for value in [
            row["price"],
            *row.get("prices", {}).values(),
            *[
                v
                for k, v in row.get("extra_data", {}).items()
                if "dma" in k and isinstance(v, int | float)
            ],
        ]
        if value is not None
    )
    rows = [
        {
            "schema": 1,
            "source": "production-read-only-compare-inputs",
            "start": start,
            "end": end,
        }
    ]
    rows.extend(
        {"market": row, "sentiment": sentiments.get(row["date"])} for row in prices
    )
    payload = "".join(
        json.dumps(row, default=json_default, allow_nan=False, sort_keys=True) + "\n"
        for row in rows
    ).encode()
    path.write_bytes(gzip.compress(payload, mtime=0))
    print(
        json.dumps(
            {
                "rows": len(prices),
                "uncompressed_sha256": hashlib.sha256(payload).hexdigest(),
                "path": str(path),
            }
        )
    )


def read_history(path=HISTORY):
    rows = [
        json.loads(line) for line in gzip.decompress(path.read_bytes()).splitlines()
    ]
    metadata = rows.pop(0)
    assert metadata["schema"] == 1
    prices, sentiments = [], {}
    for entry in rows:
        row = entry["market"]
        row["date"] = date.fromisoformat(row["date"])
        prices.append(row)
        if entry["sentiment"] is not None:
            sentiments[row["date"]] = entry["sentiment"]
    return (
        prices,
        sentiments,
        date.fromisoformat(metadata["start"]),
        date.fromisoformat(metadata["end"]),
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--start", default="2024-12-02")
    parser.add_argument("--end", default="2026-04-15")
    args = parser.parse_args()
    if os.environ.get("DATABASE_READ_ONLY", "").lower() != "true" or not os.environ.get(
        "DATABASE_READ_ONLY_URL"
    ):
        raise SystemExit(
            "DATABASE_READ_ONLY=true and DATABASE_READ_ONLY_URL are required"
        )
    from fastapi.testclient import TestClient

    from src.main import app
    from src.services.backtesting.execution.compare import run_compare_v3_on_data

    captured = []

    def record(**kwargs):
        captured.append(kwargs)
        return run_compare_v3_on_data(**kwargs)

    with (
        patch(
            "src.services.strategy.backtesting_service.run_compare_v3_on_data", record
        ),
        TestClient(app) as client,
    ):
        response = client.post(
            "/api/v3/backtesting/compare",
            json={
                "token_symbol": "BTC",
                "total_capital": 10000,
                "start_date": args.start,
                "end_date": args.end,
                "configs": [
                    {
                        "config_id": "dma_fgi_portfolio_rules_default",
                        "strategy_id": "dma_fgi_portfolio_rules",
                        "params": {},
                    }
                ],
            },
        )
        if response.status_code != 200:
            raise RuntimeError(
                f"Compare failed with HTTP {response.status_code}; no fixture written"
            )
    if len(captured) != 1:
        raise RuntimeError("Expected exactly one prepared compare input")
    data = captured[0]
    write_history(
        HISTORY,
        data["prices"],
        data["sentiments"],
        data["user_start_date"],
        date.fromisoformat(args.end),
    )


if __name__ == "__main__":
    main()
