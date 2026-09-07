import logging
from datetime import UTC, datetime
from typing import Any, cast

from fastapi import HTTPException, Request, Response
from fastapi.exception_handlers import http_exception_handler as fastapi_http_exception_handler
from fastapi.responses import JSONResponse

from src.core.sentry import capture_server_exception

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


async def sentry_http_exception_handler(
    request: Request,
    exc: Exception,
) -> Response:
    """Capture router-translated server errors before returning HTTP responses.

    FastAPI treats ``HTTPException`` as a handled response, so an internal
    exception converted by a router with ``raise HTTPException(...) from error``
    never reaches ``generic_exception_handler``. Preserve the normal FastAPI
    response while reporting only caused 5xx errors. Direct HTTP errors such as
    health-check 503s have no cause and expected caller 4xx responses stay quiet.
    """
    http_error = cast(HTTPException, exc)
    cause = http_error.__cause__
    if http_error.status_code >= 500 and isinstance(cause, Exception):
        capture_server_exception(cause, request)

    return await fastapi_http_exception_handler(request, http_error)


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
    capture_server_exception(exc, request)

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
