"""Custom exceptions for analytics engine."""

from __future__ import annotations

from typing import Any


class ServiceError(Exception):
    """Base exception for service-layer errors with rich context."""

    def __init__(
        self,
        message: str,
        *,
        error_code: str = "SERVICE_ERROR",
        is_transient: bool = False,
        context: dict[str, Any] | None = None,
    ):
        self.message = message
        self.error_code = error_code
        self.is_transient = is_transient
        self.context = context or {}
        super().__init__(message)


class DataNotFoundError(ServiceError):
    """Raised when requested data doesn't exist."""

    def __init__(self, message: str, *, context: dict[str, Any] | None = None):
        super().__init__(message, error_code="DATA_NOT_FOUND", context=context)


class DatabaseError(ServiceError):
    """Raised for database operation failures."""

    def __init__(
        self,
        message: str,
        *,
        error_code: str = "DATABASE_ERROR",
        is_transient: bool = True,
        context: dict[str, Any] | None = None,
    ):
        super().__init__(
            message,
            error_code=error_code,
            is_transient=is_transient,
            context=context,
        )


class ValidationError(ServiceError):
    """Raised for data validation failures."""

    def __init__(self, message: str, *, context: dict[str, Any] | None = None):
        super().__init__(message, error_code="VALIDATION_ERROR", context=context)


class CrossServiceConsistencyError(ValidationError):
    """Raised when data inconsistency is detected across service boundaries.

    This error indicates a mismatch between aggregated data from different sources
    that exceeds acceptable tolerance thresholds (e.g., snapshot vs wallet totals).
    """

    def __init__(self, message: str, *, context: dict[str, Any] | None = None):
        super().__init__(message, context=context)
        # Override error_code to be more specific
        self.error_code = "CROSS_SERVICE_CONSISTENCY_ERROR"


class DataIntegrityError(ValidationError):
    """Raised when data integrity violations are detected.

    Indicates problems with data quality, query logic, or aggregation
    that produce invalid values (NULL required fields, negative totals).
    """

    def __init__(self, message: str, *, context: dict[str, Any] | None = None):
        super().__init__(message, context=context)
        self.error_code = "DATA_INTEGRITY_ERROR"
