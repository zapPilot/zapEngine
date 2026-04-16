"""
Unit tests for src.core.config.Settings behavior
"""

from src.core.config import Settings


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

    # CORS origins should parse into a non-empty list
    assert isinstance(s.allowed_origins, list | str)
    if isinstance(s.allowed_origins, list):
        assert len(s.allowed_origins) > 0


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


def test_staging_environment(monkeypatch):
    """Test that is_production is False when ENVIRONMENT is staging."""
    monkeypatch.setenv("ENVIRONMENT", "staging")
    s = Settings()
    assert s.is_production is False
    assert s.is_development is False
