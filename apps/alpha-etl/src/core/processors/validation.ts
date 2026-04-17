import { z } from "zod";
import {
  WalletFetchJobMetadataSchema,
  type WalletFetchJobMetadata,
  type ETLJob,
} from "../../types/index.js";

export const ETLJobSchema = z
  .object({
    jobId: z.string(),
    trigger: z.enum(["manual", "scheduled", "webhook"]),
    status: z.enum(["pending", "processing", "completed", "failed"]),
    sources: z.array(z.string()).optional(),
    filters: z
      .object({
        chains: z.array(z.string()).optional(),
        protocols: z.array(z.string()).optional(),
        minTvl: z.number().optional(),
      })
      .optional(),
    metadata: z.unknown().optional(),
    createdAt: z.union([z.date(), z.string()]),
    completedAt: z.union([z.date(), z.string()]).optional(),
  })
  .passthrough();

export function validateETLJob(job: ETLJob): void {
  ETLJobSchema.parse(job);
}

export function validateWalletFetchJob(job: ETLJob): WalletFetchJobMetadata {
  ETLJobSchema.parse(job);

  if (!job.metadata || !("walletAddress" in job.metadata)) {
    throw new Error("Wallet address missing from job metadata");
  }

  const parsed = WalletFetchJobMetadataSchema.safeParse(job.metadata);
  if (!parsed.success) {
    if (containsWalletAddressValidationError(parsed.error.issues)) {
      throw new Error("Wallet address missing from job metadata");
    }
    throw new Error("Invalid wallet_fetch metadata");
  }

  return parsed.data;
}

function containsWalletAddressValidationError(
  errors: { path: PropertyKey[] }[],
): boolean {
  return errors.some((error) => error.path.includes("walletAddress"));
}
