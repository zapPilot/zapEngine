"""
Streamlined configuration system using Pydantic BaseSettings for type safety and validation.

Simplified architecture with consolidated validation logic and eliminated component duplication.
"""

from enum import Enum
from functools import cached_property
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from pydantic import Field, PositiveInt, field_validator, model_validator
from pydantic_settings import BaseSettings

REPO_ROOT_ENV_FILE = Path(__file__).resolve().parents[4] / ".env"

DEV_ALLOWED_ORIGINS = (
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:5173",
    "http://localhost:8000",
)
LOCAL_CORS_HOSTS = {"localhost", "0.0.0.0", "::1"}


class Environment(str, Enum):
    """Application environment enumeration."""

    DEVELOPMENT = "development"
    STAGING = "staging"
    PRODUCTION = "production"


class ValidationSettings(BaseSettings):
    """Financial data validation rules and constraints."""

    # Core validation tolerances
    # Tolerance of $0.05 accommodates floating-point rounding accumulation
    # across independent aggregation paths while still catching meaningful
    # data integrity issues (e.g., missing categories, calculation bugs)
    tolerance: float = Field(
        default=0.05,
        ge=0.0,
        le=1.0,
        description="General validation tolerance for financial calculations",
    )

    percentage_tolerance: float = Field(
        default=0.011,
        ge=0.0,
        le=1.0,
        description="Tolerance for percentage-based validations",
    )

    # APR bounds (as percentages, e.g., 500.0 = 500%)
    min_apr: float = Field(
        default=-100.0,
        ge=-1000.0,
        description="Minimum allowed APR percentage",
    )

    max_apr: float = Field(
        default=500.0,
        le=10000.0,
        description="Maximum allowed APR percentage",
    )

    # Portfolio value bounds (USD)
    max_portfolio_value: float = Field(
        default=1_000_000_000.0,  # 1B USD
        gt=0.0,
        description="Maximum allowed portfolio value in USD",
    )

    min_usd_value: float = Field(
        default=0.0, description="Minimum USD value (non-negative constraint)"
    )

    # Percentage bounds
    min_percentage: float = Field(
        default=0.0, ge=0.0, description="Minimum percentage value"
    )

    max_percentage: float = Field(
        default=100.0, le=100.0, description="Maximum percentage value"
    )

    # Count validation bounds
    min_count: int = Field(default=0, ge=0, description="Minimum count value")

    max_token_count: int = Field(
        default=10_000,
        gt=0,
        description="Maximum number of tokens allowed",
    )

    max_wallet_count: int = Field(
        default=1_000,
        gt=0,
        description="Maximum number of wallets allowed",
    )

    # Decimal precision for USD values
    usd_decimal_places: int = Field(
        default=2, ge=0, le=8, description="Decimal precision for USD values"
    )

    percentage_decimal_places: int = Field(
        default=2, ge=0, le=6, description="Decimal precision for percentage values"
    )

    # Business logic constraints
    max_debt_to_assets_ratio: float = Field(
        default=0.95,
        ge=0.0,
        le=1.0,
        description="Maximum debt-to-assets ratio (95% max)",
    )

    @model_validator(mode="after")
    def validate_apr_bounds(self) -> "ValidationSettings":
        """Ensure max APR is greater than min APR."""
        min_apr = self.min_apr
        max_apr = self.max_apr
        if max_apr <= min_apr:
            raise ValueError(
                f"max_apr ({max_apr}) must be greater than min_apr ({min_apr})"
            )
        return self

    model_config = {"env_prefix": "", "case_sensitive": False}


