"""Error-only Sentry initialization and request-scoped capture helpers."""

import sentry_sdk
from fastapi import Request


def _normalize(value: str | None) -> str | None:
    normalized = value.strip() if value else ""
    return normalized or None


def init_sentry(
    dsn: str | None,
    *,
    environment: str | None = None,
    release: str | None = None,
) -> bool:
    normalized_dsn = _normalize(dsn)
    if normalized_dsn is None:
        return False

    sentry_sdk.init(
        dsn=normalized_dsn,
        environment=_normalize(environment),
        release=_normalize(release),
        send_default_pii=False,
    )
    return True


def capture_server_exception(error: Exception, request: Request) -> None:
    raw_scope = getattr(request, "scope", {})
    request_scope = raw_scope if isinstance(raw_scope, dict) else {}
    route = request_scope.get("route")
    route_path = getattr(route, "path", None)
    method = request_scope.get("method")
    if not isinstance(method, str):
        try:
            method = request.method
        except (AttributeError, KeyError):
            method = None

    with sentry_sdk.new_scope() as scope:
        if isinstance(method, str) and method:
            scope.set_tag("http.method", method)
        if isinstance(route_path, str) and route_path:
            scope.set_tag("http.route", route_path)
        sentry_sdk.capture_exception(error)
