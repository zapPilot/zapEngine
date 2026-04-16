"""
Unit tests for wallet validation utility.

Tests validation and normalization of Ethereum wallet addresses.
"""

import pytest
from fastapi import HTTPException

from src.utils.wallet_validation import (
    validate_wallet_format,
)


class TestValidateWalletFormat:
    """Tests for validate_wallet_format function."""

    def test_valid_address_lowercase(self):
        """Test that valid lowercase address passes validation."""
        address = "0x742d35cc6634c0532925a3b844bc9e7595f0beb1"
        result = validate_wallet_format(address)
        assert result == address.lower()

    def test_valid_address_uppercase(self):
        """Test that valid uppercase address is normalized to lowercase."""
        address = "0x742D35CC6634C0532925A3B844BC9E7595F0BEB1"
        result = validate_wallet_format(address)
        assert result == address.lower()

    def test_valid_address_mixed_case(self):
        """Test that valid mixed-case address is normalized to lowercase."""
        address = "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1"
        result = validate_wallet_format(address)
        assert result == address.lower()

    def test_invalid_address_no_prefix(self):
        """Test that address without 0x prefix raises HTTPException."""
        with pytest.raises(HTTPException) as exc_info:
            validate_wallet_format("742d35cc6634c0532925a3b844bc9e7595f0beb1")
        assert exc_info.value.status_code == 422
        assert "valid Ethereum format" in exc_info.value.detail

    def test_invalid_address_too_short(self):
        """Test that address with fewer than 40 hex chars raises HTTPException."""
        with pytest.raises(HTTPException) as exc_info:
            validate_wallet_format("0x742d35cc6634c0532925a3b844bc9e7595f0b")
        assert exc_info.value.status_code == 422

    def test_invalid_address_too_long(self):
        """Test that address with more than 40 hex chars raises HTTPException."""
        with pytest.raises(HTTPException) as exc_info:
            validate_wallet_format("0x742d35cc6634c0532925a3b844bc9e7595f0beb00")
        assert exc_info.value.status_code == 422

    def test_invalid_address_non_hex_characters(self):
        """Test that address with non-hexadecimal characters raises HTTPException."""
        with pytest.raises(HTTPException) as exc_info:
            validate_wallet_format("0x742d35cc6634c0532925a3b844bc9e7595f0beg")
        assert exc_info.value.status_code == 422

    def test_invalid_address_empty_string(self):
        """Test that empty string raises HTTPException."""
        with pytest.raises(HTTPException) as exc_info:
            validate_wallet_format("")
        assert exc_info.value.status_code == 422

    def test_invalid_address_random_string(self):
        """Test that random string raises HTTPException."""
        with pytest.raises(HTTPException) as exc_info:
            validate_wallet_format("not-a-wallet-address")
        assert exc_info.value.status_code == 422


class TestWalletValidationIntegration:
    """Integration tests for wallet validation functions."""

    def test_validate_then_use_normalized_address(self):
        """Test that validated address can be used safely."""
        original = "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1"
        normalized = validate_wallet_format(original)

        # Normalized address should be lowercase
        assert normalized == "0x742d35cc6634c0532925a3b844bc9e7595f0beb1"
        assert normalized.islower()  # Except for '0x'
        assert normalized.startswith("0x")

    def test_multiple_validations_same_address(self):
        """Test that multiple validations produce consistent results."""
        addresses = [
            "0x742d35cc6634c0532925a3b844bc9e7595f0beb1",
            "0x742D35CC6634C0532925A3B844BC9E7595F0BEB1",
            "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1",
        ]

        normalized_addresses = [validate_wallet_format(addr) for addr in addresses]

        # All should normalize to the same lowercase address
        assert len(set(normalized_addresses)) == 1
        assert normalized_addresses[0] == "0x742d35cc6634c0532925a3b844bc9e7595f0beb1"
