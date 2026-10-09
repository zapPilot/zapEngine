import { useEffect, useState } from 'react';
import { useEtlJobPolling } from '@zapengine/app-core/hooks/wallet/useEtlJobPolling';
import { useUserWallets } from '@zapengine/app-core/hooks/queries/wallet/useUserWallets';
import { useAccount } from '@/integration/useAccount';
import {
  DEFAULT_HOME_RANGE,
  type HomeRange,
  useHomeData,
} from '@/integration/useHomeData';
/** Net-worth loading stays independent of strategy evaluation and replay loading. */
export function useTodayPortfolio() {
  const account = useAccount();
  const [range, setRange] = useState<HomeRange>(DEFAULT_HOME_RANGE);
  const { state: etl, startPolling, triggerEtl } = useEtlJobPolling();
  const result = useHomeData(account.viewingUserId, range, {
    isResolvingSubject: account.isResolvingViewingUser,
    isEtlInProgress: account.isOwnBundle && etl.isInProgress,
  });
  const bundleWallets = useUserWallets(
    account.isOwnBundle ? null : account.viewingUserId,
  );
  const addresses = account.isOwnBundle
    ? account.walletAddresses
    : (bundleWallets.data?.map((wallet) => wallet.wallet) ?? []);
  useEffect(() => {
    if (
      account.isOwnBundle &&
      result.snapshotAvailability === 'unavailable' &&
      account.etlJobId &&
      etl.jobId !== account.etlJobId
    )
      startPolling(account.etlJobId, account.userId);
  }, [
    account.isOwnBundle,
    account.etlJobId,
    account.userId,
    result.snapshotAvailability,
    etl.jobId,
    startPolling,
  ]);
  const retryImport = () => {
    if (account.userId && account.address)
      void triggerEtl(account.userId, account.address);
  };
  return { account, range, setRange, result, etl, retryImport, addresses };
}
