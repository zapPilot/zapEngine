/**
 * Transaction Submission Hook
 *
 * Handles form submission with status management:
 * - Submit validation and execution
 * - Status tracking (idle, submitting, success)
 * - Result storage
 * - State reset
 *
 * Simplified by internalizing status state (no separate useTransactionStatus hook).
 */

import { useState } from "react";
import type { UseFormReturn } from "react-hook-form";

import type {
  TransactionFormData,
  TransactionResult,
  TransactionToken,
} from "@/types/domain/transaction";

export function useTransactionSubmission(
  form: UseFormReturn<TransactionFormData>,
  isConnected: boolean,
  selectedToken: TransactionToken | null,
  submitFn: (values: TransactionFormData) => Promise<TransactionResult>,
  onClose: () => void
) {
  // Status state (internalized from useTransactionStatus)
  const [status, setStatus] = useState<"idle" | "submitting" | "success">(
    "idle"
  );
  const [result, setResult] = useState<TransactionResult | null>(null);

  // Destructure formState to ensure proper subscription to changes
  const { isValid } = form.formState;

  const isSubmitDisabled =
    status === "submitting" || !isValid || !isConnected || !selectedToken;

  const handleSubmit = form.handleSubmit(async values => {
    setStatus("submitting");
    try {
      const response = await submitFn(values);
      setResult(response);
      setStatus("success");
    } catch (error) {
      setStatus("idle");
      throw error;
    }
  });

  const resetState = () => {
    setStatus("idle");
    setResult(null);
    onClose();
  };

  return {
    // Status state
    status,
    result,
    isSubmitting: status === "submitting" || status === "success",

    // Submit controls
    isSubmitDisabled,
    handleSubmit,
    resetState,
  } as const;
}
