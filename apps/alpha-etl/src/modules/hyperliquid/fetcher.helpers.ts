import { z } from "zod";

function normalizeNumericValue(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : value;
}

function normalizeOptionalNumericValue(value: unknown): unknown {
  if (value === undefined || value === null) {
    return undefined;
  }

  return normalizeNumericValue(value);
}

export function createVaultRequestId(): string {
  return `vault_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

function parseFiniteNumericValue(value: number | string): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const numeric = z.preprocess(normalizeNumericValue, z.number());
const optionalNumeric = z.preprocess(
  normalizeOptionalNumericValue,
  z.number().optional(),
);

// Follower state schema (user-specific vault position)
export const FollowerStateSchema = z.object({
  user: z.string(),
  vaultAddress: z.string().optional(),
  totalAccountValue: optionalNumeric,
  vaultEquity: optionalNumeric,
  maxWithdrawable: optionalNumeric,
  maxDistributable: optionalNumeric,
  pnl: optionalNumeric,
  allTimePnl: optionalNumeric,
  daysFollowing: z.number().optional(),
  vaultEntryTime: z.number().optional(),
  lockupUntil: z.number().optional(),
});

// Vault relationship schema
export const VaultRelationshipSchema = z.object({
  type: z.enum(["parent", "follower"]),
  data: z.record(z.string(), z.unknown()).optional(),
});

// Main vault details response schema
export const VaultDetailsResponseSchema = z.object({
  vault: z.string().optional(),
  vaultAddress: z.string(),
  leader: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),

  // APR and TVL
  apr: numeric,
  totalVlm: optionalNumeric,

  // Commission and fractions
  leaderCommission: optionalNumeric,
  leaderFraction: optionalNumeric,
  maxDistributable: optionalNumeric,
  maxWithdrawable: optionalNumeric,

  // Status
  isClosed: z.boolean().optional(),
  allowDeposits: z.boolean().optional(),
  alwaysCloseOnWithdraw: z.boolean().optional(),

  // User-specific data (only present when user parameter is provided)
  followerState: FollowerStateSchema.nullish(),
  followers: z.array(FollowerStateSchema).optional(),
  relationship: VaultRelationshipSchema.optional(),
  totalFollowers: z.number().optional(),

  // Historical data
  portfolio: z.array(z.tuple([z.string(), z.record(z.string(), z.unknown())])).optional(),
  allTime: z.record(z.string(), z.unknown()).optional(),
});

// Export inferred TypeScript types (only VaultDetailsResponse is used externally)
export type VaultDetailsResponse = z.infer<typeof VaultDetailsResponseSchema>;

export function parseVaultDetailsResponse(
  jsonData: unknown,
): VaultDetailsResponse {
  return VaultDetailsResponseSchema.parse(jsonData);
}

export function resolveTotalFollowers(
  vaultDetails: VaultDetailsResponse,
): number | null {
  return vaultDetails.totalFollowers ?? vaultDetails.followers?.length ?? null;
}

export function deriveTvlFromPortfolio(
  portfolio?: VaultDetailsResponse["portfolio"],
): number | null {
  if (!portfolio || portfolio.length === 0) {
    return null;
  }

  const preferred =
    portfolio.find(([bucket]) => bucket === "day") ?? portfolio[0];

  const series = preferred[1] as {
    accountValueHistory?: Array<[number, number | string]>;
  };
  const history = series.accountValueHistory;
  if (!Array.isArray(history) || history.length === 0) {
    return null;
  }

  const lastPoint = history[history.length - 1];
  if (!Array.isArray(lastPoint) || lastPoint.length < 2) {
    return null;
  }

  const value = lastPoint[1];
  return parseFiniteNumericValue(value);
}

export function resolveVaultValue(
  followerState: z.infer<typeof FollowerStateSchema>,
): number | null {
  const vaultValue =
    followerState.totalAccountValue ?? followerState.vaultEquity;
  if (vaultValue === undefined || !Number.isFinite(vaultValue)) {
    return null;
  }

  return vaultValue;
}
