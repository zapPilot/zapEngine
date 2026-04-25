import { z } from 'zod';

import { isWalletAddress } from '@/common/validation/wallet-address.util';

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidEmail(value: string): boolean {
  if (value.length === 0 || value.includes(' ')) {
    return false;
  }

  const parts = value.split('@');
  if (parts.length !== 2) {
    return false;
  }

  const [local = '', domain = ''] = parts;
  if (local.length === 0 || domain.length < 3) {
    return false;
  }

  const domainParts = domain.split('.');
  if (domainParts.length < 2) {
    return false;
  }

  return domainParts.every((part) => part.length > 0);
}

/** Reusable Zod UUID v4 string schema */
export function zUuid(message = 'Invalid UUID') {
  return z.string().regex(UUID_V4_REGEX, message);
}

/** Reusable Zod email string schema */
export function zEmail(message = 'Invalid email address') {
  return z.string().min(1).refine(isValidEmail, message);
}

export const uuidParamSchema = z.object({
  userId: zUuid(),
});
export type UuidParam = z.infer<typeof uuidParamSchema>;

export const jobIdParamSchema = z.object({
  jobId: z.string().min(1),
});
export type JobIdParam = z.infer<typeof jobIdParamSchema>;

export const walletAddressParamSchema = uuidParamSchema.extend({
  walletAddress: z.string().refine(isWalletAddress, {
    message:
      'Wallet address must be a valid Ethereum address (42 characters starting with 0x)',
  }),
});
export type WalletAddressParam = z.infer<typeof walletAddressParamSchema>;

export const walletIdParamSchema = uuidParamSchema.extend({
  walletId: zUuid(),
});
export type WalletIdParam = z.infer<typeof walletIdParamSchema>;

export const walletBodySchema = z.object({
  wallet: z.string().min(1).refine(isWalletAddress, {
    message:
      'Wallet address must be a valid Ethereum address (42 characters starting with 0x)',
  }),
});
export type WalletBody = z.infer<typeof walletBodySchema>;

export const walletLabelSchema = z
  .string()
  .min(1, 'Label must be between 1 and 100 characters')
  .max(100, 'Label must be between 1 and 100 characters');

export const addWalletBodySchema = walletBodySchema.extend({
  label: walletLabelSchema.optional(),
});
export type AddWalletBody = z.infer<typeof addWalletBodySchema>;

export const updateEmailBodySchema = z.object({
  email: zEmail(),
});
export type UpdateEmailBody = z.infer<typeof updateEmailBodySchema>;

export const updateWalletLabelBodySchema = z.object({
  label: walletLabelSchema,
});
export type UpdateWalletLabelBody = z.infer<typeof updateWalletLabelBodySchema>;

export const singleUserReportBodySchema = z.object({
  userId: zUuid('userId must be a valid UUID'),
  testMode: z.boolean().optional(),
  testRecipient: zEmail(
    'testRecipient must be a valid email address',
  ).optional(),
  note: z.string().optional(),
});
export type SingleUserReportBody = z.infer<typeof singleUserReportBodySchema>;

export const dailySuggestionBatchBodySchema = z.object({
  userIds: z.array(zUuid('Each userId must be a valid UUID')).optional(),
});
export type DailySuggestionBatchBody = z.infer<
  typeof dailySuggestionBatchBodySchema
>;
