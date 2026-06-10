import {
  type AuthorizationContext,
  formatRequestForAuthorizationSignature,
  isEmbeddedWalletLinkedAccount,
  PrivyClient,
} from '@privy-io/node';
import type {
  PrivyAtomicBatchAuthorizationResponse,
  PrivyAtomicBatchPayload,
  PrivyAtomicBatchRequest,
  PrivyAtomicBatchResponse,
} from '@zapengine/types/api';

import {
  AppError,
  BadRequestException,
  HttpStatus,
  UnauthorizedException,
} from '../common/http';
import { Logger } from '../common/logger';
import { getErrorMessage } from '../common/utils';

const logger = new Logger('PrivyWalletExecution');
const INVALID_ACCESS_TOKEN_MESSAGE =
  'Privy user access token is invalid or expired. Please re-login.';
const PRIVY_API_URL = 'https://api.privy.io';
const PRIVY_REQUEST_EXPIRY_MS = 5 * 60 * 1000;

interface PrivyUserWallet {
  id: string;
  address: string;
}

export function createPrivySendCallsAuthorizationPayload(input: {
  appId: string;
  walletId: string;
  request: PrivyAtomicBatchPayload;
  requestExpiry: number;
}): string {
  const payload = formatRequestForAuthorizationSignature({
    version: 1,
    method: 'POST',
    url: `${PRIVY_API_URL}/v1/wallets/${input.walletId}/rpc`,
    body: {
      caip2: `eip155:${input.request.chainId}`,
      params: { calls: input.request.calls },
      sponsor: false,
      method: 'wallet_sendCalls',
      chain_type: 'ethereum',
    },
    headers: {
      'privy-app-id': input.appId,
      'privy-idempotency-key': input.request.idempotencyKey,
      'privy-request-expiry': String(input.requestExpiry),
    },
  });

  return Buffer.from(payload).toString('base64');
}

export interface PrivyWalletExecutionClient {
  verifyAccessToken(accessToken: string): Promise<{ userId: string }>;
  getUserWallets(userId: string): Promise<PrivyUserWallet[]>;
  prepareSendCalls(
    walletId: string,
    request: PrivyAtomicBatchPayload,
  ): Promise<PrivyAtomicBatchAuthorizationResponse>;
  sendCalls(
    walletId: string,
    request: PrivyAtomicBatchRequest,
    authorizationContext: AuthorizationContext,
  ): Promise<PrivyAtomicBatchResponse>;
}

export interface PrivyWalletExecutionService {
  prepareSendCalls(
    request: PrivyAtomicBatchPayload,
    accessToken: string,
  ): Promise<PrivyAtomicBatchAuthorizationResponse>;
  sendCalls(
    request: PrivyAtomicBatchRequest,
    accessToken: string,
  ): Promise<PrivyAtomicBatchResponse>;
}

function createPrivyClientAdapter(
  appId: string,
  appSecret: string,
): PrivyWalletExecutionClient {
  const privy = new PrivyClient({
    appId,
    appSecret,
    apiUrl: PRIVY_API_URL,
  });

  return {
    async verifyAccessToken(accessToken) {
      const verified = await privy
        .utils()
        .auth()
        .verifyAccessToken(accessToken);
      return { userId: verified.user_id };
    },
    async getUserWallets(userId) {
      const user = await privy.users()._get(userId);
      return user.linked_accounts
        .filter(isEmbeddedWalletLinkedAccount)
        .flatMap((account) =>
          account.id ? [{ id: account.id, address: account.address }] : [],
        );
    },
    async prepareSendCalls(walletId, request) {
      const requestExpiry = privy.getRequestExpiry(PRIVY_REQUEST_EXPIRY_MS);
      if (!requestExpiry) {
        throw new Error('Privy request expiry is unexpectedly disabled');
      }
      return {
        authorizationPayload: createPrivySendCallsAuthorizationPayload({
          appId,
          walletId,
          request,
          requestExpiry,
        }),
        requestExpiry,
      };
    },
    async sendCalls(walletId, request, authorizationContext) {
      const caip2 = `eip155:${request.chainId}`;
      const response = await privy
        .wallets()
        .ethereum()
        .sendCalls(walletId, {
          caip2,
          params: { calls: request.calls },
          sponsor: false,
          idempotency_key: request.idempotencyKey,
          request_expiry: request.requestExpiry,
          authorization_context: authorizationContext,
        });

      return {
        transactionId: response.transaction_id,
        caip2: response.caip2,
      };
    },
  };
}

