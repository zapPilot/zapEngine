import type { EtlJobStatus } from '@zapengine/types/etl';

import { AccountServiceError } from '@/lib/errors';
import { httpUtils } from '@/lib/http';
import { createServiceCaller } from '@/lib/http/createServiceCaller';
import { createServiceError } from '@/lib/http/serviceErrorUtils';
import {
  type AddWalletResponse,
  type ConnectWalletResponse,
  connectWalletResponseSchema,
  etlJobStatusResponseSchema,
  type UpdateEmailResponse,
  type UserCryptoWallet,
  type UserProfileResponse,
  validateAddWalletResponse,
  validateMessageResponse,
  validateUpdateEmailResponse,
  validateUserProfileResponse,
  validateUserWallets,
} from '@/schemas/api/accountSchemas';
import { logger } from '@/utils/logger';

export { AccountServiceError };

/**
 * ETL job response from trigger endpoint.
 */
export interface EtlJobResponse {
  job_id: string | null;
  status: string;
  message: string;
  rate_limited?: boolean;
}

export type { EtlJobStatus } from '@zapengine/types/etl';

const ACCOUNT_SERVICE_ERROR_MESSAGE = 'Account service error';

function mapConflictMessage(message: string | undefined): string {
  if (message?.includes('wallet already belongs to another user')) {
    return message;
  }

  if (message?.includes('wallet')) {
    return 'This wallet is already associated with an account.';
  }

  if (message?.includes('email')) {
    return 'This email address is already in use.';
  }

  return message ?? ACCOUNT_SERVICE_ERROR_MESSAGE;
}

function mapAccountServiceErrorMessage(
  status: number | undefined,
  message: string | undefined,
): string {
  switch (status) {
    case 400:
      if (message?.includes('wallet')) {
        return 'Invalid wallet address format. Must be a 42-character Ethereum address.';
      }

      return message ?? ACCOUNT_SERVICE_ERROR_MESSAGE;
    case 404:
      return 'User account not found. Please connect your wallet first.';
    case 409:
      return mapConflictMessage(message);
    case 422:
      return 'Invalid request data. Please check your input and try again.';
    default:
      return message ?? ACCOUNT_SERVICE_ERROR_MESSAGE;
  }
}

const createAccountServiceError = (error: unknown): AccountServiceError =>
  createServiceError(
    error,
    AccountServiceError,
    ACCOUNT_SERVICE_ERROR_MESSAGE,
    mapAccountServiceErrorMessage,
  );

function validateConnectWalletResponse(
  response: unknown,
): ConnectWalletResponse {
  const validationResult = connectWalletResponseSchema.safeParse(response);
  if (!validationResult.success) {
    logger.error('❌ Validation failed:', validationResult.error.issues);
    throw new AccountServiceError(
      'Connect wallet response validation failed',
      500,
      'VALIDATION_ERROR',
      { issues: validationResult.error.issues },
    );
  }

  return validationResult.data as ConnectWalletResponse;
}

const accountApiClient = httpUtils.accountApi;
const callAccountApi = createServiceCaller(createAccountServiceError);

async function requestAndValidate<TResponse, TResult>(
  request: () => Promise<TResponse>,
  validate: (response: unknown) => TResult,
): Promise<TResult> {
  const response = await callAccountApi(request);
  return validate(response);
}

async function getAccountResource<T>(path: string): Promise<T> {
  return callAccountApi(() => accountApiClient.get<T>(path));
}

async function postAccountResource<T>(
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  return callAccountApi(() =>
    body
      ? accountApiClient.post<T>(path, body)
      : accountApiClient.post<T>(path),
  );
}

async function putAccountResource<T>(
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  return callAccountApi(() => accountApiClient.put<T>(path, body));
}

async function deleteAccountResource<T>(path: string): Promise<T> {
  return callAccountApi(() => accountApiClient.delete<T>(path));
}

/**
 * Connect wallet and create/retrieve user.
 */
