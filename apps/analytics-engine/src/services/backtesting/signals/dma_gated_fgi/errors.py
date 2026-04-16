"""Signal-layer exception types."""

from __future__ import annotations


class SignalDataError(ValueError):
    """Raised when required signal data is missing or invalid."""
