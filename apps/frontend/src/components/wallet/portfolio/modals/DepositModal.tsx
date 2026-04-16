import { transactionServiceMock as depositTransactionService } from "@/services";
import type { DepositModalProps } from "@/types/ui/ui.types";

import { TransactionModalBase } from "./base/TransactionModalBase";
import * as modalDeps from "./transactionModalDependencies";

export function DepositModal({
  isOpen,
  onClose,
  defaultChainId = 1,
}: DepositModalProps) {
  const { dropdownState, isConnected } = modalDeps.useTransactionModalState();

  return (
    <TransactionModalBase
      isOpen={isOpen}
      onClose={onClose}
      title="Deposit to Pilot"
      indicatorColor="bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]"
      defaultChainId={defaultChainId}
      submitFn={depositTransactionService.simulateDeposit}
      successMessage="Deposit Successfully Executed!"
      successTone="green"
      successExtra={
        <span className="text-xs underline cursor-pointer hover:text-green-300">
          View Tx
        </span>
      }
      modalContentClassName="p-0 overflow-visible bg-gray-950 border-gray-800"
    >
      {modalState => {
        const { handlePercentage, isValid } = modalDeps.buildModalFormState(
          modalState.form,
          () =>
            parseFloat(
              modalState.transactionData.balanceQuery.data?.balance || "0"
            )
        );

        const hasSelectedToken = Boolean(
          modalState.transactionData.selectedToken
        );
        const actionLabel = modalDeps.resolveActionLabel({
          isConnected,
          hasSelection: hasSelectedToken,
          isReady: isValid,
          selectionLabel: "Select Asset",
          notReadyLabel: "Enter Amount",
          readyLabel: "Review & Deposit",
        });

        const assetContent = (
          <div className="max-h-80 overflow-y-auto custom-scrollbar p-2">
            {modalState.transactionData.tokenQuery.data?.map(token => {
              const isSelected =
                modalState.transactionData.selectedToken?.address ===
                token.address;
              const balance =
                modalState.transactionData.balanceQuery.data?.balance || "0";
              return (
                <modalDeps.TokenOptionButton
                  key={token.address}
                  symbol={token.symbol}
                  balanceLabel={`${balance} available`}
                  isSelected={isSelected}
                  onSelect={() => {
                    modalState.form.setValue("tokenAddress", token.address);
                    dropdownState.closeDropdowns();
                  }}
                />
              );
            })}

            {(!modalState.transactionData.tokenQuery.data ||
              modalState.transactionData.tokenQuery.data.length === 0) && (
              <modalDeps.EmptyAssetsMessage />
            )}
          </div>
        );

        return (
          <modalDeps.TransactionModalContent
            modalState={modalState}
            dropdownState={dropdownState}
            actionLabel={actionLabel}
            actionGradient="from-indigo-600 to-purple-600"
            handlePercentage={handlePercentage}
            assetContent={assetContent}
          />
        );
      }}
    </TransactionModalBase>
  );
}
