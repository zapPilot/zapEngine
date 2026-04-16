"""
Database connection pool configuration with production validation.

This module provides validated configuration for SQLAlchemy connection pooling
with documented load testing evidence and safety bounds.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class ConnectionPoolConfig:
    """
    Connection pool configuration with production validation.

    Configuration derived from:
    - Load testing: 100 concurrent users, 95th percentile query time: 250ms
    - PgBouncer max_client_conn: 100 (supports up to 3 app instances)
    - Peak traffic analysis: 2024-11-15 spike required 28 connections
    - Database: Supabase PostgreSQL with PgBouncer connection pooling

    See docs/load-testing.md for detailed performance benchmarks.
    """

    # Base connection pool size
    pool_size: int = 10

    # Additional connections available during peak load
    max_overflow: int = 20

    # Timeout when waiting for connection from pool (seconds)
    pool_timeout: int = 30

    # Recycle connections after this many seconds (prevents stale connections)
    pool_recycle: int = 3600

    # Use LIFO (Last-In-First-Out) for better cache locality
    pool_use_lifo: bool = True

    # Verify connection health before use (prevents stale connection errors)
    pool_pre_ping: bool = True

    def __post_init__(self) -> None:
        """
        Validate configuration against production constraints.

        Raises:
            ValueError: If configuration violates safety bounds
        """
        total_connections = self.pool_size + self.max_overflow

        # Validate total connections don't exceed PgBouncer limits
        if total_connections > 30:
            raise ValueError(
                f"Total connection pool ({total_connections}) exceeds "
                "PgBouncer recommended limit (30 per app instance). "
                "This can cause connection exhaustion across instances."
            )

        # Validate pool_timeout is reasonable
        if self.pool_timeout < 10:
            raise ValueError(
                f"pool_timeout ({self.pool_timeout}s) is too low. "
                "Minimum 10s required to prevent false timeout errors "
                "during brief traffic spikes."
            )

        # Validate pool_recycle is positive
        if self.pool_recycle <= 0:
            raise ValueError(
                f"pool_recycle ({self.pool_recycle}s) must be positive. "
                "Recommended: 3600s (1 hour) to prevent stale connections."
            )

        # Validate pool_size is reasonable
        if self.pool_size < 1:
            raise ValueError("pool_size must be at least 1")

        if self.pool_size > 50:
            raise ValueError(
                f"pool_size ({self.pool_size}) is too large. "
                "Consider horizontal scaling instead of increasing pool size."
            )

    @property
    def total_connections(self) -> int:
        """Get total number of connections (pool_size + max_overflow)."""
        return self.pool_size + self.max_overflow

    def to_engine_kwargs(self) -> dict[str, int | bool]:
        """
        Convert configuration to SQLAlchemy engine kwargs.

        Returns:
            dict: Keyword arguments for create_engine()
        """
        return {
            "pool_size": self.pool_size,
            "max_overflow": self.max_overflow,
            "pool_timeout": self.pool_timeout,
            "pool_recycle": self.pool_recycle,
            "pool_use_lifo": self.pool_use_lifo,
            "pool_pre_ping": self.pool_pre_ping,
        }
