"""
Comprehensive tests for error_handling.py to improve coverage from 71% to 100%

Tests all error scenarios, exception handling, and logging behavior.
"""

import json
from unittest.mock import Mock, patch

import pytest
from fastapi import Request, status
from fastapi.responses import JSONResponse

from src.api.error_handling import generic_exception_handler


class TestGenericExceptionHandler:
    """Test generic_exception_handler with various scenarios"""

    @pytest.fixture
    def mock_request(self):
        """Create mock FastAPI request"""
        request = Mock(spec=Request)
        request.url = "https://api.example.com/test-endpoint"
        return request

    @pytest.mark.asyncio
    async def test_generic_exception_handler_generic_exception(self, mock_request):
        """Test handling of generic Exception"""
        test_exception = Exception("Database connection failed")

        with patch("src.api.error_handling.logger") as mock_logger:
            response = await generic_exception_handler(mock_request, test_exception)

            # Verify logging behavior
            mock_logger.error.assert_called_once()
            log_call_args = mock_logger.error.call_args
            assert (
                "Unhandled exception for" in log_call_args[0][0]
                and "https://api.example.com/test-endpoint" in log_call_args[0][0]
            )
            assert "Database connection failed" in log_call_args[0][0]
            assert log_call_args[1]["exc_info"] is True

            # Verify response
            assert isinstance(response, JSONResponse)
            assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR

            # Parse response body to check structure
            response_data = json.loads(response.body)
            assert "error" in response_data
            assert response_data["error"]["code"] == "INTERNAL_ERROR"
            assert (
                response_data["error"]["message"]
                == "An unexpected internal server error occurred"
            )
            assert "timestamp" in response_data["error"]

    @pytest.mark.asyncio
    async def test_generic_exception_handler_value_error(self, mock_request):
        """Test handling of ValueError"""
        test_exception = ValueError("Invalid user input provided")

        with patch("src.api.error_handling.logger") as mock_logger:
            response = await generic_exception_handler(mock_request, test_exception)

            # Verify logging captures specific exception type
            mock_logger.error.assert_called_once()
            log_message = mock_logger.error.call_args[0][0]
            assert "Invalid user input provided" in log_message
            assert mock_request.url in log_message

            # Verify generic response (no sensitive info leaked)
            assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR

            # Parse response body to check structure
            response_data = json.loads(response.body)
            assert "error" in response_data
            assert response_data["error"]["code"] == "INTERNAL_ERROR"
            assert (
                response_data["error"]["message"]
                == "An unexpected internal server error occurred"
            )
            assert "timestamp" in response_data["error"]

    @pytest.mark.asyncio
    async def test_generic_exception_handler_runtime_error(self, mock_request):
        """Test handling of RuntimeError with sensitive information"""
        # Exception with potentially sensitive info that shouldn't be exposed
        test_exception = RuntimeError(
            "API key abc123xyz expired for user john@example.com"
        )

        with patch("src.api.error_handling.logger") as mock_logger:
            response = await generic_exception_handler(mock_request, test_exception)

            # Verify sensitive info is logged for debugging
            mock_logger.error.assert_called_once()
            log_message = mock_logger.error.call_args[0][0]
            assert "API key abc123xyz expired" in log_message
            assert "john@example.com" in log_message

            # Verify sensitive info is NOT in response
            response_body = response.body.decode()
            assert "abc123xyz" not in response_body
            assert "john@example.com" not in response_body
            assert "An unexpected internal server error occurred" in response_body

    @pytest.mark.asyncio
    async def test_generic_exception_handler_with_complex_url(self, mock_request):
        """Test handler with complex URL containing parameters"""
        mock_request.url = "https://api.example.com/portfolio/user123?include=tokens"
        test_exception = ConnectionError("Service temporarily unavailable")

        with patch("src.api.error_handling.logger") as mock_logger:
            response = await generic_exception_handler(mock_request, test_exception)

            # Verify URL is properly logged
            mock_logger.error.assert_called_once()
            log_message = mock_logger.error.call_args[0][0]
            assert (
                "https://api.example.com/portfolio/user123?include=tokens"
                in log_message
            )
            assert "Service temporarily unavailable" in log_message

            # Verify response consistency
            assert response.status_code == 500
            assert isinstance(response, JSONResponse)

    @pytest.mark.asyncio
    async def test_generic_exception_handler_logging_configuration(self, mock_request):
        """Test that exc_info parameter enables full traceback logging"""
        test_exception = KeyError("Missing required field 'wallet_address'")
        mock_request.method = "GET"  # Set method for the log message

        with patch("src.api.error_handling.logger") as mock_logger:
            await generic_exception_handler(mock_request, test_exception)

            # Verify exc_info=True enables full exception traceback
            mock_logger.error.assert_called_once_with(
                f"Unhandled exception for {mock_request.method} {mock_request.url}: {test_exception}",
                exc_info=True,
                extra={
                    "url": str(mock_request.url),
                    "method": mock_request.method,
                    "exception_type": "KeyError",
                },
            )

    @pytest.mark.asyncio
    async def test_generic_exception_handler_response_format(self, mock_request):
        """Test response format consistency"""
        test_exception = IndexError("List index out of range")

        response = await generic_exception_handler(mock_request, test_exception)

        # Verify response structure
        assert isinstance(response, JSONResponse)
        assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
        assert hasattr(response, "body")
        assert hasattr(response, "status_code")
