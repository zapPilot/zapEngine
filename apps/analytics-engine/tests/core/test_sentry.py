import importlib
import logging
import sys
from unittest.mock import Mock, patch

import pytest
from fastapi import Request

from src.core.sentry import capture_server_exception, init_sentry


@patch("src.core.sentry.sentry_sdk.init")
def test_init_sentry_is_noop_for_blank_dsn(mock_init: Mock) -> None:
    assert init_sentry("   ") is False
    mock_init.assert_not_called()


@patch("src.core.sentry.sentry_sdk.init")
def test_init_sentry_configures_error_only_metadata(mock_init: Mock) -> None:
    assert (
        init_sentry(
            " https://example.test/4 ",
            environment=" production ",
            release=" sha ",
        )
        is True
    )
    mock_init.assert_called_once_with(
        dsn="https://example.test/4",
        environment="production",
        release="sha",
        send_default_pii=False,
    )


@patch("src.core.sentry.sentry_sdk.capture_exception")
@patch("src.core.sentry.sentry_sdk.new_scope")
def test_capture_server_exception_uses_route_template(
    mock_new_scope: Mock, mock_capture: Mock
) -> None:
    scope = Mock()
    mock_new_scope.return_value.__enter__.return_value = scope
    route = Mock(path="/api/users/{user_id}")
    request = Request(
        scope={
            "type": "http",
            "method": "GET",
            "path": "/api/users/concrete-id",
            "headers": [],
            "route": route,
        }
    )
    error = RuntimeError("boom")

    capture_server_exception(error, request)

    scope.set_tag.assert_any_call("http.method", "GET")
    scope.set_tag.assert_any_call("http.route", "/api/users/{user_id}")
    mock_capture.assert_called_once_with(error)


def test_main_logs_sentry_boot_status(caplog: pytest.LogCaptureFixture) -> None:
    """A missing DSN and a code path that never captures both look like an
    empty Sentry project from the outside. This boot line is the only way to
    tell them apart, so it must fire on every import of src.main."""
    existing_main = sys.modules.pop("src.main", None)
    try:
        with (
            patch("src.core.sentry.init_sentry", return_value=True),
            caplog.at_level(logging.INFO, logger="src.main"),
        ):
            importlib.import_module("src.main")
    finally:
        if existing_main is not None:
            sys.modules["src.main"] = existing_main
        else:
            sys.modules.pop("src.main", None)

    assert "[sentry] enabled environment=" in caplog.text
    assert "release=" in caplog.text
