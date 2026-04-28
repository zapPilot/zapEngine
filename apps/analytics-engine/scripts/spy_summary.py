"""Summarize SPY allocation behavior across a compare-v3 timeline.

Reads a compare-v3 JSON dump and prints:
1. Distribution of decision.reason values (which rules fire how often)
2. Days where target_asset_allocation.spy > 0 (entries actually happen)
3. Days where target_allocation (DMA-gate output) shows spot>0 (SPY signaling buy)

Usage:
  python scripts/spy_summary.py /path/to/compare_response.json [--strategy-id ID]
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path
from typing import Any


def _safe_float(value: Any) -> float | None:
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return result


def summarize(payload: dict[str, Any], strategy_id: str) -> None:
    timeline = payload.get("timeline") or []
    reasons: Counter[str] = Counter()
    actions: Counter[str] = Counter()
    spy_nonzero_days: list[tuple[str, float, str]] = []
    spy_signal_buy_days: list[tuple[str, str]] = []

    total = 0
    for point in timeline:
        if not isinstance(point, dict):
            continue
        strategies = point.get("strategies") or {}
        state = strategies.get(strategy_id)
        if not isinstance(state, dict):
            continue
        total += 1

        date_str = (point.get("market") or {}).get("date") or "?"
        decision = state.get("decision") or {}
        target_assets = decision.get("target_asset_allocation") or {}
        target_alloc = decision.get("target_allocation") or {}
        reason = str(decision.get("reason") or "n/a")
        action = str(decision.get("action") or "n/a")

        reasons[reason] += 1
        actions[action] += 1

        spy_share = _safe_float(target_assets.get("spy"))
        if spy_share is not None and spy_share > 0.0:
            spy_nonzero_days.append((date_str, spy_share, reason))

        # target_allocation comes from DmaGate.SELL_TARGET={spot:0,stable:1} or
        # BUY_TARGET={spot:1,stable:0}. spot>0 means SPY DMA gate said "buy".
        if isinstance(target_alloc, dict):
            spot = _safe_float(target_alloc.get("spot"))
            if spot is not None and spot > 0.0 and reason.startswith("spy_"):
                spy_signal_buy_days.append((date_str, reason))

    print(f"Total timeline points: {total}")
    print(f"\nDecision actions ({len(actions)} kinds):")
    for action, count in actions.most_common():
        print(f"  {action:>10s}: {count:>4d} ({count / total * 100:5.1f}%)")
    print(f"\nDecision reasons ({len(reasons)} kinds):")
    for reason, count in reasons.most_common():
        print(f"  {reason:>30s}: {count:>4d} ({count / total * 100:5.1f}%)")

    print(f"\nDays with spy > 0 in target_asset_allocation: {len(spy_nonzero_days)}")
    if spy_nonzero_days:
        for date_str, spy_share, reason in spy_nonzero_days[:10]:
            print(f"  {date_str}  spy={spy_share:.3f}  reason={reason}")
        if len(spy_nonzero_days) > 10:
            print(f"  ... and {len(spy_nonzero_days) - 10} more")

    print(f"\nDays where SPY DMA gate emitted BUY signal: {len(spy_signal_buy_days)}")
    if spy_signal_buy_days:
        for date_str, reason in spy_signal_buy_days[:10]:
            print(f"  {date_str}  reason={reason}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", help="Path to compare-v3 JSON response")
    parser.add_argument(
        "--strategy-id",
        default="spy_eth_btc_rotation_default",
        help="Strategy id key in timeline.strategies (default: %(default)s)",
    )
    args = parser.parse_args(argv)
    payload = json.loads(Path(args.path).read_text())
    if not isinstance(payload, dict):
        print("ERROR: response root must be an object", file=sys.stderr)
        return 1
    summarize(payload, args.strategy_id)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
