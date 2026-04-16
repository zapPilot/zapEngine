"""
Comprehensive unit tests for ConnectionPoolConfig.

Tests cover validation logic, boundary conditions, property methods,
and dataclass immutability. Targets 100% coverage for production-ready
database connection pool configuration.
"""

import pytest

from src.core.connection_pool import ConnectionPoolConfig

# ==================== VALID CONFIGURATION TESTS ====================


def test_valid_configuration_with_defaults():
    """Verify ConnectionPoolConfig with default values."""
    config = ConnectionPoolConfig()

    assert config.pool_size == 10
    assert config.max_overflow == 20
    assert config.pool_timeout == 30
    assert config.pool_recycle == 3600
    assert config.pool_use_lifo is True
    assert config.pool_pre_ping is True


def test_valid_configuration_with_custom_values():
    """Verify ConnectionPoolConfig with valid custom values."""
    config = ConnectionPoolConfig(
        pool_size=5,
        max_overflow=10,
        pool_timeout=15,
        pool_recycle=1800,
        pool_use_lifo=False,
        pool_pre_ping=False,
    )

    assert config.pool_size == 5
    assert config.max_overflow == 10
    assert config.pool_timeout == 15
    assert config.pool_recycle == 1800
    assert config.pool_use_lifo is False
    assert config.pool_pre_ping is False


# ==================== VALIDATION ERROR TESTS ====================


def test_validation_total_connections_exceeds_30():
    """Verify ValueError when total connections > 30."""
    with pytest.raises(ValueError, match="exceeds PgBouncer recommended limit"):
        ConnectionPoolConfig(pool_size=20, max_overflow=15)  # Total: 35


def test_validation_pool_timeout_too_low():
    """Verify ValueError when pool_timeout < 10."""
    with pytest.raises(
        ValueError, match="pool_timeout .* is too low.*Minimum 10s required"
    ):
        ConnectionPoolConfig(pool_timeout=5)


def test_validation_pool_recycle_zero():
    """Verify ValueError when pool_recycle <= 0."""
    with pytest.raises(ValueError, match="pool_recycle .* must be positive"):
        ConnectionPoolConfig(pool_recycle=0)


def test_validation_pool_recycle_negative():
    """Verify ValueError when pool_recycle is negative."""
    with pytest.raises(ValueError, match="pool_recycle .* must be positive"):
        ConnectionPoolConfig(pool_recycle=-100)


def test_validation_pool_size_zero():
    """Verify ValueError when pool_size < 1."""
    with pytest.raises(ValueError, match="pool_size must be at least 1"):
        ConnectionPoolConfig(pool_size=0)


def test_validation_pool_size_too_large():
    """Verify ValueError when pool_size > 50 (with max_overflow=0 to avoid total_connections check)."""
    # Note: pool_size > 50 always triggers total_connections > 30 first if max_overflow > 0
    # This test verifies the error message when total_connections check is bypassed
    # In practice, this validation is unreachable, but tested for completeness
    with pytest.raises(ValueError, match="Total connection pool .* exceeds PgBouncer"):
        ConnectionPoolConfig(pool_size=51, max_overflow=0)  # Total: 51 > 30


# ==================== BOUNDARY VALUE TESTS ====================


def test_boundary_total_connections_exactly_30():
    """Verify total_connections=30 is valid (boundary)."""
    config = ConnectionPoolConfig(pool_size=10, max_overflow=20)
    assert config.total_connections == 30  # Exactly at limit


def test_boundary_pool_timeout_exactly_10():
    """Verify pool_timeout=10 is valid (boundary)."""
    config = ConnectionPoolConfig(pool_timeout=10)
    assert config.pool_timeout == 10  # Exactly at minimum


def test_boundary_pool_recycle_exactly_1():
    """Verify pool_recycle=1 is valid (boundary)."""
    config = ConnectionPoolConfig(pool_recycle=1)
    assert config.pool_recycle == 1  # Exactly at minimum


def test_boundary_pool_size_exactly_1():
    """Verify pool_size=1 is valid (boundary)."""
    config = ConnectionPoolConfig(pool_size=1)
    assert config.pool_size == 1  # Minimum valid


def test_boundary_pool_size_maximum_with_total_limit():
    """Verify maximum valid pool_size respecting total_connections<=30."""
    # pool_size=30, max_overflow=0 gives total=30 (exactly at limit)
    config = ConnectionPoolConfig(pool_size=30, max_overflow=0)
    assert config.pool_size == 30
    assert config.total_connections == 30  # At boundary


# ==================== PROPERTY TESTS ====================


def test_total_connections_property_calculation():
    """Verify total_connections property computes correctly."""
    config = ConnectionPoolConfig(pool_size=8, max_overflow=12)

    assert config.total_connections == 20
    assert config.total_connections == config.pool_size + config.max_overflow


def test_total_connections_property_with_defaults():
    """Verify total_connections with default values."""
    config = ConnectionPoolConfig()

    assert config.total_connections == 30  # 10 + 20


# ==================== TO_ENGINE_KWARGS TESTS ====================


def test_to_engine_kwargs_returns_correct_dict():
    """Verify to_engine_kwargs() returns all 6 required fields."""
    config = ConnectionPoolConfig()
    kwargs = config.to_engine_kwargs()

    assert isinstance(kwargs, dict)
    assert len(kwargs) == 6
    assert "pool_size" in kwargs
    assert "max_overflow" in kwargs
    assert "pool_timeout" in kwargs
    assert "pool_recycle" in kwargs
    assert "pool_use_lifo" in kwargs
    assert "pool_pre_ping" in kwargs


def test_to_engine_kwargs_values_match_config():
    """Verify to_engine_kwargs() values match config attributes."""
    config = ConnectionPoolConfig(
        pool_size=7,
        max_overflow=13,
        pool_timeout=25,
        pool_recycle=2400,
        pool_use_lifo=False,
        pool_pre_ping=False,
    )
    kwargs = config.to_engine_kwargs()

    assert kwargs["pool_size"] == 7
    assert kwargs["max_overflow"] == 13
    assert kwargs["pool_timeout"] == 25
    assert kwargs["pool_recycle"] == 2400
    assert kwargs["pool_use_lifo"] is False
    assert kwargs["pool_pre_ping"] is False


# ==================== IMMUTABILITY TESTS ====================


def test_frozen_dataclass_immutability():
    """Verify frozen dataclass prevents attribute modification."""
    config = ConnectionPoolConfig()

    with pytest.raises(AttributeError, match="cannot assign to field"):
        config.pool_size = 20  # type: ignore[misc]


def test_frozen_dataclass_immutability_multiple_fields():
    """Verify all fields are immutable."""
    config = ConnectionPoolConfig()

    with pytest.raises(AttributeError):
        config.pool_timeout = 50  # type: ignore[misc]

    with pytest.raises(AttributeError):
        config.max_overflow = 30  # type: ignore[misc]
