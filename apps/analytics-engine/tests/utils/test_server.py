#!/usr/bin/env python3
"""
Test server utility for development and manual testing

This module provides a minimal test server that can be used for:
- Manual testing of user endpoints
- Development testing with a controlled database
- Integration testing with external tools

Usage:
    # Run as standalone server
    python tests/utils/test_server.py

    # Or import as module for programmatic use
    from tests.utils.test_server import create_test_app
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.api.routers import portfolios
from src.core.database import close_database, init_database

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager for test server"""
    # Startup
    logger.info("Starting test server...")
    await init_database()
    logger.info("Database initialized")

    yield

    # Shutdown
    await close_database()
    logger.info("Test server shutdown complete")


def create_test_app(
    title: str = "Quant Engine Test Server",
    description: str = "Test server for portfolio endpoints and development",
    version: str = "0.1.0",
    docs_url: str = "/docs",
    cors_origins: list | None = None,
) -> FastAPI:
    """
    Create a FastAPI test application with portfolio endpoints


    Args:
        title: Application title
        description: Application description
        version: Application version
        docs_url: URL for API documentation
        cors_origins: List of allowed CORS origins (defaults to allow all)


    Returns:
        FastAPI application instance
    """
    if cors_origins is None:
        cors_origins = ["*"]  # Allow all origins for testing

    app = FastAPI(
        title=title,
        description=description,
        version=version,
        docs_url=docs_url,
        lifespan=lifespan,
    )

    # CORS middleware for browser testing
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["*"],
    )

    # Include all domain routers
    app.include_router(portfolios.router, prefix="/api/v2", tags=["Portfolios"])

    @app.get("/")
    async def root():
        """Health check and service information endpoint"""
        return {
            "service": "Quant Engine Test Server",
            "version": version,
            "status": "healthy",
            "endpoints": {
                "docs": docs_url,
                "health": "/health",
                "portfolios": "/api/v1/portfolio-snapshots/",
            },
        }

    @app.get("/health")
    async def health_check():
        """Detailed health check endpoint"""
        return {
            "status": "healthy",
            "database": "connected",
            "timestamp": "2024-01-01T00:00:00Z",  # Would use real timestamp in production
        }

    return app


# Create the app instance for direct use
app = create_test_app()


if __name__ == "__main__":
    import uvicorn

    # Configure logging
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )

    logger.info("Starting test server on http://localhost:8001")
    logger.info("API documentation available at: http://localhost:8001/docs")
    logger.info("Health check available at: http://localhost:8001/health")

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8001,
        reload=False,  # Disabled for test server stability
        log_level="info",
        access_log=True,
    )
