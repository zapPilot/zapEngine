import { type ReactNode, useEffect } from "react";
import type { UseFormReturn } from "react-hook-form";

import { Modal, ModalContent } from "@/components/ui/modal";
import { useWalletProvider } from "@/providers/WalletProvider";
import type {
  ChainData,
  TransactionFormData,
  TransactionResult,
} from "@/types/domain/transaction";

import {
  SubmittingState,
  TransactionModalHeader,
} from "../components/TransactionModalParts";
import type { useTransactionData } from "../hooks/useTransactionData";
import { useTransactionForm } from "../hooks/useTransactionForm";
import { useTransactionSubmission } from "../hooks/useTransactionSubmission";
import { useWatchedTransactionData } from "../hooks/useWatchedTransactionData";

/**
 * State exposed to render prop children for custom modal content
 */
export interface TransactionModalState {
  form: UseFormReturn<TransactionFormData>;
  chainId: number;
  amount: string;
  transactionData: ReturnType<typeof useTransactionData>;
  selectedChain: ChainData | null;
  isSubmitting: boolean;
  isSubmitDisabled: boolean;
  handleSubmit: () => Promise<void> | void;
}

/**
 * Base configuration for transaction modals
 */
export interface TransactionModalBaseProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  indicatorColor: string;
  defaultChainId?: number;
  slippage?: number;
  submitFn: (data: TransactionFormData) => Promise<TransactionResult>;
  successMessage?: string;
  successTone?: "green" | "indigo";
  successExtra?: ReactNode;
  modalContentClassName?: string;
  children: (state: TransactionModalState) => ReactNode;
}

/**
 * TransactionModalBase - Shared modal wrapper for Deposit/Withdraw/Rebalance flows
 *
 * Handles:
 * - Modal shell structure
 * - Transaction state management
 * - Submitting/success UI
 * - Header with indicator
 *
 * Delegates content rendering to render prop pattern for flexibility.
 */
export function TransactionModalBase({
  isOpen,
  onClose,
  title,
  indicatorColor,
  defaultChainId = 1,
  slippage,
  submitFn,
  successMessage,
  successTone = "indigo",
  successExtra,
  modalContentClassName = "p-0 overflow-hidden bg-gray-950 border-gray-800",
  children,
}: TransactionModalBaseProps) {
  const { isConnected } = useWalletProvider();

  // 1. Form management
  const form = useTransactionForm({
    chainId: defaultChainId,
    ...(slippage !== undefined ? { slippage } : {}),
  });

  // 2. Watch form values & fetch data (tokens, chains, balances)
  const { chainId, tokenAddress, amount, transactionData } =
    useWatchedTransactionData(form, isOpen);

  // Auto-select first token when tokens load and no token is selected
  useEffect(() => {
    const tokens = transactionData.availableTokens;
    const firstToken = tokens[0];
    if (tokens.length > 0 && !tokenAddress && firstToken) {
      form.setValue("tokenAddress", firstToken.address, {
        shouldValidate: true,
      });
    }
  }, [transactionData.availableTokens, tokenAddress, form]);

  // 3. Submission handling
  const submission = useTransactionSubmission(
    form,
    isConnected,
    transactionData.selectedToken,
    submitFn,
    onClose
  );

  // Derived state
  const selectedChain = transactionData.selectedChain;
  const isSubmitting = submission.isSubmitting;

  const resetState = () => {
    submission.resetState();
  };

  const renderState: TransactionModalState = {
    form,
    chainId,
    amount,
    transactionData,
    selectedChain,
    isSubmitting,
    isSubmitDisabled: submission.isSubmitDisabled,
    handleSubmit: submission.handleSubmit,
  };

  return (
    <Modal isOpen={isOpen} onClose={resetState} maxWidth="md">
      <ModalContent className={modalContentClassName}>
        <TransactionModalHeader
          title={title}
          indicatorClassName={indicatorColor}
          isSubmitting={isSubmitting}
          onClose={resetState}
        />

        <div className="p-6">
          {isSubmitting ? (
            <SubmittingState
              isSuccess={submission.status === "success"}
              {...(successMessage ? { successMessage } : {})}
              successTone={successTone}
              successExtra={successExtra}
            />
          ) : (
            children(renderState)
          )}
        </div>
      </ModalContent>
    </Modal>
  );
}
