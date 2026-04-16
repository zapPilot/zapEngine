"""
Comprehensive unit tests for custom exceptions.

Tests cover all exception types with focus on initialization, inheritance,
attributes, context handling, and error codes. Targets 100% coverage for
production-ready error handling infrastructure.
"""

from typing import Any

from src.core.exceptions import (
    CrossServiceConsistencyError,
    DatabaseError,
    DataNotFoundError,
    ServiceError,
    ValidationError,
)

# ==================== SERVICEERROR TESTS ====================


def test_service_error_full_initialization():
    """Verify ServiceError with all parameters."""
    context = {"user_id": "123", "resource": "portfolio"}
    error = ServiceError(
        "Test error",
        error_code="CUSTOM_ERROR",
        is_transient=True,
        context=context,
    )

    assert error.message == "Test error"
    assert error.error_code == "CUSTOM_ERROR"
    assert error.is_transient is True
    assert error.context == context
    assert str(error) == "Test error"


def test_service_error_minimal_initialization():
    """Verify ServiceError with minimal parameters uses defaults."""
    error = ServiceError("Minimal error")

    assert error.message == "Minimal error"
    assert error.error_code == "SERVICE_ERROR"  # Default
    assert error.is_transient is False  # Default
    assert error.context == {}  # Default empty dict
    assert str(error) == "Minimal error"


def test_service_error_context_none_becomes_empty_dict():
    """Verify context=None is converted to empty dict."""
    error = ServiceError("Test", context=None)

    assert error.context == {}
    assert isinstance(error.context, dict)


def test_service_error_context_mutation():
    """Verify context can be mutated after initialization."""
    error = ServiceError("Test")
    error.context["new_key"] = "new_value"

    assert error.context["new_key"] == "new_value"
    assert len(error.context) == 1


def test_service_error_inheritance_from_exception():
    """Verify ServiceError inherits from Exception."""
    error = ServiceError("Test")

    assert isinstance(error, Exception)
    assert isinstance(error, ServiceError)


# ==================== DATANOTFOUNDERROR TESTS ====================


def test_data_not_found_error_initialization():
    """Verify DataNotFoundError sets correct error_code."""
    error = DataNotFoundError("Resource not found")

    assert error.message == "Resource not found"
    assert error.error_code == "DATA_NOT_FOUND"
    assert error.is_transient is False  # Inherited default
    assert error.context == {}


def test_data_not_found_error_with_context():
    """Verify DataNotFoundError passes context to parent."""
    context = {"user_id": "123", "resource_type": "portfolio"}
    error = DataNotFoundError("Portfolio not found", context=context)

    assert error.context == context
    assert error.error_code == "DATA_NOT_FOUND"


def test_data_not_found_error_inheritance():
    """Verify DataNotFoundError inherits from ServiceError."""
    error = DataNotFoundError("Test")

    assert isinstance(error, ServiceError)
    assert isinstance(error, DataNotFoundError)


# ==================== DATABASEERROR TESTS ====================


def test_database_error_default_transient_true():
    """Verify DatabaseError has is_transient=True by default."""
    error = DatabaseError("Connection failed")

    assert error.message == "Connection failed"
    assert error.error_code == "DATABASE_ERROR"
    assert error.is_transient is True  # DatabaseError default
    assert error.context == {}


def test_database_error_override_transient_false():
    """Verify DatabaseError can override is_transient=False."""
    error = DatabaseError("Constraint violation", is_transient=False)

    assert error.is_transient is False
    assert error.error_code == "DATABASE_ERROR"


def test_database_error_custom_error_code():
    """Verify DatabaseError can use custom error_code."""
    error = DatabaseError("Timeout", error_code="DATABASE_TIMEOUT")

    assert error.error_code == "DATABASE_TIMEOUT"
    assert error.is_transient is True  # Still default True


def test_database_error_with_full_context():
    """Verify DatabaseError with all parameters."""
    context: dict[str, Any] = {
        "query": "SELECT * FROM portfolio",
        "duration_ms": 5000,
    }
    error = DatabaseError(
        "Query timeout",
        error_code="QUERY_TIMEOUT",
        is_transient=True,
        context=context,
    )

    assert error.message == "Query timeout"
    assert error.error_code == "QUERY_TIMEOUT"
    assert error.is_transient is True
    assert error.context == context


def test_database_error_inheritance():
    """Verify DatabaseError inherits from ServiceError."""
    error = DatabaseError("Test")

    assert isinstance(error, ServiceError)
    assert isinstance(error, DatabaseError)


# ==================== VALIDATIONERROR TESTS ====================


def test_validation_error_initialization():
    """Verify ValidationError sets correct error_code."""
    error = ValidationError("Invalid input")

    assert error.message == "Invalid input"
    assert error.error_code == "VALIDATION_ERROR"
    assert error.is_transient is False  # Inherited default
    assert error.context == {}


def test_validation_error_with_context():
    """Verify ValidationError passes context to parent."""
    context = {"field": "email", "value": "invalid"}
    error = ValidationError("Email validation failed", context=context)

    assert error.context == context
    assert error.context["field"] == "email"


def test_validation_error_inheritance():
    """Verify ValidationError inherits from ServiceError."""
    error = ValidationError("Test")

    assert isinstance(error, ServiceError)
    assert isinstance(error, ValidationError)


# ==================== CROSSSERVICECONSISTENCYERROR TESTS ====================


def test_cross_service_consistency_error_initialization():
    """Verify CrossServiceConsistencyError sets specific error_code."""
    error = CrossServiceConsistencyError("Data mismatch detected")

    assert error.message == "Data mismatch detected"
    assert error.error_code == "CROSS_SERVICE_CONSISTENCY_ERROR"
    assert error.is_transient is False  # Inherited from ValidationError


def test_cross_service_consistency_error_with_context():
    """Verify CrossServiceConsistencyError context handling."""
    context = {
        "snapshot_total": 10000.0,
        "wallet_total": 10500.0,
        "difference": 500.0,
        "threshold": 0.05,
    }
    error = CrossServiceConsistencyError("Totals exceed 5% threshold", context=context)

    assert error.context == context
    assert error.error_code == "CROSS_SERVICE_CONSISTENCY_ERROR"


def test_cross_service_consistency_error_inheritance_chain():
    """Verify CrossServiceConsistencyError full inheritance chain."""
    error = CrossServiceConsistencyError("Test")

    assert isinstance(error, ServiceError)
    assert isinstance(error, ValidationError)
    assert isinstance(error, CrossServiceConsistencyError)


def test_cross_service_consistency_error_code_override():
    """Verify error_code is overridden after parent __init__."""
    error = CrossServiceConsistencyError("Test")

    # Should NOT be VALIDATION_ERROR (parent), should be specific code
    assert error.error_code != "VALIDATION_ERROR"
    assert error.error_code == "CROSS_SERVICE_CONSISTENCY_ERROR"
