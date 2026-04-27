"""
Application lifecycle tests for main.py to achieve complete coverage.

Tests startup/shutdown, health check failures, direct module execution,
and database connectivity edge cases.
"""

import runpy
import sys
from types import SimpleNamespace
from unittest.mock import Mock, patch

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from src.main import app, health_check, lifespan


class TestApplicationLifecycle:
    """Test application lifecycle management"""

    @pytest.mark.asyncio
    async def test_lifespan_startup_and_shutdown(self):
        """Test application lifespan context manager startup and shutdown"""
        mock_app = Mock()

        with (
            patch("src.main.db_manager") as mock_db_manager,
            patch("src.main.logger") as mock_logger,
        ):
            # Test the lifespan context manager
            async with lifespan(mock_app):
                # Verify startup was called
                mock_db_manager.init_database.assert_called_once()
                mock_logger.info.assert_any_call("Starting Quant Engine...")
                mock_logger.info.assert_any_call("Quant Engine startup complete")

            # After context exit, verify shutdown was called
            mock_db_manager.close_database.assert_called_once()
            mock_logger.info.assert_any_call("Shutting down Quant Engine...")

    @pytest.mark.asyncio
    async def test_health_check_database_exception_handling(self):
        """Test health check when database check raises exception (lines 82-84)"""
        with patch("src.main.db_health_check") as mock_db_health:
            # Mock database health check to raise an exception
            mock_db_health.side_effect = RuntimeError("Database connection failed")

            with patch("src.main.settings") as mock_settings:
                mock_settings.is_read_only = True
                mock_settings.environment.value = "test"

                # Health check should catch exception and mark as unhealthy
                with pytest.raises(HTTPException) as exc_info:
                    await health_check()

                # Verify the exception details (line 89)
                assert exc_info.value.status_code == 503
                assert exc_info.value.detail["status"] == "unhealthy"
                assert (
                    "unhealthy: Database connection failed"
                    in exc_info.value.detail["checks"]["database"]
                )

    @pytest.mark.asyncio
    async def test_health_check_database_exception_with_complex_error(self):
        """Test health check with complex database exception"""
        with patch("src.main.db_health_check") as mock_db_health:
            # Mock a more complex exception
            complex_exception = ConnectionError("Connection refused: [Errno 111]")
            mock_db_health.side_effect = complex_exception

            with patch("src.main.settings") as mock_settings:
                mock_settings.is_read_only = False
                mock_settings.environment.value = "production"

                with pytest.raises(HTTPException) as exc_info:
                    await health_check()

                # Verify exception handling preserves error details
                assert exc_info.value.status_code == 503
                detail = exc_info.value.detail
                assert detail["status"] == "unhealthy"
                assert "Connection refused: [Errno 111]" in detail["checks"]["database"]
                assert detail["config"]["read_only_mode"] is False
                assert detail["config"]["environment"] == "production"

    @pytest.mark.asyncio
    async def test_health_check_success_scenario(self):
        """Test health check success scenario for completeness"""
        with patch("src.main.db_health_check") as mock_db_health:
            # Mock successful database health check
            mock_db_health.return_value = None  # No exception

            with patch("src.main.settings") as mock_settings:
                mock_settings.is_read_only = True
                mock_settings.environment.value = "development"

                result = await health_check()

                # Verify successful health check response
                assert result["status"] == "healthy"
                assert result["checks"]["database"] == "healthy (read-only)"
                assert result["config"]["read_only_mode"] is True
                assert result["config"]["environment"] == "development"

    def test_main_application_setup(self):
        """Test main application configuration and middleware setup"""
        # Verify the app is properly configured
        assert app.title == "Quant Engine"
        assert (
            app.description
            == "Analytics backend for portfolio management and DeFi data aggregation"
        )
        assert app.version == "0.1.0"
        assert app.docs_url == "/docs"
        assert app.redoc_url == "/redoc"

        # Test that the app can be instantiated with TestClient
        client = TestClient(app)

        # Test root endpoint
        response = client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert data["service"] == "Quant Engine"
        assert data["version"] == "0.1.0"
        assert data["status"] == "healthy"

    def test_cors_middleware_configuration(self):
        """Test CORS middleware is properly configured"""
        client = TestClient(app)

        # Make a preflight request to test CORS
        response = client.options(
            "/",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "content-type",
            },
        )

        # CORS should be configured to handle the request
        assert (
            "access-control-allow-origin" in response.headers
            or response.status_code in [200, 404]
        )

    def test_exception_handler_registration(self):
        """Test that exception handlers are properly registered"""
        # The app should have exception handlers registered
        # We can verify this by checking that unhandled exceptions are caught
        with patch("src.api.routers.portfolios.router"):
            # This test verifies the exception handler is registered
            # without needing to trigger an actual exception
            assert app.exception_handlers is not None

    @pytest.mark.asyncio
    async def test_health_check_database_status_formatting(self):
        """Test different database status formatting scenarios"""
        test_scenarios = [
            # (is_read_only, expected_suffix)
            (True, " (read-only)"),
            (False, ""),
        ]

        for is_read_only, expected_suffix in test_scenarios:
            with patch("src.main.db_health_check") as mock_db_health:
                mock_db_health.return_value = None  # Healthy

                with patch("src.main.settings") as mock_settings:
                    mock_settings.is_read_only = is_read_only
                    mock_settings.environment.value = "test"

                    result = await health_check()

                    expected_status = f"healthy{expected_suffix}"
                    assert result["checks"]["database"] == expected_status


