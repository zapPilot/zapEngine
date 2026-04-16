import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import type { TransactionFormData } from "@/types/domain/transaction";

const transactionSchema = z.object({
  chainId: z.number().int().positive(),
  tokenAddress: z.string().min(4),
  amount: z.string().refine(
    value => {
      const numeric = parseFloat(value);
      return !Number.isNaN(numeric) && numeric > 0;
    },
    { message: "Enter a valid amount greater than 0" }
  ),
  slippage: z.number().min(0.1).max(50).optional(),
  intensity: z.number().min(0).max(100).optional(),
});

export function useTransactionForm(
  defaultValues?: Partial<TransactionFormData>
) {
  return useForm<TransactionFormData>({
    resolver: zodResolver(transactionSchema),
    mode: "onChange",
    defaultValues: {
      chainId: 1,
      tokenAddress: "",
      amount: "",
      slippage: 0.5,
      intensity: 50,
      ...defaultValues,
    },
  });
}
