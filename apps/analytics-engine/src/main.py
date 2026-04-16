"""
Quant Engine - Analytics backend for portfolio management and DeFi data aggregation
"""
# Force reload for SQL query cache refresh

import logging
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from typing import cast

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from src.api.error_handling import generic_exception_handler
from src.api.routers import (
    backtesting,
    borrowing,
    market,
    v2_analytics,
    v2_pools,
    v2_portfolio,
    v3_strategy,
)
from src.core.config import settings
from src.core.database import db_manager
from src.core.database import health_check as db_health_check
from src.core.exceptions import (
    DatabaseError,
    DataIntegrityError,
    DataNotFoundError,
    ServiceError,
)

logger = logging.getLogger(__name__)


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

    return JSONResponse(
        status_code=500,
        content={
            "error": integrity_error.error_code,
            "message": integrity_error.message,
            "details": integrity_error.context,
        },
    )


app.add_exception_handler(DataIntegrityError, data_integrity_error_handler)


# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API routers - V2 endpoints only
app.include_router(v2_analytics.router, prefix="/api")
app.include_router(v2_pools.router, prefix="/api")
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
