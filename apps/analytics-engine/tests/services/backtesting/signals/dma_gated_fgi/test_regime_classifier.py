"""Tests for FGI regime classifier."""

from src.services.backtesting.signals.dma_gated_fgi.regime_classifier import (
    RegimeClassifier,
    classify_fgi_to_regime,
)


def test_classify_fgi_to_regime_basic():
    """Test basic classification with default thresholds."""
    assert classify_fgi_to_regime(10) == "extreme_fear"
    assert classify_fgi_to_regime(30) == "fear"
    assert classify_fgi_to_regime(50) == "neutral"
    assert classify_fgi_to_regime(65) == "greed"
    assert classify_fgi_to_regime(90) == "extreme_greed"


def test_classify_fgi_to_regime_none():
    """Test classification with None value."""
    assert classify_fgi_to_regime(None) == "neutral"


def test_classify_fgi_to_regime_clamping():
    """Test classification with out-of-range values."""
    assert classify_fgi_to_regime(-10) == "extreme_fear"
    assert classify_fgi_to_regime(110) == "extreme_greed"


def test_classify_fgi_to_regime_custom_thresholds():
    """Test classification with custom thresholds."""
    custom = {"low": (0, 50), "high": (51, 100)}
    assert classify_fgi_to_regime(25, custom) == "low"
    assert classify_fgi_to_regime(75, custom) == "high"
    assert classify_fgi_to_regime(101, custom) == "high"


def test_regime_classifier_instance():
    """Test RegimeClassifier class."""
    classifier = RegimeClassifier()
    assert classifier.classify(50) == "neutral"

    custom_classifier = RegimeClassifier(thresholds={"test": (0, 100)})
    assert custom_classifier.classify(50) == "test"


def test_classify_from_sentiment():
    """Test classification from sentiment dict."""
    classifier = RegimeClassifier()

    # Label-first precedence over numeric value
    assert (
        classifier.classify_from_sentiment({"label": "neutral", "value": 90})
        == "neutral"
    )

    # None and empty
    assert classifier.classify_from_sentiment(None) == "neutral"
    assert classifier.classify_from_sentiment({}) == "neutral"

    # Missing label falls back to numeric value
    assert classifier.classify_from_sentiment({"value": 10}) == "extreme_fear"
    assert classifier.classify_from_sentiment({"value": "90"}) == "extreme_greed"

    # Invalid label falls back to numeric value
    assert (
        classifier.classify_from_sentiment({"label": "custom_regime", "value": 90})
        == "extreme_greed"
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


def test_classify_from_sentiment_missing_label_uses_value() -> None:
    """When label is absent, numeric value is used."""
    classifier = RegimeClassifier()
    assert classifier.classify_from_sentiment({"value": 57}) == "greed"


def test_classify_from_sentiment_invalid_label_uses_value() -> None:
    """Invalid labels should not silently pass through."""
    classifier = RegimeClassifier()
    assert (
        classifier.classify_from_sentiment({"label": "not_a_regime", "value": 57})
        == "greed"
    )


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


def test_classify_from_sentiment_blank_label_falls_back_to_neutral() -> None:
    classifier = RegimeClassifier()
    assert classifier.classify_from_sentiment({"label": "   "}) == "neutral"


def test_classify_from_sentiment_invalid_numeric_value_falls_back() -> None:
    classifier = RegimeClassifier()
    assert (
        classifier.classify_from_sentiment({"label": "not_a_regime", "value": object()})
        == "neutral"
    )


def test_classify_fgi_to_regime_no_match():
    """Test classification where no threshold matches."""
    # Custom thresholds that don't cover 50
    custom = {"low": (0, 10), "high": (90, 100)}
    assert classify_fgi_to_regime(50, custom) == "neutral"
