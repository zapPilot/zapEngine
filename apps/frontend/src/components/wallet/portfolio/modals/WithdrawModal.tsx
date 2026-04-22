import { Coins, Layers } from 'lucide-react';
import type { ReactNode } from 'react';

import {
  type AssetCategoryKey,
  getCategoryForToken,
} from '@/lib/domain/assetCategoryUtils';
import { transactionServiceMock } from '@/services';
import type { WithdrawModalProps } from '@/types/ui/ui.types';

import { TransactionModalBase } from './base/TransactionModalBase';
import * as modalDeps from './transactionModalDependencies';

const CATEGORIES: {
  id: AssetCategoryKey;
  label: string;
  icon: ReactNode;
}[] = [
  {
    id: 'stablecoin',
    label: 'Stablecoins',
    icon: <Coins className="w-3 h-3 text-emerald-400" />,
  },
  {
    id: 'btc',
    label: 'Bitcoin',
    icon: <span className="text-orange-400 font-bold text-xs">₿</span>,
  },
  {
    id: 'eth',
    label: 'Ethereum',
    icon: <span className="text-blue-400 font-bold text-xs">Ξ</span>,
  },
  {
    id: 'altcoin',
    label: 'Altcoins',
    icon: <Layers className="w-3 h-3 text-purple-400" />,
  },
];

export function WithdrawModal({
  isOpen,
  onClose,
  defaultChainId = 1,
}: WithdrawModalProps) {
  const { dropdownState, isConnected } = modalDeps.useTransactionModalState();

  return (
    <TransactionModalBase
      isOpen={isOpen}
      onClose={onClose}
      title="Withdraw from Pilot"
      indicatorColor="bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]"
      defaultChainId={defaultChainId}
      slippage={0.5}
      submitFn={transactionServiceMock.simulateWithdraw}
      successMessage="Withdrawal Executed Successfully!"
      successTone="indigo"
      modalContentClassName="p-0 overflow-visible bg-gray-950 border-gray-800"
    >
      {(modalState) => {
        const tokens = modalState.transactionData.tokenQuery.data || [];
        const tokensByCategory = CATEGORIES.reduce(
          (acc, cat) => {
            acc[cat.id] = tokens.filter(
              (t) => getCategoryForToken(t.symbol) === cat.id,
            );
            return acc;
          },
          {} as Record<AssetCategoryKey, typeof tokens>,
        );

        const { handlePercentage, isValid } = modalDeps.buildModalFormState(
          modalState.form,
          () =>
            parseFloat(
              modalState.transactionData.balances[
                modalState.transactionData.selectedToken?.address || ''
              ]?.balance || '0',
            ),
        );

        const actionLabel = modalDeps.resolveActionLabel({
          isConnected,
          hasSelection: Boolean(modalState.transactionData.selectedToken),
          isReady: isValid,
          selectionLabel: 'Select Asset',
          notReadyLabel: 'Enter Amount',
          readyLabel: 'Review & Withdraw',
        });

        const assetContent = (
          <div className="max-h-80 overflow-y-auto custom-scrollbar">
            {CATEGORIES.map((category) => {
              const catTokens = tokensByCategory[category.id] || [];
              if (catTokens.length === 0) return null;

              return (
                <div
                  key={category.id}
                  className="border-b border-gray-800 last:border-0"
                >
                  <div className="px-4 py-2 bg-gray-950/50 text-[10px] uppercase font-bold text-gray-500 flex items-center gap-2 tracking-wider sticky top-0 z-10 backdrop-blur-sm">
                    {category.icon} {category.label}
                  </div>
                  <div className="p-1">
                    {catTokens.map((token) => {
                      const isSelected =
                        modalState.transactionData.selectedToken?.address ===
                        token.address;
                      const bal =
                        modalState.transactionData.balances[token.address]
                          ?.balance || '0';
                      return (
                        <modalDeps.TokenOptionButton
                          key={token.address}
                          symbol={token.symbol}
                          balanceLabel={`${bal} available`}
                          isSelected={isSelected}
                          onSelect={() => {
                            modalState.form.setValue(
                              'tokenAddress',
                              token.address,
                            );
                            dropdownState.closeDropdowns();
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {tokens.length === 0 && <modalDeps.EmptyAssetsMessage />}
          </div>
        );

        return (
          <modalDeps.TransactionModalContent
            modalState={modalState}
            dropdownState={dropdownState}
            actionLabel={actionLabel}
            actionGradient="from-indigo-600 to-violet-600"
            handlePercentage={handlePercentage}
            assetContent={assetContent}
          />
        );
      }}
    </TransactionModalBase>
  );
}
