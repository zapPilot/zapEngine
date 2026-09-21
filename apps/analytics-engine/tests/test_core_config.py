"""
Unit tests for src.core.config.Settings behavior
"""

from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient

from src.core.config import DESKTOP_PRODUCTION_CORS_ORIGIN, Environment, Settings

PRODUCTION_DATABASE_URL = "postgresql+asyncpg://ro/url"
REPO_ROOT = Path(__file__).resolve().parents[3]


def test_settings_defaults_parse_correctly(monkeypatch):
    """Settings should parse defaults when no env vars are set."""
    # Ensure relevant env vars are unset for this test
    for key in [
        "ANALYTICS_ENGINE_PORT",
        "PORT",
        "HOST",
        "NODE_ENV",
        "DATABASE_READ_ONLY",
        "DATABASE_READ_ONLY_URL",
        "CORS_ALLOWED_ORIGINS",
    ]:
        monkeypatch.delenv(key, raising=False)

    s = Settings()

    assert s.port == 8001
    assert s.host == "0.0.0.0"
    assert s.debug is True
    assert s.environment is Environment.DEVELOPMENT
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
    monkeypatch.delenv("ANALYTICS_ENGINE_PORT", raising=False)
    monkeypatch.setenv("PORT", "9000")
    monkeypatch.setenv("HOST", "127.0.0.1")
    monkeypatch.setenv("NODE_ENV", "production")
    monkeypatch.setenv("DATABASE_READ_ONLY", "false")
    monkeypatch.setenv("DATABASE_READ_ONLY_URL", "postgresql+asyncpg://ro/url")
    monkeypatch.setenv("CORS_ALLOWED_ORIGINS", "http://a.com, http://b.com")

    s = Settings()

    assert s.port == 9000
    assert s.host == "127.0.0.1"
    assert s.debug is False
    assert s.environment is Environment.PRODUCTION
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


def test_app_specific_port_overrides_generic_port(monkeypatch):
    """ANALYTICS_ENGINE_PORT should win when root .env also has generic PORT."""
    monkeypatch.setenv("ANALYTICS_ENGINE_PORT", "8001")
    monkeypatch.setenv("PORT", "3004")

    s = Settings()

    assert s.port == 8001


def test_production_requires_explicit_cors_origins(monkeypatch):
    """Production should not use the development CORS defaults."""
    monkeypatch.delenv("CORS_ALLOWED_ORIGINS", raising=False)

    with pytest.raises(ValueError, match="CORS_ALLOWED_ORIGINS must be explicitly"):
        Settings(
            NODE_ENV="production",
            DATABASE_READ_ONLY_URL=PRODUCTION_DATABASE_URL,
        )


def test_production_rejects_empty_cors_origins():
    """Production should require at least one explicit CORS origin."""
    with pytest.raises(ValueError, match="must contain at least one origin"):
        Settings(
            NODE_ENV="production",
            DATABASE_READ_ONLY_URL=PRODUCTION_DATABASE_URL,
            CORS_ALLOWED_ORIGINS="",
        )


def test_production_rejects_unapproved_local_cors_origins():
    """Production should reject local origins other than the packaged desktop origin."""
    with pytest.raises(ValueError, match="other localhost or loopback origins"):
        Settings(
            NODE_ENV="production",
            DATABASE_READ_ONLY_URL=PRODUCTION_DATABASE_URL,
            CORS_ALLOWED_ORIGINS="http://localhost:3000,http://127.0.0.1:3000",
        )


def test_production_rejects_mixed_unapproved_local_cors_origins():
    """Production should reject unapproved local origins even with public origins."""
    with pytest.raises(ValueError, match="other localhost or loopback origins"):
        Settings(
            NODE_ENV="production",
            DATABASE_READ_ONLY_URL=PRODUCTION_DATABASE_URL,
            CORS_ALLOWED_ORIGINS="https://app.zap-pilot.org,http://0.0.0.0:3000",
        )


def test_production_accepts_packaged_desktop_loopback_origin():
    """The fixed packaged desktop origin may call the production API directly."""
    settings = Settings(
        NODE_ENV="production",
        DATABASE_READ_ONLY_URL=PRODUCTION_DATABASE_URL,
        CORS_ALLOWED_ORIGINS="https://app.zap-pilot.org,http://127.0.0.1:3105",
    )

    assert settings.allowed_origins == [
        "https://app.zap-pilot.org",
        "http://127.0.0.1:3105",
    ]


def _production_settings(origins: str) -> Settings:
    return Settings(
        NODE_ENV="production",
        DATABASE_READ_ONLY_URL=PRODUCTION_DATABASE_URL,
        CORS_ALLOWED_ORIGINS=origins,
    )


def _cors_app(settings: Settings) -> FastAPI:
    """Mirror the middleware wiring in src.main for a given Settings."""
    app = FastAPI()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_origin_regex=settings.cors_allow_origin_regex,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    return app


def test_production_disables_the_loopback_origin_regex():
    """The regex is what would otherwise admit every loopback port."""
    settings = _production_settings(
        f"https://app.zap-pilot.org,{DESKTOP_PRODUCTION_CORS_ORIGIN}"
    )

    assert settings.cors_allow_origin_regex is None


@pytest.mark.parametrize(
    ("origin", "allowed"),
    (
        (DESKTOP_PRODUCTION_CORS_ORIGIN, True),
        ("http://127.0.0.1:49152", False),
        ("http://localhost:3105", False),
    ),
)
def test_production_cors_preflight_admits_only_the_packaged_desktop_origin(
    origin: str, allowed: bool
):
    """Browser-visible behavior, not just the validator that built the list."""
    client = TestClient(
        _cors_app(
            _production_settings(
                f"https://app.zap-pilot.org,{DESKTOP_PRODUCTION_CORS_ORIGIN}"
            )
        )
    )

    response = client.options(
        "/",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "GET",
        },
    )

    assert ("access-control-allow-origin" in response.headers) is allowed


def test_committed_production_cors_origins_match_the_desktop_constant():
    """`3105` also lives in the desktop renderer and in config/env/prod.env.

    Without this, changing the packaged loopback port stays green locally and
    crash-loops the service on the next production boot.
    """
    prod_env = (REPO_ROOT / "config" / "env" / "prod.env").read_text()
    line = next(
        raw for raw in prod_env.splitlines() if raw.startswith("CORS_ALLOWED_ORIGINS=")
    )
    origins = line.split("=", 1)[1].split(",")

    local_origins = [
        origin for origin in origins if Settings._is_local_cors_origin(origin)
    ]

    assert local_origins == [DESKTOP_PRODUCTION_CORS_ORIGIN]


def test_production_accepts_explicit_public_cors_origins():
    """Production should accept explicitly configured public CORS origins."""
    settings = Settings(
        NODE_ENV="production",
        DATABASE_READ_ONLY_URL=PRODUCTION_DATABASE_URL,
        CORS_ALLOWED_ORIGINS="https://v2.zap-pilot.org,https://app.zap-pilot.org",
    )

    assert settings.allowed_origins == [
        "https://v2.zap-pilot.org",
        "https://app.zap-pilot.org",
    ]


def test_staging_environment(monkeypatch):
    """Test that is_production is False when NODE_ENV is staging."""
    monkeypatch.setenv("NODE_ENV", "staging")
    s = Settings()
    assert s.is_production is False
    assert s.is_development is False
