"""
Wallet Validation Utility

Provides validation functions for Ethereum wallet addresses used in analytics filtering.
"""

import re

from fastapi import HTTPException

# Ethereum address pattern: 0x followed by 40 hexadecimal characters
ETH_ADDRESS_PATTERN = re.compile(r"^0x[a-fA-F0-9]{40}$")


def validate_wallet_format(wallet_address: str) -> str:
    """
    Validate and normalize Ethereum wallet address.

    Args:
        wallet_address: The wallet address to validate

    Returns:
        Normalized wallet address (lowercase)

    Raises:
        HTTPException: 422 if wallet address format is invalid

    Examples:
        >>> validate_wallet_format("0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb")
        "0x742d35cc6634c0532925a3b844bc9e7595f0beb"

        >>> validate_wallet_format("invalid")
        HTTPException(status_code=422, detail="Wallet address must be valid Ethereum format")
    """
    if not ETH_ADDRESS_PATTERN.match(wallet_address):
        raise HTTPException(
            status_code=422,
            detail="Wallet address must be valid Ethereum format (0x followed by 40 hex characters)",
        )

    # Normalize to lowercase for consistent comparison
    return wallet_address.lower()
