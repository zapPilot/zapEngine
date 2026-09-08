"""
Quant Engine - Analytics backend for portfolio management and DeFi data aggregation
"""
# Force reload for SQL query cache refresh

import logging
import os
import time
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from typing import cast

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from src.api.error_handling import (
    generic_exception_handler,
    sentry_http_exception_handler,
)
from src.api.routers import (
    backtesting,
    borrowing,
    market,
    v2_analytics,
    v2_portfolio,
    v3_strategy,
)
from src.core.cache_service import analytics_cache
from src.core.config import settings
from src.core.database import db_manager
from src.core.database import health_check as db_health_check
from src.core.exceptions import (
    DatabaseError,
    DataIntegrityError,
    DataNotFoundError,
    ServiceError,
)
from src.core.logging_config import configure_logging, log_request_completion
from src.core.sentry import capture_server_exception, init_sentry

# Ahead of init_sentry so the Sentry startup line below is not itself discarded.
configure_logging()

logger = logging.getLogger(__name__)

_sentry_release = os.getenv("APP_COMMIT_SHA")
_sentry_enabled = init_sentry(
    settings.sentry_analytics_engine_dsn,
    environment=settings.environment.value,
    release=_sentry_release,
)
logger.info(
    "[sentry] %s environment=%s release=%s",
    "enabled" if _sentry_enabled else "disabled",
    settings.environment.value,
    _sentry_release or "unknown",
)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Application lifespan manager for startup and shutdown events"""
    logger.info("Starting Quant Engine...")

    # Initialize database
    db_manager.init_database()

    logger.info("Quant Engine startup complete")
    yield
    logger.info("Shutting down Quant Engine...")

    db_manager.close_database()


app = FastAPI(
    title="Quant Engine",
    description="Analytics backend for portfolio management and DeFi data aggregation",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

app.add_exception_handler(Exception, generic_exception_handler)
app.add_exception_handler(HTTPException, sentry_http_exception_handler)


def create_service_error_handler(
    default_message: str,
    default_status: int = 500,
    log_errors: bool = True,
) -> Callable[[Request, Exception], Awaitable[JSONResponse]]:
    """
    Factory for creating standardized service error handlers.

    Args:
        default_message: User-facing error message
        default_status: HTTP status code (default: 500)
        log_errors: Whether to log errors (default: True)

    Returns:
        Async exception handler function
    """

    async def handler(request: Request, exc: Exception) -> JSONResponse:
        """Handle service errors with consistent format and optional logging."""
        # Extract error attributes with fallbacks for non-ServiceError exceptions
        error_message = getattr(exc, "message", str(exc))
        error_code = getattr(exc, "error_code", "UNKNOWN_ERROR")
        error_context = getattr(exc, "context", {})

        if log_errors:
            logger.error(
                f"{default_message}: {error_message}",
                exc_info=True,
                extra={"error_code": error_code, "path": request.url.path},
            )

        # Environment-aware error detail
        detail = (
            error_message
            if (settings.is_development or settings.is_staging)
            else "Please contact support if the issue persists"
        )

        # Use transient status if available, otherwise default status
        status_code = 503 if getattr(exc, "is_transient", False) else default_status

        if status_code >= 500:
            capture_server_exception(exc, request)

        return JSONResponse(
            status_code=status_code,
            content={
                "error_code": error_code,
                "message": default_message,
                "detail": detail,
                "context": error_context,
                "transient": getattr(exc, "is_transient", False),
            },
        )

    return handler


# Register exception handlers with standardized factory
app.add_exception_handler(
    DataNotFoundError,
    create_service_error_handler(
        "Resource not found", default_status=404, log_errors=False
    ),
)
app.add_exception_handler(
    DatabaseError,
    create_service_error_handler("A database error occurred"),
)
app.add_exception_handler(
    ServiceError,
    create_service_error_handler("A service error occurred"),
)


async def data_integrity_error_handler(
    request: Request, exc: Exception
) -> JSONResponse:
    """Handle data integrity errors with 500 status (not user's fault)."""
    integrity_error = cast(DataIntegrityError, exc)
    logger.error(
        "Data integrity error: %s",
        integrity_error.message,
        extra={
            "error_code": integrity_error.error_code,
            "context": integrity_error.context,
        },
    )
    capture_server_exception(integrity_error, request)

    return JSONResponse(
        status_code=500,
        content={
            "error": integrity_error.error_code,
            "message": integrity_error.message,
            "details": integrity_error.context,
        },
    )


app.add_exception_handler(DataIntegrityError, data_integrity_error_handler)


@app.middleware("http")
async def record_request_timing(
    request: Request,
    call_next: Callable[[Request], Awaitable[Response]],
) -> Response:
    """Time every request so a slow handler leaves a trace behind it."""
    started_at = time.perf_counter()
    # An exception escaping here is turned into a 500 by ServerErrorMiddleware,
    # which sits outside this middleware, so record it as one.
    status_code = 500
    try:
        response = await call_next(request)
        status_code = response.status_code
        return response
    finally:
        log_request_completion(
            method=request.method,
            route=_route_template(request),
            status_code=status_code,
            duration_ms=(time.perf_counter() - started_at) * 1000,
            user_id=_request_user_id(request),
        )


def _route_template(request: Request) -> str:
    """Prefer the route pattern so per-user paths do not explode log cardinality."""
    route_path = getattr(request.scope.get("route"), "path", None)
    return route_path if isinstance(route_path, str) else request.url.path


def _request_user_id(request: Request) -> str | None:
    """Return the portfolio owner this request addressed, when the route has one."""
    path_params = request.scope.get("path_params")
    if not isinstance(path_params, dict):
        return None
    user_id = path_params.get("user_id")
    return str(user_id) if user_id is not None else None


# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_origin_regex=settings.cors_allow_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API routers - V2 endpoints only
app.include_router(v2_analytics.router, prefix="/api")
app.include_router(v2_portfolio.router, prefix="/api")
app.include_router(borrowing.router, prefix="/api")
app.include_router(market.router, prefix="/api/v2")
app.include_router(backtesting.router, prefix="/api")

# V3 Strategy endpoints
app.include_router(v3_strategy.router, prefix="/api")


@app.get("/")
async def root() -> dict[str, str]:
    """Health check endpoint"""
    return {"service": "Quant Engine", "version": "0.1.0", "status": "healthy"}


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    """Lightweight readiness endpoint for platform health checks."""
    return {"status": "ok"}


@app.get("/health")
async def health_check() -> dict[str, object]:
    """Detailed health check"""
    checks: dict[str, str] = {}
    health_status: dict[str, object] = {
        "service": "Quant Engine",
        "version": "0.1.0",
        "status": "healthy",
        "checks": checks,
        "config": {
            "read_only_mode": settings.is_read_only,
            "environment": settings.environment.value,
        },
    }

    # Database health
    try:
        db_health_check()
        db_status = "healthy"
        if settings.is_read_only:
            db_status += " (read-only)"
    except Exception as e:
        db_status = f"unhealthy: {str(e)}"
        health_status["status"] = "unhealthy"

    checks["database"] = db_status
    health_status["cache"] = analytics_cache.get_stats()

    if health_status["status"] == "unhealthy":
        raise HTTPException(status_code=503, detail=health_status)

    return health_status


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "src.main:app",
        host="0.0.0.0",
        port=settings.port,
        reload=settings.debug,
        reload_includes=["*.py", "*.sql"],
        log_level="info",
    )
