import { createValidator } from '@core/schemas/schemaUtils';
import { EtlErrorCodeEnum, type EtlJobStatus } from '@zapengine/types/etl';
import { z } from 'zod';

/**
 * Zod schemas for account service API responses
 *
 * These schemas provide runtime validation for account-related API responses,
 * ensuring type safety and catching malformed data before it causes runtime errors.
 */

// ============================================================================
// USER SCHEMAS
// ============================================================================

/**
 * Schema for base user object
 */
export const userSchema = z.object({
  id: z.string(),
  // eslint-disable-next-line sonarjs/deprecation
  email: z.string().email().nullable().optional(),
  is_subscribed_to_reports: z.boolean(),
  created_at: z.string(),
});

/**
 * Schema for user crypto wallet
 */
export const userCryptoWalletSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  wallet: z.string(),
  // Backend sometimes returns null for label; accept nullable to avoid hard failures
  label: z.string().nullable().optional(),
  ownership_verified_at: z.string().nullable().optional(),
  created_at: z.string(),
});

/**
 * Schema for subscription plan
 */
export const planSchema = z.object({
  code: z.string(),
  name: z.string(),
  tier: z.number(),
});

/**
 * Schema for user subscription
 */
export const userSubscriptionSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  plan_code: z.string(),
  starts_at: z.string(),
  // Backend may return null for open-ended subscriptions
  ends_at: z.string().nullable().optional(),
  is_canceled: z.boolean(),
  created_at: z.string(),
  plan: planSchema.optional(),
});

/**
 * Schema for account token
 */
export const accountTokenSchema = z.object({
  id: z.string(),
  chain: z.string(),
  name: z.string(),
  symbol: z.string(),
  display_symbol: z.string().optional().nullable(),
  optimized_symbol: z.string().optional().nullable(),
  decimals: z.number(),
  logo_url: z.string().optional().nullable(),
  protocol_id: z.string().optional().nullable(),
  price: z.number(),
  is_verified: z.boolean(),
  is_core: z.boolean(),
  is_wallet: z.boolean(),
  time_at: z.number().optional().nullable(),
  amount: z.number(),
});

/**
 * Schema for health check response
 */
export const healthCheckResponseSchema = z.object({
  status: z.string(),
  timestamp: z.string(),
});

// ============================================================================
// API RESPONSE SCHEMAS
// ============================================================================

/**
 * Schema for ETL job status response - accepts the API's snake_case directly
 *
 * Only requires job_id and status (the fields we actually use). All other
 * fields are optional to handle partial API responses gracefully, and
 * passthrough() allows future API additions without breaking validation.
 *
 * This schema accepts the API response as-is without transformation, which:
 * - Prevents accidentally dropping fields (like message, rate_limited)
 * - Simplifies the codebase (no transformation logic to maintain)
 * - Matches the existing snake_case convention at the top level
 * - Future-proofs against new API fields
 */
export const etlJobStatusResponseSchema = z
  .object({
    job_id: z.string(),
    status: z.enum(['pending', 'processing', 'completed', 'failed']),
    created_at: z.string().optional(),
    updated_at: z.string().optional(),
    completed_at: z.string().optional(),
    records_processed: z.number().optional(),
    records_inserted: z.number().optional(),
    duration: z.number().optional(),
    message: z.string().optional(),
    rate_limited: z.boolean().optional(),
    error: z
      .object({
        code: EtlErrorCodeEnum,
        message: z.string(),
      })
      .optional(),
  })
  // eslint-disable-next-line sonarjs/deprecation
  .passthrough(); // Allow additional fields without failing validation

/**
 * Schema for the wallet fetch trigger endpoint.
 *
 * Unlike job status responses, the trigger endpoint may return a null job_id
 * when account-engine rate limits a fetch request, but consumers still need a
 * stable status/message boundary before treating the trigger as successful.
 */
