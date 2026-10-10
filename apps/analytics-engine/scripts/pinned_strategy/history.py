"""The recorded production history the pinned-strategy spike replays.

It is a lab bundle (``prod:latest``) recorded by an operator with
``strategy-lab bundle record``; nothing is committed. Without one, callers
skip or stop with the command that records it.
"""

from __future__ import annotations

from scripts.pinned_strategy.codec import check_collisions
from src.services.backtesting.lab.bundle import Bundle, load_bundle

BUNDLE_REF = "prod:latest"
RECORD_HINT = (
    "Record one with: node scripts/env/run.mjs --environment prod -- "
    "pnpm --filter @zapengine/analytics-engine strategy-lab bundle record "
    "--name prod --start <first day>"
)


def recorded_bundle(ref: str = BUNDLE_REF) -> Bundle:
    """Load a recorded bundle, refusing prices the EVM codec would conflate."""
    bundle = load_bundle(ref)
    check_collisions(
        float(value)
        for row in bundle.prices
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
    return bundle
