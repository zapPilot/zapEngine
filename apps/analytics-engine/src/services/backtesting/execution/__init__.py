"""Execution primitives for backtesting."""

from __future__ import annotations

import numpy as np


def drawdown_fraction_series(values: np.ndarray) -> np.ndarray:
    """Drawdown as negative fractions relative to the running peak (e.g. -0.12 = -12%)."""
    running_max = np.maximum.accumulate(values)
    out: np.ndarray = np.zeros_like(values, dtype=float)
    np.divide(values - running_max, running_max, out=out, where=running_max != 0)
    return out
