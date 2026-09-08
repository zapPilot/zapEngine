"""Explicit logging configuration and per-request timing records.

Without this module the root logger stays at its default WARNING level, so every
``logger.info`` in the service — the ``PERF:`` timings, the ``_timed`` blocks,
the trend cache statistics — is discarded before it reaches a handler. That is
why the slow analytics paths stayed invisible in production.
"""

from __future__ import annotations

import logging
import logging.config
from typing import Any

import sentry_sdk

# Every module here calls ``logging.getLogger(__name__)`` under the ``src``
# package, so one named logger governs the whole application surface without
# raising the root level for third-party libraries.
APP_LOGGER_NAME = "src"

REQUEST_LOGGER_NAME = f"{APP_LOGGER_NAME}.request"

# A request slower than this is an incident, not a data point: analytics queries
# that take this long are the ones that used to stall the whole event loop.
SLOW_REQUEST_THRESHOLD_MS = 5_000.0

# Loggers pinned below the application level, with the reason each is muted.
_QUIET_LOGGERS: dict[str, str] = {
    # Four INFO lines per pool-performance request drown the timings that
    # actually matter; a genuinely slow one still surfaces via the slow-request
    # warning emitted by the request middleware.
    "src.services.portfolio.pool_performance_service": "WARNING",
    # Statement-level SQL echo would multiply every request by its query count
    # and leak parameter values into the log stream.
    "sqlalchemy.engine": "WARNING",
}

LOGGING_CONFIG: dict[str, Any] = {
    "version": 1,
    # Module-level loggers are created at import time, long before this config
    # is applied; disabling them would silence the service it is meant to open up.
    "disable_existing_loggers": False,
    "formatters": {
        "standard": {
            "format": "%(asctime)s %(levelname)s %(name)s %(message)s",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "stream": "ext://sys.stdout",
            "formatter": "standard",
        },
    },
    # The console handler hangs off the application logger, and the root logger
    # is deliberately absent from this config: a non-incremental dictConfig
    # detaches every handler already on a logger it names, and on root that
    # includes handlers installed by the host — pytest's log capture among them,
    # which would make application logs invisible to the tests that assert on
    # them. Records still propagate to root, so a host that installs its own
    # root handler keeps seeing them.
    "loggers": {
        APP_LOGGER_NAME: {"handlers": ["console"], "level": "INFO"},
        **{name: {"level": level} for name, level in _QUIET_LOGGERS.items()},
    },
}


def configure_logging() -> None:
    """Install the application logging configuration.

    Must run before anything that emits startup logs, Sentry initialization
    included, so that its outcome is actually recorded.
    """
    logging.config.dictConfig(LOGGING_CONFIG)


def log_request_completion(
    *,
    method: str,
    route: str,
    status_code: int,
    duration_ms: float,
    user_id: str | None,
) -> None:
    """Record one completed request, escalating the slow ones.

    A slow request also becomes a Sentry breadcrumb so that the next captured
    exception carries the latency that preceded it.
    """
    is_slow = duration_ms >= SLOW_REQUEST_THRESHOLD_MS
    details = {
        "http_method": method,
        "http_route": route,
        "http_status": status_code,
        "duration_ms": round(duration_ms, 2),
        "user_id": user_id,
    }

    if is_slow:
        sentry_sdk.add_breadcrumb(
            category="request.slow",
            level="warning",
            message=f"{method} {route} took {duration_ms:.0f}ms",
            data=details,
        )

    logging.getLogger(REQUEST_LOGGER_NAME).log(
        logging.WARNING if is_slow else logging.INFO,
        "%s %s -> %d in %.1fms (user=%s)",
        method,
        route,
        status_code,
        duration_ms,
        user_id or "-",
        extra=details,
    )
