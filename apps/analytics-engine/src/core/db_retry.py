"""Retry classification for transient PostgreSQL disconnects.

Supabase's pooler drops idle and mid-query connections during platform
maintenance; the same read succeeds on a fresh pooled connection. The query
service is read-only, so it repeats the statement once instead of turning a
self-healing blip into a 500.
"""

import re

from sqlalchemy.exc import DBAPIError

# psycopg2/psycopg raise these as OperationalError while the connection is
# already gone. SQLAlchemy marks most of them connection_invalidated; the
# encoding one is raised during handshake and may not be.
TRANSIENT_DISCONNECT_PATTERNS = (
    "ssl connection has been closed",
    "server didn't return client encoding",
    "connection reset by peer",
    "server closed the connection unexpectedly",
    "terminating connection due to administrator command",
    "could not receive data from server",
    "connection already closed",
    "connection has been closed",
    "the database system is starting up",
)

_TRANSIENT_DISCONNECT_RE = re.compile(
    "|".join(re.escape(pattern) for pattern in TRANSIENT_DISCONNECT_PATTERNS),
    re.IGNORECASE,
)


def is_transient_disconnect(error: BaseException) -> bool:
    """Whether ``error`` is a connection drop worth one fresh-connection retry."""
    if not isinstance(error, DBAPIError):
        return False
    if error.connection_invalidated:
        return True
    return bool(_TRANSIENT_DISCONNECT_RE.search(str(error)))
