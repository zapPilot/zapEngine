import { AnimatePresence, motion } from 'framer-motion';
import { Check } from 'lucide-react';
import type { ReactNode, RefObject } from 'react';

import { AppImage } from '@/components/ui';
import { dropdownMenu } from '@/lib/ui/animationVariants';
import { cn } from '@/lib/ui/classNames';
import type { ChainData } from '@/types/domain/transaction';

import type { TransactionModalState } from '../base/TransactionModalBase';
import type { TransactionDropdownState } from '../hooks/useTransactionDropdownState';
import { getChainLogo } from '../utils/assetHelpers';
import { buildFormActionsProps } from '../utils/modalHelpers';
import { CompactSelectorButton } from './CompactSelectorButton';
import { TransactionFormActionsWithForm } from './TransactionModalParts';

interface DropdownPanelProps {
  isOpen: boolean;
  className: string;
  children: ReactNode;
}

function DropdownPanel({ isOpen, className, children }: DropdownPanelProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial="initial"
          animate="animate"
          exit="exit"
          variants={dropdownMenu}
          className={className}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface SelectorTriggerProps {
  onClick: () => void;
  icon: ReactNode;
  label: string;
  value: string;
  isOpen: boolean;
}

function SelectorTrigger({
  onClick,
  icon,
  label,
  value,
  isOpen,
}: SelectorTriggerProps) {
  return (
    <div className="cursor-pointer">
      <CompactSelectorButton
        onClick={onClick}
        icon={icon}
        label={label}
        value={value}
        isOpen={isOpen}
      />
    </div>
  );
}

interface ChainSelectorProps {
  chainId: number;
  chainList: ChainData[];
  selectedChain: ChainData | null;
  isOpen: boolean;
  onToggle: () => void;
  onSelect: (chainId: number) => void;
}

function ChainSelector({
  chainId,
  chainList,
  selectedChain,
  isOpen,
  onToggle,
  onSelect,
}: ChainSelectorProps) {
  return (
    <div className="relative">
      <SelectorTrigger
        onClick={onToggle}
        icon={
          <AppImage
            src={getChainLogo(selectedChain?.chainId)}
            width={32}
            height={32}
            className="w-8 h-8 rounded-full bg-black p-1"
            alt={selectedChain?.name ?? 'Chain'}
          />
        }
        label="Network"
        value={selectedChain?.name ?? 'Select'}
        isOpen={isOpen}
      />

      <DropdownPanel
        isOpen={isOpen}
        className="absolute top-full left-0 mt-2 w-full bg-gray-900 border border-gray-800 rounded-xl shadow-2xl overflow-hidden z-30"
      >
        <div className="p-2 space-y-1 max-h-60 overflow-y-auto custom-scrollbar">
          {chainList.map((chain) => (
            <button
              key={chain.chainId}
              onClick={() => onSelect(chain.chainId)}
              className={cn(
                'w-full flex items-center gap-3 p-2 rounded-lg hover:bg-gray-800 transition-colors cursor-pointer',
                chainId === chain.chainId && 'bg-gray-800',
              )}
            >
              <AppImage
                src={getChainLogo(chain.chainId)}
                width={24}
                height={24}
                className="w-6 h-6 rounded-full"
                alt={chain.name}
              />
              <span className="text-sm font-medium text-white">
                {chain.name}
              </span>
            </button>
          ))}
        </div>
      </DropdownPanel>
    </div>
  );
}

interface AssetSelectorProps {
  isOpen: boolean;
  onToggle: () => void;
  selectedSymbol?: string | undefined;
  children: ReactNode;
}

function AssetSelector({
  isOpen,
  onToggle,
  selectedSymbol,
  children,
}: AssetSelectorProps) {
  return (
    <div className="relative">
      <SelectorTrigger
        onClick={onToggle}
        icon={
          <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold border border-indigo-500/30">
            {selectedSymbol?.[0] ?? '?'}
          </div>
        }
        label="Asset"
        value={selectedSymbol ?? 'Select Asset'}
        isOpen={isOpen}
      />

      <DropdownPanel
        isOpen={isOpen}
        className="absolute top-full right-0 mt-2 w-[280px] bg-gray-900 border border-gray-800 rounded-xl shadow-2xl overflow-hidden z-30"
      >
        {children}
      </DropdownPanel>
    </div>
  );
}

interface TokenOptionButtonProps {
  symbol: string;
  balanceLabel: string;
  isSelected: boolean;
  onSelect: () => void;
}

export function TokenOptionButton({
  symbol,
  balanceLabel,
  isSelected,
  onSelect,
}: TokenOptionButtonProps) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        'w-full flex items-center justify-between p-2.5 rounded-lg transition-colors group cursor-pointer',
        isSelected ? 'bg-indigo-500/10' : 'hover:bg-gray-800',
      )}
    >
      <div className="flex items-center gap-3">
        <div className="w-6 h-6 rounded-full bg-gray-800 flex items-center justify-center text-[10px] font-bold text-gray-400 group-hover:bg-gray-700">
          {symbol[0]}
        </div>
        <div className="text-left">
          <div
            className={cn(
              'text-sm font-medium',
              isSelected ? 'text-indigo-300' : 'text-gray-300',
            )}
          >
            {symbol}
          </div>
          <div className="text-[10px] text-gray-500">{balanceLabel}</div>
        </div>
      </div>
      {isSelected && <Check className="w-3 h-3 text-indigo-400" />}
    </button>
  );
}

