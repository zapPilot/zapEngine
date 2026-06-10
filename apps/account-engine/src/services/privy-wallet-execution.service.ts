import { PrivyClient } from '@privy-io/node';
import type {
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

export interface PrivyWalletExecutionClient {
  verifyAccessToken(accessToken: string): Promise<{ userId: string }>;
  getWallet(walletId: string): Promise<{ address: string }>;
  sendCalls(
    walletId: string,
    request: PrivyAtomicBatchRequest,
    accessToken: string,
  ): Promise<PrivyAtomicBatchResponse>;
}

export interface PrivyWalletExecutionService {
  sendCalls(
    request: PrivyAtomicBatchRequest,
    accessToken: string,
  ): Promise<PrivyAtomicBatchResponse>;
}

function createPrivyClientAdapter(
  appId: string,
  appSecret: string,
): PrivyWalletExecutionClient {
  const privy = new PrivyClient({ appId, appSecret });

  return {
    async verifyAccessToken(accessToken) {
      const verified = await privy
        .utils()
        .auth()
        .verifyAccessToken(accessToken);
      return { userId: verified.user_id };
    },
    async getWallet(walletId) {
      return privy.wallets().get(walletId);
    },
    async sendCalls(walletId, request, accessToken) {
      const caip2 = `eip155:${request.chainId}`;
      const response = await privy
        .wallets()
        .ethereum()
        .sendCalls(walletId, {
          caip2,
          params: { calls: request.calls },
          sponsor: false,
          idempotency_key: request.idempotencyKey,
          authorization_context: { user_jwts: [accessToken] },
        });

      return {
        transactionId: response.transaction_id,
        caip2: response.caip2,
      };
    },
  };
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

  return {
    async sendCalls(request, accessToken) {
      if (!client) {
        throw new AppError(
          'Privy Wallets API is not configured on account-engine',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }

      let userId: string;
      try {
        ({ userId } = await client.verifyAccessToken(accessToken));
      } catch (error) {
        throw new UnauthorizedException(
          'Invalid Privy access token',
          error instanceof Error ? error : undefined,
        );
      }

      const wallet = await client.getWallet(request.walletId);
      if (
        wallet.address.toLowerCase() !== request.walletAddress.toLowerCase()
      ) {
        throw new BadRequestException(
          'Privy wallet id does not match the connected wallet address',
        );
      }

      logger.log('Sending EIP-7702 atomic batch through Privy Wallets API', {
        userId,
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
        return await client.sendCalls(request.walletId, request, accessToken);
      } catch (error) {
        throw new AppError(
          `Privy Wallets API batch failed: ${getErrorMessage(error)}`,
          HttpStatus.BAD_GATEWAY,
          error instanceof Error ? error : undefined,
        );
      }
    },
  };
}
