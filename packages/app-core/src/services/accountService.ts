import { AccountServiceError } from '@core/lib/errors';
import { httpUtils } from '@core/lib/http';
import { withOwnerAuth } from '@core/lib/http/accountOwnerSession';
import { createServiceCaller } from '@core/lib/http/createServiceCaller';
import { createServiceError } from '@core/lib/http/serviceErrorFactory';
import {
  type AddWalletResponse,
  type ConnectWalletResponse,
  connectWalletResponseSchema,
  etlJobStatusResponseSchema,
  type EtlJobTriggerResponse,
  etlJobTriggerResponseSchema,
  type OwnershipChallenge,
  type UpdateEmailResponse,
  type UserCryptoWallet,
  type UserProfileResponse,
  validateAddWalletResponse,
  validateMessageResponse,
  validateUpdateEmailResponse,
  validateUserProfileResponse,
  validateUserWallets,
  validateVerifyWalletResponse,
  type VerifyWalletResponse,
  type WalletUserLookupResponse,
  walletUserLookupResponseSchema,
} from '@core/schemas/api/accountSchemas';
import { logger } from '@core/utils/logger';
import type { EtlJobStatus } from '@zapengine/types/etl';

import { requestAccountAuthChallenge } from './accountAuthService';

export { AccountServiceError };
export type { EtlJobStatus };

export type EtlJobResponse = EtlJobTriggerResponse;

const ACCOUNT_SERVICE_ERROR_MESSAGE = 'Account service error';

function mapConflictMessage(message: string): string {
  if (message?.includes('wallet already belongs to another user')) {
    return message;
  }

  if (message?.includes('wallet')) {
    return 'This wallet is already associated with an account.';
  }

  if (message.includes('email')) {
    return 'This email address is already in use.';
  }

  return message;
}

function mapAccountServiceErrorMessage(
  status: number | undefined,
  message: string,
): string {
  switch (status) {
    case 400:
      if (message.includes('wallet')) {
        return 'Invalid wallet address format. Must be a 42-character Ethereum address.';
      }

      return message;
    case 404:
      return 'User account not found. Please connect your wallet first.';
    case 409:
      return mapConflictMessage(message);
    case 422:
      return 'Invalid request data. Please check your input and try again.';
    default:
      return message;
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

function validateTriggerWalletDataFetchResponse(
  response: unknown,
): EtlJobTriggerResponse {
  const validationResult = etlJobTriggerResponseSchema.safeParse(response);
  if (!validationResult.success) {
    logger.error('❌ Validation failed:', validationResult.error.issues);
    throw new AccountServiceError(
      'ETL job trigger response validation failed',
      500,
      'VALIDATION_ERROR',
      { issues: validationResult.error.issues },
    );
  }

  return validationResult.data;
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

function ownerRequest<T>(
  path: string,
  request: (headers?: Record<string, string>) => Promise<T>,
): Promise<T> {
  const match = path.match(/^\/users\/([^/]+)\/(wallets|email)/);
  if (!match) return request();
  return withOwnerAuth(
    {
      userId: match[1] as string,
      interactive: true,
      recent: path.endsWith('/email') || path.endsWith('/verify'),
    },
    request,
  );
}

async function mutateAccountResource<T>(
  method: 'post' | 'delete',
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  return callAccountApi(() =>
    ownerRequest(path, (headers) =>
      accountApiClient[method]<T>(path, body, headers ? { headers } : {}),
    ),
  );
}
async function putAccountResource<T>(
  userId: string,
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  return callAccountApi(() =>
    withOwnerAuth(
      { userId, interactive: true, recent: path.endsWith('/email') },
      (headers) => accountApiClient.put<T>(path, body, { headers }),
    ),
  );
}
/** Pure wallet-to-user lookup. Never creates account state. */
export async function getUserByWallet(
  walletAddress: string,
  options: { verifiedOnly?: boolean } = {},
): Promise<WalletUserLookupResponse> {
  return requestAndValidate(
    () =>
      getAccountResource<WalletUserLookupResponse>(
        `/users/by-wallet/${walletAddress}${options.verifiedOnly ? '?verifiedOnly=true' : ''}`,
      ),
    (response) => walletUserLookupResponseSchema.parse(response),
  );
}

/**
 * Connect wallet and create/retrieve user.
 */
export async function connectWallet(
  walletAddress: string,
): Promise<ConnectWalletResponse> {
  const response = await mutateAccountResource<ConnectWalletResponse>(
    'post',
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
      putAccountResource<UpdateEmailResponse>(
        userId,
        `/users/${userId}/email`,
        {
          email,
        },
      ),
    validateUpdateEmailResponse,
  );
}

async function deleteUserResource(
  path: string,
  body?: Record<string, unknown>,
): Promise<UpdateEmailResponse> {
  return requestAndValidate(
    () => mutateAccountResource<UpdateEmailResponse>('delete', path, body),
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
 * Unsubscribe from reports using the signed token embedded in report emails.
 */
export async function unsubscribeFromReportsWithToken(
  token: string,
): Promise<UpdateEmailResponse> {
  return requestAndValidate(
    () =>
      mutateAccountResource<UpdateEmailResponse>(
        'post',
        '/users/reports/unsubscribe',
        {
          token,
        },
      ),
    validateUpdateEmailResponse,
  );
}

/** Request the purpose-separated ownership challenge required for deletion. */
export async function requestAccountDeletionChallenge(
  userId: string,
  walletAddress: string,
): Promise<OwnershipChallenge> {
  return requestAccountAuthChallenge({
    purpose: 'deletion',
    userId,
    wallet: walletAddress,
    domain: 'v2.zap-pilot.org',
  });
}

export async function deleteUser(
  userId: string,
  challengeId: string,
  signature: string,
): Promise<UpdateEmailResponse> {
  return deleteUserResource(`/users/${userId}`, { challengeId, signature });
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
  const body = {
    wallet: walletAddress,
    label,
  };
  return requestAndValidate(
    () =>
      mutateAccountResource<AddWalletResponse>(
        'post',
        `/users/${userId}/wallets`,
        body,
      ),
    validateAddWalletResponse,
  );
}

export async function requestWalletBindingChallenge(
  userId: string,
  walletAddress: string,
): Promise<OwnershipChallenge> {
  return requestAccountAuthChallenge({
    purpose: 'binding',
    userId,
    wallet: walletAddress,
    domain: 'v2.zap-pilot.org',
  });
}

export async function verifyWalletOwnership(
  userId: string,
  walletAddress: string,
  signature: string,
  challengeId: string,
): Promise<VerifyWalletResponse> {
  return requestAndValidate(
    () =>
      mutateAccountResource<VerifyWalletResponse>(
        'post',
        `/users/${userId}/wallets/${walletAddress}/verify`,
        { signature, challengeId },
      ),
    validateVerifyWalletResponse,
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
      mutateAccountResource<{ message: string }>(
        'delete',
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
        userId,
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
  return requestAndValidate(
    () =>
      mutateAccountResource<EtlJobResponse>(
        'post',
        `/users/${userId}/wallets/${walletAddress}/fetch-data`,
      ),
    validateTriggerWalletDataFetchResponse,
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
