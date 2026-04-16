"""Router package exports and compatibility aliases."""

# Canonical backtesting router module.
from . import backtesting

# Backwards compatibility: legacy code/tests import `src.api.routers.portfolios`.
# Map it to the current v2 portfolio router module so those imports keep working.
from . import v2_portfolio as portfolios

__all__ = ["backtesting", "portfolios"]
