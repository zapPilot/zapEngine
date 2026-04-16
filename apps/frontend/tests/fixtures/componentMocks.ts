/**
 * Shared test fixtures for WalletManager component tests.
 *
 * Eliminates near-identical defaultProps / defaultOperations / defaultNewWallet
 * objects across AddWalletForm, WalletList, and WalletActionMenu tests.
 */

import type {
  NewWallet,
  WalletOperations,
} from "@/components/WalletManager/types/wallet.types";
import type { WalletData } from "@/lib/validation/walletUtils";

/** Idle operations state with no loading or errors */
export const DEFAULT_WALLET_OPERATIONS: WalletOperations = {
  adding: { isLoading: false, error: null },
  removing: {},
  editing: {},
  subscribing: { isLoading: false, error: null },
};

/** Empty new wallet form state */
export const DEFAULT_NEW_WALLET: NewWallet = {
  label: "",
  address: "",
};

/** Reusable wallet fixture data */
export const MOCK_WALLET_1: WalletData = {
  id: "wallet1",
  address: "0x1234567890123456789012345678901234567890",
  label: "Main Wallet",
  isActive: false,
  isMain: false,
  createdAt: "2024-01-01T00:00:00Z",
};

export const MOCK_WALLET_2: WalletData = {
  id: "wallet2",
  address: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
  label: "Trading Wallet",
  isActive: false,
  isMain: false,
  createdAt: "2024-01-02T00:00:00Z",
};
