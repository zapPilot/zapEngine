"""Tests for FGI regime classifier."""

from src.services.backtesting.signals.dma_gated_fgi.regime_classifier import (
    RegimeClassifier,
)


def test_regime_classifier_instance():
    """Test RegimeClassifier class."""
    classifier = RegimeClassifier()
    assert classifier.classify_from_sentiment({"label": "neutral"}) == "neutral"


def test_classify_from_sentiment():
    """Test classification from sentiment dict."""
    classifier = RegimeClassifier()

    # Label-first precedence over numeric value
    assert (
        classifier.classify_from_sentiment({"label": "neutral", "value": 90})
        == "neutral"
    )
    assert (
        classifier.classify_from_sentiment(
            {"classification": "Extreme Fear", "value": 90}
        )
        == "extreme_fear"
    )

    # None and empty
    assert classifier.classify_from_sentiment(None) == "neutral"
    assert classifier.classify_from_sentiment({}) == "neutral"

    # Missing label does not derive regime from numeric value.
    assert classifier.classify_from_sentiment({"value": 10}) == "neutral"
    assert classifier.classify_from_sentiment({"value": "90"}) == "neutral"

    # Invalid label does not derive regime from numeric value.
    assert (
        classifier.classify_from_sentiment({"label": "custom_regime", "value": 90})
        == "neutral"
    )
    assert (
        classifier.classify_from_sentiment({"value": "invalid", "label": "fear"})
        == "fear"
    )


def test_classify_from_sentiment_conflicting_label_and_value_uses_label() -> None:
    """Conflicting label/value uses label for legacy parity."""
    classifier = RegimeClassifier()
    assert (
        classifier.classify_from_sentiment({"label": "neutral", "value": 57})
        == "neutral"
    )


def test_classify_from_sentiment_missing_label_falls_back_to_neutral() -> None:
    """When label is absent, numeric value is not used for regime."""
    classifier = RegimeClassifier()
    assert classifier.classify_from_sentiment({"value": 57}) == "neutral"


def test_classify_from_sentiment_invalid_label_falls_back_to_neutral() -> None:
    """Invalid labels should not silently pass through or use value."""
    classifier = RegimeClassifier()
    assert (
        classifier.classify_from_sentiment({"label": "not_a_regime", "value": 57})
        == "neutral"
    )


def test_classify_from_sentiment_with_source_never_reports_value_source() -> None:
    classifier = RegimeClassifier()

    assert classifier.classify_from_sentiment_with_source({"value": 10}) == (
        "neutral",
        "neutral_fallback",
    )
    assert classifier.classify_from_sentiment_with_source(
        {"label": "not_a_regime", "value": 10}
    ) == ("neutral", "neutral_fallback")


def test_classify_from_sentiment_label_normalization() -> None:
    """Known labels are normalized to canonical regime names."""
    classifier = RegimeClassifier()
    assert (
        classifier.classify_from_sentiment({"label": "Extreme Greed"})
        == "extreme_greed"
    )
    assert (
        classifier.classify_from_sentiment({"label": "extreme-greed"})
        == "extreme_greed"
    )
    assert (
        classifier.classify_from_sentiment({"classification": "Extreme Fear"})
        == "extreme_fear"
    )


def test_classify_from_sentiment_blank_label_falls_back_to_neutral() -> None:
    classifier = RegimeClassifier()
    assert classifier.classify_from_sentiment({"label": "   "}) == "neutral"


def test_classify_from_sentiment_invalid_numeric_value_falls_back() -> None:
    classifier = RegimeClassifier()
    assert (
        classifier.classify_from_sentiment({"label": "not_a_regime", "value": object()})
        == "neutral"
    )
