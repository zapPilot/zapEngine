import { type ServiceResult, wrapServiceCall } from "@/lib/errors";
import {
  transformWalletData,
  type WalletData,
} from "@/lib/validation/walletUtils";

import {
  addWalletToBundle,
  getUserWallets,
  removeUserEmail as removeUserEmailRequest,
  removeWalletFromBundle,
  updateUserEmail,
  updateWalletLabel as updateWalletLabelRequest,
} from "./accountService";

/**
 * Load wallets for a specific user and normalise the API response.
 */
export async function loadWallets(userId: string): Promise<WalletData[]> {
  try {
    const wallets = await getUserWallets(userId);
    return transformWalletData(wallets);
  } catch {
    // Return empty array if fetching wallets fails
    return [];
  }
}

/**
 * Add a wallet to a user's bundle.
 */
export async function addWallet(
  userId: string,
  address: string,
  label: string
): Promise<ServiceResult> {
  return wrapServiceCall(async () => {
    await addWalletToBundle(userId, address, label);
  });
}

/**
 * Remove a wallet from the user's bundle.
 */
export async function removeWallet(
  userId: string,
  walletId: string
): Promise<ServiceResult> {
  return wrapServiceCall(async () => {
    await removeWalletFromBundle(userId, walletId);
  });
}

/**
 * Update a wallet label within the user's bundle.
 */
export async function updateManagedWalletLabel(
  userId: string,
  walletAddress: string,
  newLabel: string
): Promise<ServiceResult> {
  return wrapServiceCall(async () => {
    await updateWalletLabelRequest(userId, walletAddress, newLabel);
  });
}

/**
 * Subscribe a user to email updates for bundle activity.
 */
export async function updateUserEmailSubscription(
  userId: string,
  email: string
): Promise<void> {
  await updateUserEmail(userId, email);
}

/**
 * Remove the user's email subscription.
 */
export async function unsubscribeUserEmail(userId: string): Promise<void> {
  await removeUserEmailRequest(userId);
}
