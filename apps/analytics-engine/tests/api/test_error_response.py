"""
Tests for error response creation functionality.

Tests the remaining error handling functionality after dead code cleanup.
"""

import json
from datetime import UTC, datetime
from unittest.mock import patch

from fastapi.responses import JSONResponse

from src.api.error_handling import create_error_response


class TestCreateErrorResponse:
    """Test create_error_response function"""

    def test_create_error_response_basic(self):
        """Test basic error response creation"""
        with patch("src.api.error_handling.datetime") as mock_datetime:
            mock_now = datetime(2024, 1, 1, 12, 0, 0, tzinfo=UTC)
            mock_datetime.now.return_value = mock_now
            mock_datetime.UTC = UTC

            response = create_error_response("TEST_ERROR", "Test message")

            assert isinstance(response, JSONResponse)
            assert response.status_code == 500

            content = json.loads(response.body)
            assert content["error"]["code"] == "TEST_ERROR"
            assert content["error"]["message"] == "Test message"
            assert content["error"]["timestamp"] == "2024-01-01T12:00:00+00:00"

    def test_create_error_response_with_details_and_request_id(self):
        """Test error response with optional fields"""
        with patch("src.api.error_handling.datetime") as mock_datetime:
            mock_now = datetime(2024, 1, 1, 12, 0, 0, tzinfo=UTC)
            mock_datetime.now.return_value = mock_now
            mock_datetime.UTC = UTC

            details = {"field": "user_id", "value": "invalid"}
            response = create_error_response(
                "VALIDATION_ERROR",
                "Invalid input",
                status_code=400,
                details=details,
                request_id="req-123",
            )

            assert response.status_code == 400

            content = json.loads(response.body)
            assert content["error"]["code"] == "VALIDATION_ERROR"
            assert content["error"]["message"] == "Invalid input"
            assert content["error"]["details"] == details
            assert content["error"]["request_id"] == "req-123"

    def test_create_error_response_without_optional_fields(self):
        """Test error response without details or request_id"""
        with patch("src.api.error_handling.datetime") as mock_datetime:
            mock_now = datetime(2024, 1, 1, 12, 0, 0, tzinfo=UTC)
            mock_datetime.now.return_value = mock_now
            mock_datetime.UTC = UTC

            response = create_error_response("NOT_FOUND", "Resource not found", 404)

            content = json.loads(response.body)
            assert "details" not in content["error"]
            assert "request_id" not in content["error"]