class AnalyticsSettings(BaseSettings):
    """Analytics calculation parameters and thresholds."""

    # Sharpe ratio interpretation thresholds
    sharpe_poor_threshold: float = Field(default=0.0, ge=-10.0, le=10.0)
    sharpe_below_avg_threshold: float = Field(default=1.0, ge=0.0, le=10.0)
    sharpe_good_threshold: float = Field(default=2.0, ge=0.0, le=10.0)
    sharpe_very_good_threshold: float = Field(default=3.0, ge=0.0, le=10.0)

    # Volatility interpretation thresholds (%)
    volatility_very_low_threshold: float = Field(default=10.0, ge=0.0, le=500.0)
    volatility_low_threshold: float = Field(default=25.0, ge=0.0, le=500.0)
    volatility_moderate_threshold: float = Field(default=50.0, ge=0.0, le=500.0)
    volatility_high_threshold: float = Field(default=100.0, ge=0.0, le=500.0)

    # Rolling window parameters
    rolling_window_days: int = Field(default=30, ge=7, le=90)

    # Reliability assessment parameters
    reliability_min_period: int = Field(default=30, ge=7, le=365)
    reliability_robust_period: int = Field(default=90, ge=30, le=365)
    reliability_min_window_ratio: float = Field(default=0.5, ge=0.0, le=1.0)

    model_config = {"env_prefix": "ANALYTICS_"}


