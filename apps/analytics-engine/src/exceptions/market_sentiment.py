"""
Custom exceptions for Market Sentiment Service.

Provides domain-specific exceptions with structured error details
for better error handling and API responses.
"""

from typing import Any


class MarketSentimentError(Exception):
    """Base exception for market sentiment service errors."""

    def __init__(
        self,
        message: str,
        status_code: int,
        error_code: str,
        details: dict[str, Any] | None = None,
    ) -> None:
        """
        Initialize market sentiment error.

        Args:
            message: Human-readable error message
            status_code: HTTP status code
            error_code: Machine-readable error code
            details: Optional additional error details
        """
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.error_code = error_code
        self.details = details or {}

    def to_detail_dict(self) -> dict[str, Any]:
        """
        Convert exception to FastAPI HTTPException detail format.

        Returns:
            dict: Structured error detail
        """
        detail: dict[str, Any] = {
            "error": self.error_code,
            "message": self.message,
        }
        if self.details:
            detail["details"] = self.details
        return detail


class ExternalAPIError(MarketSentimentError):
    """Base exception for external API-related errors."""

    pass


class ServiceUnavailableError(ExternalAPIError):
    """External API service is temporarily unavailable (503)."""

    def __init__(self, status_code: int, response_text: str, retry_after: int = 60):
        """
        Initialize service unavailable error.

        Args:
            status_code: The HTTP status code returned by external API
            response_text: Response text from external API
            retry_after: Suggested retry delay in seconds
        """
        super().__init__(
            message="Market sentiment data temporarily unavailable",
            status_code=503,
            error_code="SERVICE_UNAVAILABLE",
            details={
                "retryAfter": retry_after,
                "externalStatus": status_code,
                "externalResponse": response_text[:200],  # Truncate for safety
            },
        )


class GatewayTimeoutError(ExternalAPIError):
    """Request to external API timed out (504)."""

    def __init__(self, timeout_seconds: float, retry_after: int = 60):
        """
        Initialize gateway timeout error.

        Args:
            timeout_seconds: The timeout value that was exceeded
            retry_after: Suggested retry delay in seconds
        """
        super().__init__(
            message="Request to sentiment provider timed out",
            status_code=504,
            error_code="GATEWAY_TIMEOUT",
            details={
                "retryAfter": retry_after,
                "timeoutSeconds": timeout_seconds,
            },
        )


class BadGatewayError(ExternalAPIError):
    """Invalid response from external API (502)."""

    def __init__(self, reason: str):
        """
        Initialize bad gateway error.

        Args:
            reason: Description of why the response was invalid
        """
        super().__init__(
            message="Invalid response from sentiment provider",
            status_code=502,
            error_code="BAD_GATEWAY",
            details={"reason": reason},
        )


class InternalError(MarketSentimentError):
    """Unexpected internal error (500)."""

    def __init__(self, reason: str):
        """
        Initialize internal error.

        Args:
            reason: Description of the internal error
        """
        super().__init__(
            message=f"An unexpected error occurred: {reason}",
            status_code=500,
            error_code="INTERNAL_ERROR",
            details={"reason": reason},
        )
