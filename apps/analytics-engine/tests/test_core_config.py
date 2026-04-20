"""
Unit tests for src.core.config.Settings behavior
"""

import pytest

from src.core.config import Settings

PRODUCTION_DATABASE_URL = "postgresql+asyncpg://ro/url"


def test_settings_defaults_parse_correctly(monkeypatch):
    """Settings should parse defaults when no env vars are set."""
    # Ensure relevant env vars are unset for this test
    for key in [
        "PORT",
        "HOST",
        "DEBUG",
        "ENVIRONMENT",
        "DATABASE_READ_ONLY",
        "DATABASE_READ_ONLY_URL",
        "CORS_ALLOWED_ORIGINS",
    ]:
        monkeypatch.delenv(key, raising=False)

    s = Settings()

    assert s.port == 8001
    assert s.host == "0.0.0.0"
    assert s.debug is False
    assert s.ENVIRONMENT == "development"
    assert s.is_development is True
    assert s.is_production is False

    # Read-only defaults to true and effective URL equals read-only URL
    assert s.is_read_only is True
    assert s.effective_database_url == s.database_read_only_url

    # CORS defaults should stay local-only; production origins must come from env.
    assert s.allowed_origins == [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:5173",
        "http://localhost:8000",
    ]


def test_settings_env_overrides(monkeypatch):
    """Environment variables should override defaults."""
    monkeypatch.setenv("PORT", "9000")
    monkeypatch.setenv("HOST", "127.0.0.1")
    monkeypatch.setenv("DEBUG", "true")
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("DATABASE_READ_ONLY", "false")
    monkeypatch.setenv("DATABASE_READ_ONLY_URL", "postgresql+asyncpg://ro/url")
    monkeypatch.setenv("CORS_ALLOWED_ORIGINS", "http://a.com, http://b.com")

    s = Settings()

    assert s.port == 9000
    assert s.host == "127.0.0.1"
    assert s.debug is True
    assert s.ENVIRONMENT == "production"
    assert s.is_production is True
    assert s.is_development is False

    # Read-only disabled via env
    assert s.is_read_only is False
    assert s.effective_database_url == "postgresql+asyncpg://ro/url"

    # Origins split and trimmed
    origins = s.allowed_origins
    if isinstance(origins, str):
        origins = [o.strip() for o in origins.split(",") if o.strip()]
    assert origins == ["http://a.com", "http://b.com"]


def test_production_requires_explicit_cors_origins(monkeypatch):
    """Production should not use the development CORS defaults."""
    monkeypatch.delenv("CORS_ALLOWED_ORIGINS", raising=False)

    with pytest.raises(ValueError, match="CORS_ALLOWED_ORIGINS must be explicitly"):
        Settings(
            ENVIRONMENT="production",
            DATABASE_READ_ONLY_URL=PRODUCTION_DATABASE_URL,
        )


def test_production_rejects_empty_cors_origins():
    """Production should require at least one explicit CORS origin."""
    with pytest.raises(ValueError, match="must contain at least one origin"):
        Settings(
            ENVIRONMENT="production",
            DATABASE_READ_ONLY_URL=PRODUCTION_DATABASE_URL,
            CORS_ALLOWED_ORIGINS="",
        )


def test_production_rejects_local_only_cors_origins():
    """Production should reject localhost-only CORS origins."""
    with pytest.raises(ValueError, match="must not include localhost"):
        Settings(
            ENVIRONMENT="production",
            DATABASE_READ_ONLY_URL=PRODUCTION_DATABASE_URL,
            CORS_ALLOWED_ORIGINS="http://localhost:3000,http://127.0.0.1:3000",
        )


def test_production_rejects_mixed_local_cors_origins():
    """Production should reject local origins even when public origins are present."""
    with pytest.raises(ValueError, match="must not include localhost"):
        Settings(
            ENVIRONMENT="production",
            DATABASE_READ_ONLY_URL=PRODUCTION_DATABASE_URL,
            CORS_ALLOWED_ORIGINS="https://app.zap-pilot.org,http://0.0.0.0:3000",
        )


def test_production_accepts_explicit_public_cors_origins():
    """Production should accept explicitly configured public CORS origins."""
    settings = Settings(
        ENVIRONMENT="production",
        DATABASE_READ_ONLY_URL=PRODUCTION_DATABASE_URL,
        CORS_ALLOWED_ORIGINS="https://v2.zap-pilot.org,https://app.zap-pilot.org",
    )

    assert settings.allowed_origins == [
        "https://v2.zap-pilot.org",
        "https://app.zap-pilot.org",
    ]


def test_staging_environment(monkeypatch):
    """Test that is_production is False when ENVIRONMENT is staging."""
    monkeypatch.setenv("ENVIRONMENT", "staging")
    s = Settings()
    assert s.is_production is False
    assert s.is_development is False
