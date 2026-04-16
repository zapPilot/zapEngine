import { z } from "zod";

/**
 * Zod schemas for balance service API responses
 *
 * These schemas provide runtime validation for balance-related API responses,
 * ensuring type safety and catching malformed data before it causes runtime errors.
 */

/**
 * Schema for individual token balance from API response
 * Supports multiple field naming conventions (camelCase and snake_case)
 */
export const tokenBalanceRawSchema = z
  .object({
    // Address fields (multiple conventions supported)
    address: z.string().optional(),
    tokenAddress: z.string().optional(),
    token_address: z.string().optional(),

    // Symbol and name fields
    symbol: z.string().optional(),
    tokenSymbol: z.string().optional(),
    /** @deprecated use symbol instead */
    token_symbol: z.string().optional(),
    name: z.string().optional(),
    tokenName: z.string().optional(),
    token_name: z.string().optional(),

    // Decimals (can be number or string)
    decimals: z.union([z.number(), z.string()]).optional(),
    tokenDecimals: z.union([z.number(), z.string()]).optional(),
    token_decimals: z.union([z.number(), z.string()]).optional(),

    // Balance fields (can be string or number)
    balance: z.union([z.string(), z.number()]).optional(),
    balanceFormatted: z.union([z.string(), z.number()]).optional(),

    // USD value fields (can be string or number)
    usdValue: z.union([z.string(), z.number()]).optional(),
    usd_value: z.union([z.string(), z.number()]).optional(),
    fiatValue: z.union([z.string(), z.number()]).optional(),

    // Metadata fields
    fromCache: z.boolean().optional(),
    isCache: z.boolean().optional(),
    source: z.string().optional(),
  })
  .catchall(z.unknown()); // Allow additional fields

/**
 * Schema for wallet response data structure
 * Current backend format uses object with balances and nativeBalance
 */
export const walletResponseDataSchema = z
  .object({
    // Current structure: data object with balances array and optional nativeBalance
    data: z
      .object({
        balances: z.array(tokenBalanceRawSchema).optional(),
        nativeBalance: tokenBalanceRawSchema.optional(),
      })
      .optional(),

    // Legacy structure: tokens array at top level
    tokens: z.array(tokenBalanceRawSchema).optional(),

    // Chain and wallet info
    chainId: z.union([z.number(), z.string()]).optional(),
    address: z.string().optional(),
    walletAddress: z.string().optional(),

    // Cache and timing metadata
    fromCache: z.boolean().optional(),
    cacheHit: z.boolean().optional(),
    isCached: z.boolean().optional(),
    fetchedAt: z.string().optional(),
    updatedAt: z.string().optional(),
    timestamp: z.string().optional(),
  })
  .catchall(z.unknown()); // Allow additional fields

/**
 * Type inference from schemas
 * These types are automatically generated from the Zod schemas
 */
type WalletResponseData = z.infer<typeof walletResponseDataSchema>;

/**
 * Validation helper functions
 */

/**
 * Validates wallet response data from API
 * Returns validated data or throws ZodError with detailed error messages
 * Handles null/undefined by returning empty object
 */
export function validateWalletResponseData(data: unknown): WalletResponseData {
  // Handle null/undefined gracefully by treating as empty object
  if (data === null || data === undefined) {
    return {};
  }
  return walletResponseDataSchema.parse(data);
}
