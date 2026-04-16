import type { UseFormReturn } from "react-hook-form";

import type { TransactionFormData } from "@/types/domain/transaction";

import { useTransactionData } from "./useTransactionData";

/**
 * Watches form values and feeds them into useTransactionData.
 *
 * Combines the common pattern of extracting chainId/tokenAddress/amount
 * from a transaction form and passing them to the data-fetching hook.
 *
 * @param form - The react-hook-form instance for the transaction
 * @param isOpen - Whether the parent UI (modal/panel) is active
 * @returns The transaction data result from useTransactionData
 */
export function useWatchedTransactionData(
  form: UseFormReturn<TransactionFormData>,
  isOpen: boolean
) {
  const chainId = form.watch("chainId");
  const tokenAddress = form.watch("tokenAddress");
  const amount = form.watch("amount");

  return {
    chainId,
    tokenAddress,
    amount,
    transactionData: useTransactionData({
      isOpen,
      chainId,
      tokenAddress,
      amount,
    }),
  };
}
