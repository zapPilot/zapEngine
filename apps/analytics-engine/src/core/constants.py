"""
Centralized domain constants used across services and models.
"""

# Standardized portfolio categories
CATEGORIES: tuple[str, str, str, str] = ("btc", "eth", "stablecoins", "others")

# Financial calculation constants
# DeFi markets trade 24/7/365, so trading days = calendar days
TRADING_DAYS_PER_YEAR = 365  # DeFi markets (was 252 for TradFi)
CALENDAR_DAYS_PER_YEAR = 365  # Calendar days for annualization

# Cache TTL: wallet-specific queries update more frequently than bundle aggregates
CACHE_TTL_WALLET_HOURS = 2
CACHE_TTL_BUNDLE_HOURS = 12
