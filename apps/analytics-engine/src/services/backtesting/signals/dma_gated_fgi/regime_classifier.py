"""Regime classification from Fear & Greed Index values.

This module provides utilities for classifying FGI values into discrete regime labels.
The classification thresholds align with the standard Fear & Greed Index interpretation.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

# FGI thresholds for regime classification
# Standard Fear & Greed Index interpretation:
# 0-24: Extreme Fear, 25-44: Fear, 45-55: Neutral, 56-75: Greed, 76-100: Extreme Greed
DEFAULT_FGI_THRESHOLDS = {
    "extreme_fear": (0, 24),
    "fear": (25, 44),
    "neutral": (45, 55),
    "greed": (56, 75),
    "extreme_greed": (76, 100),
}
VALID_REGIME_LABELS = frozenset(DEFAULT_FGI_THRESHOLDS.keys())
RegimeSource = Literal["label", "value", "neutral_fallback"]


def classify_fgi_to_regime(
    fgi_value: float | None,
    thresholds: dict[str, tuple[int, int]] | None = None,
) -> str:
    """Classify FGI value into a regime label.

    Args:
        fgi_value: Fear & Greed Index value in [0, 100], or None
        thresholds: Optional custom thresholds dict mapping regime names to (min, max) tuples

    Returns:
        Regime label string: extreme_fear, fear, neutral, greed, or extreme_greed
    """
    if fgi_value is None:
        return "neutral"

    # Clamp to valid range
    value = max(0.0, min(100.0, float(fgi_value)))
    thresholds = thresholds or DEFAULT_FGI_THRESHOLDS

    # Check each regime's threshold range
    for regime, (min_val, max_val) in thresholds.items():
        if min_val <= value <= max_val:
            return regime

    # Fallback to neutral if no threshold matched (shouldn't happen with valid thresholds)
    return "neutral"


@dataclass
class RegimeClassifier:
    """Configurable FGI to regime classifier.

    This class provides a stateful classifier that can be configured with
    custom thresholds and maintains classification statistics.

    Attributes:
        thresholds: Dict mapping regime names to (min, max) FGI value tuples
    """

    thresholds: dict[str, tuple[int, int]] | None = None

    def classify(self, fgi_value: float | None) -> str:
        """Classify FGI value into regime label.

        Args:
            fgi_value: FGI value in [0, 100] or None

        Returns:
            Regime label string
        """
        return classify_fgi_to_regime(fgi_value, self.thresholds)

    @staticmethod
    def _normalize_label(raw_label: object) -> str | None:
        """Normalize and validate sentiment label values."""
        if not isinstance(raw_label, str):
            return None

        normalized = raw_label.strip().lower().replace("-", "_").replace(" ", "_")
        if not normalized:
            return None
        if normalized not in VALID_REGIME_LABELS:
            return None
        return normalized

    def classify_from_sentiment_with_source(
        self, sentiment: dict[str, Any] | None
    ) -> tuple[str, RegimeSource]:
        """Classify regime from sentiment dict and return the source used.

        Source precedence is label-first for backward compatibility:
        1. valid sentiment["label"]
        2. numeric sentiment["value"]
        3. neutral fallback
        """
        if sentiment is None:
            return ("neutral", "neutral_fallback")

        normalized_label = self._normalize_label(sentiment.get("label"))
        if normalized_label is not None:
            return (normalized_label, "label")

        raw_value = sentiment.get("value")
        if raw_value is not None:
            try:
                return (self.classify(float(raw_value)), "value")
            except (TypeError, ValueError):
                pass

        return ("neutral", "neutral_fallback")

    def classify_from_sentiment(self, sentiment: dict[str, Any] | None) -> str:
        """Classify regime from sentiment dict.

        Uses label-first precedence for backward compatibility.

        Args:
            sentiment: Sentiment dict with 'value' and/or 'label' keys

        Returns:
            Regime label string
        """
        regime, _source = self.classify_from_sentiment_with_source(sentiment)
        return regime
