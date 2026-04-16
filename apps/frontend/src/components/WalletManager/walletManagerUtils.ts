export interface WalletManagerIdentity {
  realUserId: string;
  viewingUserId: string;
  isOwnerView: boolean;
}

export const getWalletDescription = (
  isConnected: boolean,
  isOwnerView: boolean
): string => {
  if (!isConnected) {
    return "No wallet connected";
  }

  if (isOwnerView) {
    return "Manage your wallet bundle";
  }

  return "Viewing wallet bundle";
};

export const getWalletManagerIdentity = (
  urlUserId: string | undefined,
  realUserId: string | undefined
): WalletManagerIdentity => {
  const viewingUserId = urlUserId ?? realUserId ?? "";
  const authenticatedUserId = realUserId ?? "";

  return {
    realUserId: authenticatedUserId,
    viewingUserId,
    isOwnerView: Boolean(
      authenticatedUserId && authenticatedUserId === viewingUserId
    ),
  };
};