export async function connectWallet(
  walletAddress: string,
): Promise<ConnectWalletResponse> {
  const response = await postAccountResource<ConnectWalletResponse>(
    '/users/connect-wallet',
    {
      wallet: walletAddress,
    },
  );

  return validateConnectWalletResponse(response);
}

/**
 * Get complete user profile.
 */
export async function getUserProfile(
  userId: string,
): Promise<UserProfileResponse> {
  return requestAndValidate(
    () => getAccountResource<UserProfileResponse>(`/users/${userId}`),
    validateUserProfileResponse,
  );
}

/**
 * Update user email.
 */
export async function updateUserEmail(
  userId: string,
  email: string,
): Promise<UpdateEmailResponse> {
  return requestAndValidate(
    () =>
      putAccountResource<UpdateEmailResponse>(`/users/${userId}/email`, {
        email,
      }),
    validateUpdateEmailResponse,
  );
}

async function deleteUserResource(path: string): Promise<UpdateEmailResponse> {
  return requestAndValidate(
    () => deleteAccountResource<UpdateEmailResponse>(path),
    validateUpdateEmailResponse,
  );
}

/**
 * Remove user email (unsubscribe from email-based reports).
 */
export async function removeUserEmail(
  userId: string,
): Promise<UpdateEmailResponse> {
  return deleteUserResource(`/users/${userId}/email`);
}

/**
 * Delete user account.
 * Cannot delete users with active subscriptions.
 */
export async function deleteUser(userId: string): Promise<UpdateEmailResponse> {
  return deleteUserResource(`/users/${userId}`);
}

/**
 * Get all user wallets.
 */
export async function getUserWallets(
  userId: string,
): Promise<UserCryptoWallet[]> {
  return requestAndValidate(
    () => getAccountResource<UserCryptoWallet[]>(`/users/${userId}/wallets`),
    validateUserWallets,
  );
}

/**
 * Add wallet to user bundle.
 */
export async function addWalletToBundle(
  userId: string,
  walletAddress: string,
  label?: string,
): Promise<AddWalletResponse> {
  return requestAndValidate(
    () =>
      postAccountResource<AddWalletResponse>(`/users/${userId}/wallets`, {
        wallet: walletAddress,
        label,
      }),
    validateAddWalletResponse,
  );
}

/**
 * Remove wallet from user bundle.
 */
export async function removeWalletFromBundle(
  userId: string,
  walletId: string,
): Promise<{ message: string }> {
  return requestAndValidate(
    () =>
      deleteAccountResource<{ message: string }>(
        `/users/${userId}/wallets/${walletId}`,
      ),
    validateMessageResponse,
  );
}

/**
 * Update wallet label.
 */
export async function updateWalletLabel(
  userId: string,
  walletAddress: string,
  label: string,
): Promise<{ message: string }> {
  return requestAndValidate(
    () =>
      putAccountResource<{ message: string }>(
        `/users/${userId}/wallets/${walletAddress}/label`,
        { label },
      ),
    validateMessageResponse,
  );
}

/**
 * Trigger ETL data fetch for a wallet.
 */
export async function triggerWalletDataFetch(
  userId: string,
  walletAddress: string,
): Promise<EtlJobResponse> {
  return postAccountResource<EtlJobResponse>(
    `/users/${userId}/wallets/${walletAddress}/fetch-data`,
  );
}

/**
 * Get ETL job status by ID.
 */
export async function getEtlJobStatus(jobId: string): Promise<EtlJobStatus> {
  return requestAndValidate(
    () => getAccountResource<unknown>(`/etl/jobs/${jobId}`),
    (response) => {
      const raw = etlJobStatusResponseSchema.parse(response);
      return {
        jobId: raw.job_id,
        status: raw.status,
        createdAt: raw.created_at ?? '',
        recordsProcessed: raw.records_processed,
        recordsInserted: raw.records_inserted,
        duration: raw.duration,
        completedAt: raw.completed_at,
        error: raw.error,
      } satisfies EtlJobStatus;
    },
  );
}