export const etlJobTriggerResponseSchema = z.object({
  job_id: z.string().nullable(),
  status: z.string(),
  message: z.string(),
  rate_limited: z.boolean().optional(),
});

export const walletUserLookupResponseSchema = z.object({
  user_id: z.string(),
});

export const connectWalletResponseSchema = z.object({
  user_id: z.string(),
  is_new_user: z.boolean(),
  etl_job: etlJobTriggerResponseSchema.optional(),
});

/**
 * Schema for add wallet response
 */
export const addWalletResponseSchema = z.object({
  wallet_id: z.string(),
  message: z.string(),
  ownership_verified: z.boolean(),
});

export const verifyWalletResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  ownership_verified_at: z.iso.datetime({ offset: true }),
});

export const ownershipChallengeSchema = z.object({
  nonce: z.string().length(64),
  message: z.string().min(1),
  expiresAt: z.string(),
});

/**
 * Schema for update email response
 */
export const updateEmailResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

/**
 * Schema for simple message response
 */
export const messageResponseSchema = z.object({
  message: z.string(),
});

/**
 * Schema for user profile response
 */
export const userProfileResponseSchema = z.object({
  user: userSchema,
  wallets: z.array(userCryptoWalletSchema),
  subscription: userSubscriptionSchema.optional(),
});

// ============================================================================
// TYPE EXPORTS
// ============================================================================

/**
 * Type inference from schemas
 * These types are automatically generated from the Zod schemas
 */
/** @public */ export type UserCryptoWallet = z.infer<
  typeof userCryptoWalletSchema
>;

/** @public */ export type WalletUserLookupResponse = z.infer<
  typeof walletUserLookupResponseSchema
>;
/** @public */ export type ConnectWalletResponse = z.infer<
  typeof connectWalletResponseSchema
>;
/** @public */ export type EtlJobTriggerResponse = z.infer<
  typeof etlJobTriggerResponseSchema
>;
/** @public */ export type AddWalletResponse = z.infer<
  typeof addWalletResponseSchema
>;
/** @public */ export type VerifyWalletResponse = z.infer<
  typeof verifyWalletResponseSchema
>;
/** @public */ export type OwnershipChallenge = z.infer<
  typeof ownershipChallengeSchema
>;
/** @public */ export type UpdateEmailResponse = z.infer<
  typeof updateEmailResponseSchema
>;
/** @public */ export type UserProfileResponse = z.infer<
  typeof userProfileResponseSchema
>;
/** @public */ export type MessageResponse = z.infer<
  typeof messageResponseSchema
>;
/** @public */ export type AccountToken = z.infer<typeof accountTokenSchema>;
/** @public */ export type HealthCheckResponse = z.infer<
  typeof healthCheckResponseSchema
>;

/**
 * Re-export EtlJobStatus from etl-contracts for convenience
 * This type is used in ConnectWalletResponse
 */
export type { EtlJobStatus };

// ============================================================================
// VALIDATION HELPER FUNCTIONS
// ============================================================================

export const validateConnectWalletResponse = createValidator(
  connectWalletResponseSchema,
);
export const validateEtlJobTriggerResponse = createValidator(
  etlJobTriggerResponseSchema,
);
export const validateAddWalletResponse = createValidator(
  addWalletResponseSchema,
);
export const validateVerifyWalletResponse = createValidator(
  verifyWalletResponseSchema,
);
export const validateOwnershipChallenge = createValidator(
  ownershipChallengeSchema,
);
export const validateUpdateEmailResponse = createValidator(
  updateEmailResponseSchema,
);
export const validateUserProfileResponse = createValidator(
  userProfileResponseSchema,
);
export const validateUserWallets = createValidator(
  z.array(userCryptoWalletSchema),
);
export const validateAccountTokens = createValidator(
  z.array(accountTokenSchema),
);
export const validateMessageResponse = createValidator(messageResponseSchema);
export const validateHealthCheckResponse = createValidator(
  healthCheckResponseSchema,
);
