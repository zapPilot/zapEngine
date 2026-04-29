"""Unit tests for market sentiment custom exceptions."""

from src.exceptions.market_sentiment import (
    BadGatewayError,
    ExternalAPIError,
    GatewayTimeoutError,
    InternalError,
    MarketSentimentError,
    ServiceUnavailableError,
)


class TestMarketSentimentError:
    """Tests for MarketSentimentError base class."""

    def test_full_initialization(self):
        """Verify MarketSentimentError with all parameters."""
        details = {"extra": "info", "count": 42}
        error = MarketSentimentError(
            message="Test error",
            status_code=400,
            error_code="TEST_ERROR",
            details=details,
        )

        assert error.message == "Test error"
        assert error.status_code == 400
        assert error.error_code == "TEST_ERROR"
        assert error.details == details
        assert str(error) == "Test error"

    def test_minimal_initialization(self):
        """Verify MarketSentimentError with minimal parameters."""
        error = MarketSentimentError(
            message="Minimal error",
            status_code=500,
            error_code="MINIMAL",
        )

        assert error.message == "Minimal error"
        assert error.status_code == 500
        assert error.error_code == "MINIMAL"
        assert error.details == {}

    def test_details_defaults_to_empty_dict(self):
        """Verify details=None becomes empty dict."""
        error = MarketSentimentError(
            message="Test",
            status_code=500,
            error_code="TEST",
            details=None,
        )

        assert error.details == {}
        assert isinstance(error.details, dict)

    def test_to_detail_dict_without_details(self):
        """Verify to_detail_dict() without details."""
        error = MarketSentimentError(
            message="Test error",
            status_code=400,
            error_code="TEST_ERROR",
        )

        detail = error.to_detail_dict()

        assert detail["error"] == "TEST_ERROR"
        assert detail["message"] == "Test error"
        assert "details" not in detail

    def test_to_detail_dict_with_details(self):
        """Verify to_detail_dict() with details."""
        details = {"key": "value", "count": 10}
        error = MarketSentimentError(
            message="Test error",
            status_code=400,
            error_code="TEST_ERROR",
            details=details,
        )

        detail = error.to_detail_dict()

        assert detail["error"] == "TEST_ERROR"
        assert detail["message"] == "Test error"
        assert detail["details"] == details


class TestExternalAPIError:
    """Tests for ExternalAPIError subclass."""

    def test_inheritance(self):
        """Verify ExternalAPIError inherits from MarketSentimentError."""
        error = ExternalAPIError(
            message="API error",
            status_code=502,
            error_code="API_ERROR",
        )

        assert isinstance(error, MarketSentimentError)

    def test_initialization(self):
        """Verify ExternalAPIError initialization."""
        error = ExternalAPIError(
            message="External API failed",
            status_code=502,
            error_code="EXTERNAL_ERROR",
        )

        assert error.message == "External API failed"
        assert error.status_code == 502
        assert error.error_code == "EXTERNAL_ERROR"


class TestServiceUnavailableError:
    """Tests for ServiceUnavailableError subclass."""

    def test_initialization_with_defaults(self):
        """Verify ServiceUnavailableError with default retry_after."""
        error = ServiceUnavailableError(
            status_code=503,
            response_text="Service down",
        )

        assert error.message == "Market sentiment data temporarily unavailable"
        assert error.status_code == 503
        assert error.error_code == "SERVICE_UNAVAILABLE"
        assert error.details["retryAfter"] == 60
        assert error.details["externalStatus"] == 503
        assert "Service down" in error.details["externalResponse"]

    def test_initialization_with_custom_retry(self):
        """Verify ServiceUnavailableError with custom retry_after."""
        error = ServiceUnavailableError(
            status_code=503,
            response_text="Service down",
            retry_after=120,
        )

        assert error.details["retryAfter"] == 120

    def test_long_response_truncated(self):
        """Verify long response text is truncated."""
        long_response = "x" * 500
        error = ServiceUnavailableError(
            status_code=503,
            response_text=long_response,
        )

        assert len(error.details["externalResponse"]) <= 200


class TestGatewayTimeoutError:
    """Tests for GatewayTimeoutError subclass."""

    def test_initialization_with_defaults(self):
        """Verify GatewayTimeoutError with default retry_after."""
        error = GatewayTimeoutError(timeout_seconds=30.0)

        assert error.message == "Request to sentiment provider timed out"
        assert error.status_code == 504
        assert error.error_code == "GATEWAY_TIMEOUT"
        assert error.details["timeoutSeconds"] == 30.0
        assert error.details["retryAfter"] == 60

    def test_initialization_with_custom_retry(self):
        """Verify GatewayTimeoutError with custom retry_after."""
        error = GatewayTimeoutError(timeout_seconds=30.0, retry_after=90)

        assert error.details["retryAfter"] == 90

    def test_inheritance(self):
        """Verify GatewayTimeoutError inherits from ExternalAPIError."""
        error = GatewayTimeoutError(timeout_seconds=30.0)

        assert isinstance(error, ExternalAPIError)
        assert isinstance(error, MarketSentimentError)


class TestBadGatewayError:
    """Tests for BadGatewayError subclass."""

    def test_initialization(self):
        """Verify BadGatewayError initialization."""
        error = BadGatewayError(reason="Invalid JSON response")

        assert error.message == "Invalid response from sentiment provider"
        assert error.status_code == 502
        assert error.error_code == "BAD_GATEWAY"
        assert error.details["reason"] == "Invalid JSON response"

    def test_inheritance(self):
        """Verify BadGatewayError inherits from ExternalAPIError."""
        error = BadGatewayError(reason="test")

        assert isinstance(error, ExternalAPIError)
        assert isinstance(error, MarketSentimentError)


class TestInternalError:
    """Tests for InternalError subclass."""

    def test_initialization(self):
        """Verify InternalError initialization."""
        error = InternalError(reason="Database connection failed")

        assert (
            error.message == "An unexpected error occurred: Database connection failed"
        )
        assert error.status_code == 500
        assert error.error_code == "INTERNAL_ERROR"
        assert error.details["reason"] == "Database connection failed"

    def test_inheritance(self):
        """Verify InternalError inherits from MarketSentimentError."""
        error = InternalError(reason="test")

        assert isinstance(error, MarketSentimentError)
