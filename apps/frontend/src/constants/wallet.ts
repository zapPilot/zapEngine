/**
 * Wallet-related UI constants
 * Centralized labels to ensure consistency across the application
 */

export const WALLET_LABELS = {
  CONNECT: "Connect Wallet",
  DISCONNECT: "Disconnect",
  SWITCH: "Switch Wallet",
  ADD: "Add Wallet",
  REMOVE: "Remove Wallet",
  COPY_ADDRESS: "Copy Address",
} as const;

export const WALLET_MESSAGES = {
  ADDRESS_COPIED: "copied to clipboard",
  WALLET_SWITCHED: "Active wallet changed to",
  SWITCH_FAILED: "Switch Failed",
  DELETION_FAILED: "Deletion Failed",
  DISCONNECT_WALLET: "Disconnect Wallet",
  ACCOUNT_DELETED: "Account Deleted",
} as const;
