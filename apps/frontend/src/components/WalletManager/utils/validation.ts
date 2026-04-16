import { validateWalletAddress } from "@/lib/validation/walletUtils";

import type { NewWallet, ValidationResult } from "../types/wallet.types";

/**
 * Validate wallet address format
 * Internal function used by validateNewWallet
 */
function validateAddress(address: string): ValidationResult {
  const trimmedAddress = address.trim();
  if (!trimmedAddress) {
    return {
      isValid: false,
      error: "Wallet address is required",
    };
  }

  if (!validateWalletAddress(address)) {
    return {
      isValid: false,
      error:
        "Invalid wallet address format. Must be a 42-character Ethereum address starting with 0x",
    };
  }

  return { isValid: true };
}

/**
 * Validate wallet label
 * Internal function used by validateNewWallet
 */
function validateLabel(label: string): ValidationResult {
  const trimmedLabel = label.trim();
  if (!trimmedLabel) {
    return {
      isValid: false,
      error: "Wallet label is required",
    };
  }

  if (trimmedLabel.length < 2) {
    return {
      isValid: false,
      error: "Wallet label must be at least 2 characters long",
    };
  }

  return { isValid: true };
}

/**
 * Validate email format
 */
export function validateEmail(email: string): ValidationResult {
  const trimmedEmail = email.trim();
  if (!trimmedEmail) {
    return {
      isValid: false,
      error: "Email address is required",
    };
  }

  const emailRegex = /^[a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(email)) {
    return {
      isValid: false,
      error: "Please enter a valid email address",
    };
  }

  return { isValid: true };
}

/**
 * Validate new wallet form data
 */
export function validateNewWallet(wallet: NewWallet): ValidationResult {
  const labelValidation = validateLabel(wallet.label);
  if (!labelValidation.isValid) {
    return labelValidation;
  }

  const addressValidation = validateAddress(wallet.address);
  if (!addressValidation.isValid) {
    return addressValidation;
  }

  return { isValid: true };
}
