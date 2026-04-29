"""Unit tests for API error handling utilities."""

import json
from datetime import datetime
from unittest.mock import MagicMock, patch

import pytest

from src.api.error_handling import create_error_response, generic_exception_handler


class TestCreateErrorResponse:
    """Tests for create_error_response function."""

    def test_minimal_parameters(self):
        """Verify create_error_response with only required parameters."""
        response = create_error_response(
            error_code="TEST_ERROR",
            message="Test message",
        )

        assert response.status_code == 500
        content = json.loads(response.body)
        assert content["error"]["code"] == "TEST_ERROR"
        assert content["error"]["message"] == "Test message"
        assert "timestamp" in content["error"]

    def test_custom_status_code(self):
        """Verify create_error_response with custom status code."""
        response = create_error_response(
            error_code="NOT_FOUND",
            message="Resource not found",
            status_code=404,
        )

        assert response.status_code == 404

    def test_with_details(self):
        """Verify create_error_response with details."""
        details = {"field": "value", "count": 42}
        response = create_error_response(
            error_code="VALIDATION_ERROR",
            message="Validation failed",
            status_code=400,
            details=details,
        )

        content = json.loads(response.body)
        assert content["error"]["details"] == details

    def test_with_request_id(self):
        """Verify create_error_response with request_id."""
        response = create_error_response(
            error_code="AUTH_ERROR",
            message="Authentication failed",
            status_code=401,
            request_id="req-123-abc",
        )

        content = json.loads(response.body)
        assert content["error"]["request_id"] == "req-123-abc"

    def test_timestamp_is_iso_format(self):
        """Verify timestamp is in ISO format."""
        response = create_error_response(
            error_code="TEST",
            message="Test",
        )

        content = json.loads(response.body)
        timestamp = content["error"]["timestamp"]
        datetime.fromisoformat(timestamp.replace("Z", "+00:00"))

    def test_all_parameters_combined(self):
        """Verify create_error_response with all parameters."""
        details = {"extra": "info"}
        response = create_error_response(
            error_code="FULL_ERROR",
            message="Full error message",
            status_code=422,
            details=details,
            request_id="req-full-456",
        )

        content = json.loads(response.body)
        body = content["error"]
        assert body["code"] == "FULL_ERROR"
        assert body["message"] == "Full error message"
        assert body["details"] == details
        assert body["request_id"] == "req-full-456"
        assert response.status_code == 422


class TestGenericExceptionHandler:
    """Tests for generic_exception_handler function."""

    @pytest.mark.asyncio
    async def test_returns_500_with_internal_error_message(self):
        """Verify handler returns generic message to client."""
        mock_request = MagicMock()
        mock_request.method = "GET"
        mock_request.url = MagicMock()
        mock_request.url.__str__ = MagicMock(return_value="/api/test")
        mock_request.state = MagicMock()

        response = await generic_exception_handler(
            mock_request, Exception("Secret internal error")
        )

        assert response.status_code == 500
        content = json.loads(response.body)
        assert "internal server error" in content["error"]["message"].lower()
        assert "Secret" not in content["error"]["message"]

    @pytest.mark.asyncio
    async def test_includes_request_id_when_available(self):
        """Verify handler includes request_id from request state."""
        mock_request = MagicMock()
        mock_request.method = "POST"
        mock_request.url = MagicMock()
        mock_request.url.__str__ = MagicMock(return_value="/api/create")
        mock_request.state.request_id = "req-789-xyz"

        response = await generic_exception_handler(mock_request, Exception("Error"))

        content = json.loads(response.body)
        assert content["error"]["request_id"] == "req-789-xyz"

    @pytest.mark.asyncio
    async def test_handles_missing_request_state(self):
        """Verify handler handles missing request.state gracefully."""
        mock_request = MagicMock()
        mock_request.method = "GET"
        mock_request.url = MagicMock()
        mock_request.url.__str__ = MagicMock(return_value="/api/test")
        mock_request.state = MagicMock(spec=[])

        response = await generic_exception_handler(mock_request, Exception("Error"))

        assert response.status_code == 500
        content = json.loads(response.body)
        assert "request_id" not in content["error"]

    @pytest.mark.asyncio
    async def test_handles_non_string_request_id(self):
        """Verify handler handles non-string request_id gracefully."""
        mock_request = MagicMock()
        mock_request.method = "GET"
        mock_request.url = MagicMock()
        mock_request.url.__str__ = MagicMock(return_value="/api/test")
        mock_request.state.request_id = 12345

        response = await generic_exception_handler(mock_request, Exception("Error"))

        assert response.status_code == 500
        content = json.loads(response.body)
        assert "request_id" not in content["error"]

    @pytest.mark.asyncio
    async def test_handles_attribute_error_on_request_id(self):
        """Verify handler handles AttributeError when accessing request_id."""
        mock_request = MagicMock()
        mock_request.method = "GET"
        mock_request.url = MagicMock()
        mock_request.url.__str__ = MagicMock(return_value="/api/test")

        del mock_request.state

        response = await generic_exception_handler(mock_request, Exception("Error"))

        assert response.status_code == 500

    @pytest.mark.asyncio
    async def test_logs_error_details(self):
        """Verify handler logs detailed error information."""
        mock_request = MagicMock()
        mock_request.method = "POST"
        mock_request.url = MagicMock()
        mock_request.url.__str__ = MagicMock(return_value="/api/data")
        mock_request.state = MagicMock()
        mock_request.state.request_id = "req-log-123"

        with patch("src.api.error_handling.logger") as mock_logger:
            await generic_exception_handler(mock_request, ValueError("Test error"))

            mock_logger.error.assert_called_once()
            call_args = mock_logger.error.call_args
            assert "Test error" in str(call_args)
