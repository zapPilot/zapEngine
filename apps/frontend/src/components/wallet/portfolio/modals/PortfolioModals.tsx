import type { ReactElement } from "react";

import type { WalletPortfolioDataWithDirection } from "@/adapters/walletPortfolioDataAdapter";
import {
  DepositModal,
  RebalanceModal,
  WithdrawModal,
} from "@/components/wallet/portfolio/modals";
import type { ModalType } from "@/types";

import { SettingsModal } from "./SettingsModal";

interface PortfolioModalsProps {
  activeModal: ModalType | null;
  onClose: () => void;
  data: WalletPortfolioDataWithDirection;
  isSettingsOpen: boolean;
  setIsSettingsOpen: (isOpen: boolean) => void;
  userId?: string | undefined;
}

export function PortfolioModals({
  activeModal,
  onClose,
  data,
  isSettingsOpen,
  setIsSettingsOpen,
  userId,
}: PortfolioModalsProps): ReactElement {
  const rebalanceAllocation = {
    crypto: data.currentAllocation.crypto,
    stable: data.currentAllocation.stable,
    simplifiedCrypto: data.currentAllocation.simplifiedCrypto,
  };

  function closeSettingsModal(): void {
    setIsSettingsOpen(false);
  }

  return (
    <>
      <DepositModal
        isOpen={activeModal === "deposit"}
        onClose={onClose}
        defaultChainId={1}
      />
      <WithdrawModal isOpen={activeModal === "withdraw"} onClose={onClose} />
      <RebalanceModal
        isOpen={activeModal === "rebalance"}
        onClose={onClose}
        currentAllocation={rebalanceAllocation}
        targetAllocation={data.targetAllocation}
      />
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={closeSettingsModal}
        userId={userId}
      />
    </>
  );
}
