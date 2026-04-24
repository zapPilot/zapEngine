"""
Comprehensive test suite for core config module

Focuses on validation errors, edge cases, and configuration scenarios
to improve test coverage from 83% to 90%+.
"""

import os
from unittest.mock import patch

import pytest
from pydantic import ValidationError

from src.core.config import (
    Settings,
    ValidationSettings,
)


class TestDatabaseSettings:
    """Test database configuration settings via Settings class"""

    def test_database_settings_defaults(self):
        """Test default database settings"""
        import os

        # Clear any environment variables that might affect defaults
        original_env = {}
        for key in ["DATABASE_READ_ONLY_URL", "DATABASE_URL"]:
            if key in os.environ:
                original_env[key] = os.environ[key]
                del os.environ[key]

        try:
            settings = Settings()

            assert settings.database_read_only is True
            assert settings.database_read_only_url == "placeholder_db_url"
            assert settings.effective_database_url == "placeholder_db_url"
            assert settings.is_read_only is True
        finally:
            # Restore original environment
            for key, value in original_env.items():
                os.environ[key] = value


class TestEnvironmentVariableHandling:
    """Test environment variable handling and edge cases"""

    @patch.dict(os.environ, {"ANALYTICS_ENGINE_PORT": "9000"}, clear=False)
    def test_settings_from_environment_variables(self):
        """Test settings loading from environment variables"""
        settings = Settings()

        assert settings.port == 9000

    @patch.dict(
        os.environ,
        {"ANALYTICS_ENGINE_PORT": "8001", "PORT": "3004"},
        clear=False,
    )
    def test_app_specific_port_takes_precedence(self):
        """Test app-specific port avoids root .env PORT collisions."""
        settings = Settings()

        assert settings.port == 8001

    @patch.dict(os.environ, {"DATABASE_READ_ONLY": "false"}, clear=False)
    def test_boolean_environment_variable_parsing(self):
        """Test boolean environment variable parsing"""
        settings = Settings()

        assert settings.database_read_only is False

    def test_settings_model_config(self):
        """Test settings model configuration"""
        settings = Settings()

        # Test that the model config allows environment variable loading
        assert hasattr(settings, "model_config")


class TestComplexValidationScenarios:
    """Test complex validation scenarios and edge cases"""

    def test_cors_origins_with_mixed_valid_invalid(self):
        """Test CORS origins with mix of valid and invalid URLs"""
        with pytest.raises(ValidationError):
            Settings(
                allowed_origins=[
                    "http://localhost:3000",  # Valid
                    "invalid-url",  # Invalid
                    "https://example.com",  # Valid
                ]
            )

    def test_validation_settings_boundary_values(self):
        """Test validation settings with boundary values"""
        # Test maximum values
        validation_settings = ValidationSettings(
            tolerance=1.0,
            percentage_tolerance=1.0,
            max_apr=10000.0,
            max_portfolio_value=1.0,  # Minimum allowed
            max_token_count=1,  # Minimum allowed
            max_wallet_count=1,  # Minimum allowed
        )

        assert validation_settings.tolerance == 1.0
        assert validation_settings.max_portfolio_value == 1.0

        # Test minimum values
        validation_settings_min = ValidationSettings(
            tolerance=0.0, min_apr=-1000.0, min_count=0
        )

        assert validation_settings_min.tolerance == 0.0
        assert validation_settings_min.min_apr == -1000.0

    def test_database_url_edge_cases(self):
        """Test database URL validation edge cases"""
        # Empty string should fail
        with pytest.raises(ValidationError):
            Settings(database_read_only_url="")

        # Only protocol should fail
        with pytest.raises(ValidationError):
            Settings(database_read_only_url="postgresql://")

        # Wrong protocol should fail
        with pytest.raises(ValidationError):
            Settings(database_read_only_url="http://localhost:5432/db")

    def test_settings_initialization_error_handling(self):
        """Test settings initialization with various error conditions"""
        # Test with conflicting validation values
        with pytest.raises(ValidationError):
            ValidationSettings(min_apr=200.0, max_apr=100.0)

        # Test with invalid port ranges
        with pytest.raises(ValidationError):
            Settings(port=-1)

        with pytest.raises(ValidationError):
            Settings(port=100000)
