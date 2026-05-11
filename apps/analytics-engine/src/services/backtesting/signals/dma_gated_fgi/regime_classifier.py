"""Regime classification from Fear & Greed Index labels.

Runtime strategy regime classification trusts provider labels from
``sentiment_snapshots.classification`` and ``macro_fear_greed_snapshots.label``.
Numeric values remain available for diagnostics and sizing, but strategy
sentiment payloads no longer derive a regime from ``value``.
"""

from __future__ import annotations

from typing import Any, Literal

VALID_REGIME_LABELS = frozenset(
    {"extreme_fear", "fear", "neutral", "greed", "extreme_greed"}
)
RegimeSource = Literal["label", "neutral_fallback"]


class RegimeClassifier:
    """FGI regime classifier for strategy sentiment payloads.

    Runtime classification is label-only. Numeric values are still exposed for
    diagnostics and sizing, but they do not determine the discrete regime.
    """

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

        Uses only a valid provider label: the runtime-normalized
        sentiment["label"] key or a direct sentiment["classification"] key.
        Missing or invalid labels fall back to neutral instead of deriving a
        regime from sentiment["value"].
        """
        if sentiment is None:
            return ("neutral", "neutral_fallback")

        normalized_label = self._normalize_label(
            sentiment.get("label", sentiment.get("classification"))
        )
        if normalized_label is not None:
            return (normalized_label, "label")

        return ("neutral", "neutral_fallback")

    def classify_from_sentiment(self, sentiment: dict[str, Any] | None) -> str:
        """Classify regime from sentiment dict.

        Uses only provider labels; numeric values do not determine regime.

        Args:
            sentiment: Sentiment dict with 'value' and/or 'label' keys

        Returns:
            Regime label string
        """
        regime, _source = self.classify_from_sentiment_with_source(sentiment)
        return regime
