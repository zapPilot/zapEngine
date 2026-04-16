import logging
from datetime import UTC, datetime
from typing import Any

from fastapi import Request
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)


def create_error_response(
    error_code: str,
    message: str,
    status_code: int = 500,
    details: dict[str, Any] | None = None,
    request_id: str | None = None,
) -> JSONResponse:
    """Create a standardized error response"""
    content: dict[str, Any] = {
        "error": {
            "code": error_code,
            "message": message,
            "timestamp": datetime.now(UTC).isoformat(),
        }
    }

    if details:
        content["error"]["details"] = details

    if request_id:
        content["error"]["request_id"] = request_id

    return JSONResponse(
        status_code=status_code,
        content=content,
    )


async def generic_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Handle all other unhandled exceptions"""
    # Log detailed error information for internal debugging
    logger.error(
        f"Unhandled exception for {request.method} {request.url}: {exc}",
        exc_info=True,
        extra={
            "url": str(request.url),
            "method": request.method,
            "exception_type": type(exc).__name__,
        },
    )

    try:
        request_id = getattr(request.state, "request_id", None)
        # Ensure request_id is a string or None, not a mock
        if request_id is not None and not isinstance(request_id, str):
            request_id = None
    except AttributeError:
        request_id = None

    # Return generic error message to client (don't leak internal details)
    return create_error_response(
        error_code="INTERNAL_ERROR",
        message="An unexpected internal server error occurred",
        status_code=500,
        request_id=request_id,
    )