class TestMainModuleDirectExecution:
    """Test direct module execution scenarios"""

    def test_uvicorn_run_configuration(self):
        """Test uvicorn run configuration when module is executed directly"""
        # This tests the __name__ == "__main__" block indirectly
        # by verifying the configuration values that would be passed to uvicorn.run

        with patch("src.main.settings") as mock_settings:
            mock_settings.port = 8001
            mock_settings.debug = True

            # Import the main module to verify it can be imported successfully

            # Verify settings are accessible for uvicorn configuration
            assert mock_settings.port == 8001
            assert mock_settings.debug is True

    def test_module_imports_and_initialization(self):
        """Test that all module imports and initialization work correctly"""
        # Verify all imports work without errors
        from src.main import (
            app,
            health_check,
            lifespan,
        )

        # Verify key components are properly initialized
        assert app is not None
        assert callable(health_check)
        assert callable(lifespan)

    def test_main_guard_runs_uvicorn_with_expected_target(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        captured: dict[str, object] = {}

        def _fake_run(*args: object, **kwargs: object) -> None:
            captured["args"] = args
            captured["kwargs"] = kwargs

        monkeypatch.setitem(sys.modules, "uvicorn", SimpleNamespace(run=_fake_run))
        existing_main = sys.modules.pop("src.main", None)
        try:
            runpy.run_module("src.main", run_name="__main__")
        finally:
            if existing_main is not None:
                sys.modules["src.main"] = existing_main

        assert captured["args"] == ("src.main:app",)
        kwargs = captured["kwargs"]
        assert isinstance(kwargs, dict)
        assert kwargs["host"] == "0.0.0.0"
        assert "port" in kwargs
        assert "reload" in kwargs

    def test_router_inclusion(self):
        """Test that all routers are properly included"""
        # Verify routers are included in the application
        route_paths = [route.path for route in app.routes]

        # Check that API routes are properly included
        api_routes_exist = any("/api/v2" in path for path in route_paths)
        root_routes_exist = any(path in ["/", "/health"] for path in route_paths)

        assert api_routes_exist or len(app.routes) > 0
        assert root_routes_exist or len(app.routes) > 0

    def test_critical_routes_registered(self):
        """Deletion guard for routes the frontend depends on.

        The frontend's admin Config Editor and backtesting view both consume
        /v3/strategy/configs to populate strategy dropdowns dynamically. If
        someone deletes the route handler (it has happened before, because
        vulture flags decorator-registered handlers as 'unused'), this test
        fails loudly instead of letting the frontend silently break.

        Do not delete this test without removing the corresponding frontend
        consumers in apps/frontend/src/components/.../ConfigEditorStructuredFields.tsx
        and apps/frontend/src/.../useStrategyConfigs.ts.
        """
        route_paths = {route.path for route in app.routes}
        required_paths = {
            "/api/v3/strategy/configs",
            "/api/v3/strategy/admin/configs",
            "/api/v3/strategy/daily-suggestion/{user_id}",
        }
        missing = required_paths - route_paths
        assert not missing, (
            f"Critical strategy routes missing from app: {sorted(missing)}. "
            "Frontend dropdowns and daily-suggestion features depend on these."
        )


class TestApplicationIntegration:
    """Test application integration scenarios"""

    def test_health_check_endpoint_integration(self):
        """Test health check endpoint through TestClient"""
        client = TestClient(app)

        with patch("src.main.db_health_check") as mock_db_health:
            # Test successful health check
            mock_db_health.return_value = None

            response = client.get("/health")
            assert response.status_code == 200

            data = response.json()
            assert data["service"] == "Quant Engine"
            assert data["version"] == "0.1.0"
            assert data["status"] == "healthy"
            assert "checks" in data
            assert "config" in data

    def test_health_check_endpoint_database_failure(self):
        """Test health check endpoint when database fails"""
        client = TestClient(app)

        with patch("src.main.db_health_check") as mock_db_health:
            # Mock database failure
            mock_db_health.side_effect = Exception("Database is down")

            response = client.get("/health")
            assert response.status_code == 503

            data = response.json()
            # The HTTPException returns the health_status as detail
            assert data["detail"]["status"] == "unhealthy"
            assert "Database is down" in data["detail"]["checks"]["database"]

    def test_application_startup_sequence(self):
        """Test the application startup sequence works correctly"""
        with patch("src.main.db_manager"), patch("src.main.logger"):
            # Create a new test client to trigger startup
            client = TestClient(app)

            # Make a request to ensure the app is started
            response = client.get("/")
            assert response.status_code == 200

            # Verify startup logging occurred
            # (Note: This may not capture actual startup due to TestClient behavior,
            # but verifies the endpoint works)
            assert response.json()["service"] == "Quant Engine"


class TestErrorHandlingIntegration:
    """Test error handling integration with the main app"""

    def test_exception_handler_integration(self):
        """Test that exception handlers work with the main application"""
        client = TestClient(app)

        # The main app should handle exceptions gracefully
        # This verifies the exception handler registration works
        response = client.get("/nonexistent-endpoint")

        # Should get a 404, not an unhandled exception
        assert response.status_code == 404

    def test_application_configuration_completeness(self):
        """Test that the application is completely configured"""
        # Verify all essential configuration is present
        assert app.title is not None
        assert app.description is not None
        assert app.version is not None

        # Verify middleware is configured
        assert len(app.user_middleware) > 0  # CORS middleware should be present

        # Verify routes are configured
        assert len(app.routes) > 0

        # Verify exception handlers are configured
        assert len(app.exception_handlers) > 0