function isJwt(accessToken: string): boolean {
  return accessToken.split('.').length === 3;
}

function isPrivyUserJwtError(error: unknown): boolean {
  const details = [getErrorMessage(error)];

  if (error && typeof error === 'object' && 'error' in error) {
    const body = error.error;
    if (typeof body === 'string') {
      details.push(body);
    } else if (body && typeof body === 'object') {
      const errorBody = body as Record<string, unknown>;
      for (const key of ['error', 'message', 'code'] as const) {
        if (typeof errorBody[key] === 'string') {
          details.push(errorBody[key]);
        }
      }
    }
  }

  const message = details.join(' ');
  return (
    /invalid jwt/i.test(message) ||
    /expired jwt/i.test(message) ||
    /jwt.+expired/i.test(message) ||
    /invalid auth token/i.test(message)
  );
}

export function createPrivyWalletExecutionService(config: {
  appId?: string;
  appSecret?: string;
  client?: PrivyWalletExecutionClient;
}): PrivyWalletExecutionService {
  const client =
    config.client ??
    (config.appId && config.appSecret
      ? createPrivyClientAdapter(config.appId, config.appSecret)
      : undefined);

  async function verifyWalletOwnership(
    request: PrivyAtomicBatchPayload,
    accessToken: string,
  ): Promise<{ client: PrivyWalletExecutionClient; userId: string }> {
    if (!client) {
      throw new AppError(
        'Privy Wallets API is not configured on account-engine',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    if (!isJwt(accessToken)) {
      throw new UnauthorizedException(INVALID_ACCESS_TOKEN_MESSAGE);
    }

    let userId: string;
    try {
      ({ userId } = await client.verifyAccessToken(accessToken));
    } catch (error) {
      throw new UnauthorizedException(
        INVALID_ACCESS_TOKEN_MESSAGE,
        error instanceof Error ? error : undefined,
      );
    }

    const userWallets = await client.getUserWallets(userId);
    const ownsWallet = userWallets.some(
      (wallet) =>
        wallet.id === request.walletId &&
        wallet.address.toLowerCase() === request.walletAddress.toLowerCase(),
    );
    if (!ownsWallet) {
      throw new BadRequestException(
        'Privy wallet does not belong to the authenticated user',
      );
    }

    return { client, userId };
  }

  return {
    async prepareSendCalls(request, accessToken) {
      const authenticated = await verifyWalletOwnership(request, accessToken);
      return authenticated.client.prepareSendCalls(request.walletId, request);
    },
    async sendCalls(request, accessToken) {
      const authenticated = await verifyWalletOwnership(request, accessToken);

      const authorizationContext: AuthorizationContext = {
        signatures: [request.authorizationSignature],
      };

      logger.log('Sending EIP-7702 atomic batch through Privy Wallets API', {
        userId: authenticated.userId,
        walletId: request.walletId,
        walletAddress: request.walletAddress,
        caip2: `eip155:${request.chainId}`,
        transactionCount: request.calls.length,
        transactions: request.calls.map((call) => ({
          to: call.to,
          value: call.value ?? '0x0',
        })),
      });

      try {
        return await authenticated.client.sendCalls(
          request.walletId,
          request,
          authorizationContext,
        );
      } catch (error) {
        if (isPrivyUserJwtError(error)) {
          throw new UnauthorizedException(
            INVALID_ACCESS_TOKEN_MESSAGE,
            error instanceof Error ? error : undefined,
          );
        }
        throw new AppError(
          `Privy Wallets API batch failed: ${getErrorMessage(error)}`,
          HttpStatus.BAD_GATEWAY,
          error instanceof Error ? error : undefined,
        );
      }
    },
  };
}