class Settings(BaseSettings):
    """Main application settings with consolidated validation logic."""

    # Database settings
    database_read_only: bool = Field(
        default=True,
        alias="DATABASE_READ_ONLY",
        description="Enable read-only database mode to prevent write operations",
    )
    database_read_only_url: str = Field(
        default="placeholder_db_url",
        alias="DATABASE_READ_ONLY_URL",
        description="Read-only database connection URL (Supabase PostgreSQL)",
    )
    db_idle_in_transaction_session_timeout_ms: int = Field(
        default=600_000,
        alias="DB_IDLE_IN_TRANSACTION_SESSION_TIMEOUT",
        ge=0,
        description=(
            "PostgreSQL idle-in-transaction session timeout (milliseconds). "
            "Set to 0 to disable."
        ),
    )
    db_statement_timeout_ms: int = Field(
        default=300_000,
        alias="DB_STATEMENT_TIMEOUT",
        ge=0,
        description=(
            "PostgreSQL statement timeout (milliseconds). Set to 0 to disable."
        ),
    )

    # Server settings
    host: str = Field(
        default="0.0.0.0",
        alias="HOST",
        description="Server host address to bind the application",
    )
    port: PositiveInt = Field(
        default=8001,
        alias="PORT",
        ge=1,
        le=65535,
        description="Server port number (1-65535)",
    )
    debug: bool = Field(
        default=False, alias="DEBUG", description="Enable debug mode for development"
    )
    environment: Environment = Field(
        default=Environment.DEVELOPMENT,
        alias="ENVIRONMENT",
        description="Application environment (development, staging, production)",
    )

    # CORS settings
    allowed_origins: str | list[str] = Field(
        default_factory=lambda: list(DEV_ALLOWED_ORIGINS),
        alias="CORS_ALLOWED_ORIGINS",
        description="Comma-separated list of allowed CORS origins",
    )

    # Analytics Cache Settings (for daily ETL pattern)
    analytics_cache_enabled: bool = Field(
        default=True,
        alias="ANALYTICS_CACHE_ENABLED",
        description="Enable in-memory caching for analytics services (12-hour TTL for daily ETL)",
    )

    analytics_cache_default_ttl_hours: int = Field(
        default=12,
        alias="ANALYTICS_CACHE_DEFAULT_TTL_HOURS",
        ge=0,
        le=168,  # Max 1 week
        description="Default TTL (hours) for analytics cache (12 hours matches daily ETL)",
    )

    analytics_cache_max_entries: int = Field(
        default=1000,
        alias="ANALYTICS_CACHE_MAX_ENTRIES",
        ge=100,
        le=100000,
        description="Maximum number of entries in analytics cache before eviction",
    )

    # HTTP Cache Headers
    http_cache_max_age_seconds: int = Field(
        default=60 * 60,
        alias="HTTP_CACHE_MAX_AGE_SECONDS",
        ge=0,
        le=86_400,  # Max 24 hours
        description="Cache-Control max-age (seconds) for analytics endpoints",
    )

    http_cache_stale_while_revalidate_seconds: int = Field(
        default=23 * 60 * 60,
        alias="HTTP_CACHE_STALE_WHILE_REVALIDATE_SECONDS",
        ge=0,
        le=7 * 24 * 60 * 60,
        description="stale-while-revalidate window aligning with the daily ETL",
    )

    # Market Sentiment Service settings
    market_sentiment_api_url: str = Field(
        default="https://api.alternative.me/fng/?limit=1&format=json",
        alias="MARKET_SENTIMENT_API_URL",
        description="External API URL for Fear & Greed Index data",
    )

    market_sentiment_timeout_seconds: float = Field(
        default=10.0,
        alias="MARKET_SENTIMENT_TIMEOUT_SECONDS",
        ge=1.0,
        le=60.0,
        description="HTTP request timeout for market sentiment API (seconds)",
    )

    market_sentiment_cache_ttl_seconds: int = Field(
        default=600,
        alias="MARKET_SENTIMENT_CACHE_TTL_SECONDS",
        ge=60,
        le=3600,
        description="Cache TTL for market sentiment data (seconds, default 10 minutes)",
    )

    market_sentiment_user_agent: str = Field(
        default="ZapPilot/1.0",
        alias="MARKET_SENTIMENT_USER_AGENT",
        description="User-Agent header for market sentiment API requests",
    )

    use_sentiment_database: bool = Field(
        default=True,
        alias="USE_SENTIMENT_DATABASE",
        description="Use database for sentiment data (True) or external API only (False). Enables rollback to external API if database is unavailable.",
    )

    # Risk Analytics settings
    # DeFi-adjusted: 5% reflects stablecoin opportunity cost (Aave/Compound yields)
    risk_free_rate_annual: float = Field(
        default=0.05,
        alias="ANALYTICS_RISK_FREE_RATE_ANNUAL",
        ge=0.0,
        le=1.0,
        description="Annual risk-free rate for Sharpe ratio calculation (default: 5% / 0.05 for DeFi)",
    )

    # Connection Pool settings
    db_pool_size: int = Field(
        default=10,
        alias="DB_POOL_SIZE",
        ge=1,
        le=50,
        description="Base connection pool size (default: 10)",
    )

    db_pool_max_overflow: int = Field(
        default=20,
        alias="DB_POOL_MAX_OVERFLOW",
        ge=0,
        le=50,
        description="Maximum overflow connections (default: 20)",
    )

    db_pool_timeout: int = Field(
        default=30,
        alias="DB_POOL_TIMEOUT",
        ge=10,
        le=300,
        description="Connection pool timeout in seconds (default: 30)",
    )

    db_pool_recycle: int = Field(
        default=3600,
        alias="DB_POOL_RECYCLE",
        ge=300,
        le=86400,
        description="Connection recycle time in seconds (default: 3600 / 1 hour)",
    )

    @field_validator("database_read_only_url")
    @classmethod
    def validate_database_url(cls, v: str) -> str:
        """Validate database URL format."""
        if v == "placeholder_db_url":
            return v  # Allow placeholder for testing

        # Basic URL validation - should start with postgresql://, postgres://, or postgresql+driver://
        if not (
            v.startswith("postgresql://")
            or v.startswith("postgres://")
            or v.startswith("postgresql+")
        ):
            raise ValueError(
                "Database URL must start with 'postgresql://', 'postgres://', or 'postgresql+driver://'"
            )
        return v

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def parse_origins(cls, v: Any) -> list[str]:
        """Parse comma-separated origins string into list."""
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v if isinstance(v, list) else []

    @field_validator("allowed_origins")
    @classmethod
    def validate_origins(cls, v: list[str]) -> list[str]:
        """Validate that origins are properly formatted URLs or localhost."""
        valid_origins = []
        for origin in v:
            # Allow localhost and IP addresses for development
            if origin.startswith(
                (
                    "http://localhost:",
                    "https://localhost:",
                    "http://127.0.0.1:",
                    "https://127.0.0.1:",
                    "http://0.0.0.0:",
                    "https://0.0.0.0:",
                )
            ):
                valid_origins.append(origin)
                continue

            # Validate proper URLs for production origins
            try:
                # Basic URL validation
                if not (origin.startswith("http://") or origin.startswith("https://")):
                    raise ValueError(f"Invalid origin URL: {origin}")
                valid_origins.append(origin)
            except Exception:
                raise ValueError(f"Invalid CORS origin format: {origin}")

        return valid_origins

    def __init__(self, **kwargs: Any) -> None:
        """Initialize settings with production validation."""
        super().__init__(**kwargs)
        self._validate_production_requirements()

    @cached_property
    def validation(self) -> ValidationSettings:
        """Get validation settings component."""
        return ValidationSettings()

    @cached_property
    def analytics(self) -> AnalyticsSettings:
        """Get analytics settings component."""
        return AnalyticsSettings()

    def _validate_production_requirements(self) -> None:
        """Validate production-specific requirements."""
        if not self.is_production:
            return

        if self.database_read_only_url == "placeholder_db_url":
            # Ensure database URL is not placeholder in production
            raise ValueError("Valid database URL is required in production environment")

        self._validate_production_cors_origins()

    def _validate_production_cors_origins(self) -> None:
        """Require explicit non-local CORS origins in production."""
        if "allowed_origins" not in self.model_fields_set:
            raise ValueError(
                "CORS_ALLOWED_ORIGINS must be explicitly set in production environment"
            )

        allowed_origins = self.allowed_origins
        if isinstance(allowed_origins, str):
            allowed_origins = self.parse_origins(allowed_origins)

        if not allowed_origins:
            raise ValueError(
                "CORS_ALLOWED_ORIGINS must contain at least one origin in production environment"
            )

        local_origins = [
            origin for origin in allowed_origins if self._is_local_cors_origin(origin)
        ]
        if local_origins:
            raise ValueError(
                "Production CORS_ALLOWED_ORIGINS must not include localhost or loopback origins"
            )

    @staticmethod
    def _is_local_cors_origin(origin: str) -> bool:
        """Return True when an origin targets a local development host."""
        hostname = urlparse(origin).hostname
        return hostname in LOCAL_CORS_HOSTS or (
            hostname is not None and hostname.startswith("127.")
        )

    # Environment properties
    @property
    def is_production(self) -> bool:
        """Check if running in production environment."""
        return self.environment == Environment.PRODUCTION

    @property
    def is_development(self) -> bool:
        """Check if running in development environment."""
        return self.environment == Environment.DEVELOPMENT

    @property
    def is_staging(self) -> bool:
        """Check if running in staging environment."""
        return self.environment == Environment.STAGING

    # Database properties
    @property
    def is_read_only(self) -> bool:
        """Check if database is in read-only mode."""
        return self.database_read_only

    @property
    def effective_database_url(self) -> str:
        """Get the effective database URL - always read-only in this configuration."""
        return self.database_read_only_url

    # Minimal backward compatibility for tests that patch ENVIRONMENT
    @property
    def ENVIRONMENT(self) -> str:
        return self.environment.value

    model_config = {
        "env_prefix": "",
        "case_sensitive": False,
        # Allow component settings to be loaded from environment
        "env_nested_delimiter": "__",
    }


# Load environment variables from the monorepo root .env file if it exists
try:
    from dotenv import load_dotenv

    load_dotenv(REPO_ROOT_ENV_FILE)
except ImportError:
    pass  # dotenv is optional

# Global settings instance for backward compatibility
settings = Settings()