interface EmptyAssetsMessageProps {
  message?: string;
}

export function EmptyAssetsMessage({
  message = 'No assets found.',
}: EmptyAssetsMessageProps) {
  return <div className="p-6 text-center text-gray-500 text-sm">{message}</div>;
}

interface TransactionModalLayoutProps {
  dropdownRef: RefObject<HTMLDivElement | null>;
  chainSelector: ReactNode;
  assetSelector: ReactNode;
  formActions: ReactNode;
}

function TransactionModalLayout({
  dropdownRef,
  chainSelector,
  assetSelector,
  formActions,
}: TransactionModalLayoutProps) {
  return (
    <div className="flex flex-col gap-6" ref={dropdownRef}>
      <div className="grid grid-cols-2 gap-3 z-20">
        {chainSelector}
        {assetSelector}
      </div>

      <div className="relative z-10">{formActions}</div>
    </div>
  );
}

interface TransactionModalContentProps {
  modalState: TransactionModalState;
  dropdownState: TransactionDropdownState;
  actionLabel: string;
  actionGradient: string;
  handlePercentage: (pct: number) => void;
  assetContent: ReactNode;
}

export function TransactionModalContent({
  modalState,
  dropdownState,
  actionLabel,
  actionGradient,
  handlePercentage,
  assetContent,
}: TransactionModalContentProps) {
  const {
    form,
    chainId,
    amount,
    transactionData,
    selectedChain,
    isSubmitDisabled,
    handleSubmit,
  } = modalState;

  const formActionsProps = buildFormActionsProps(
    form,
    amount,
    transactionData.selectedToken?.usdPrice,
    handlePercentage,
    actionLabel,
    isSubmitDisabled,
    actionGradient,
    handleSubmit,
  );

  const handleSelectChain = (selectedChainId: number): void => {
    form.setValue('chainId', selectedChainId);
    dropdownState.closeDropdowns();
  };

  const chainSelector = (
    <ChainSelector
      chainId={chainId}
      chainList={transactionData.chainList}
      selectedChain={selectedChain}
      isOpen={dropdownState.isChainDropdownOpen}
      onToggle={dropdownState.toggleChainDropdown}
      onSelect={handleSelectChain}
    />
  );

  const assetSelector = (
    <AssetSelector
      isOpen={dropdownState.isAssetDropdownOpen}
      onToggle={dropdownState.toggleAssetDropdown}
      selectedSymbol={transactionData.selectedToken?.symbol}
    >
      {assetContent}
    </AssetSelector>
  );

  return (
    <TransactionModalLayout
      dropdownRef={dropdownState.dropdownRef}
      chainSelector={chainSelector}
      assetSelector={assetSelector}
      formActions={<TransactionFormActionsWithForm {...formActionsProps} />}
    />
  );
}
