import type { Tables } from '../types/database.types';

type OwnerWallet = Pick<
  Tables<'user_crypto_wallets'>,
  'id' | 'created_at' | 'owner_bound_at' | 'ownership_verified_at'
>;

/** Legacy verification stamps never grant authority to manage a bundle. */
export function classifyBundleWallet(
  wallet: OwnerWallet,
  wallets: readonly OwnerWallet[],
  userCreatedAt: string,
): 'owner' | 'founder' | 'watch' {
  if (wallet.owner_bound_at !== null) return 'owner';
  const first = [...wallets].sort(
    (a, b) =>
      Date.parse(a.created_at) - Date.parse(b.created_at) ||
      a.id.localeCompare(b.id),
  )[0];
  const offset = Date.parse(wallet.created_at) - Date.parse(userCreatedAt);
  if (first?.id === wallet.id && offset >= 0 && offset <= 1000)
    return 'founder';
  return 'watch';
}

export function canClaimBundleWallet(
  wallet: OwnerWallet,
  wallets: readonly OwnerWallet[],
  userCreatedAt: string,
): boolean {
  const role = classifyBundleWallet(wallet, wallets, userCreatedAt);
  return (
    role === 'owner' ||
    (role === 'founder' &&
      !wallets.some((candidate) => candidate.owner_bound_at !== null))
  );
}
