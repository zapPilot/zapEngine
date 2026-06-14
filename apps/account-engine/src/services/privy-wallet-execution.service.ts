import { randomUUID } from 'node:crypto';

import {
  type AuthorizationContext,
  formatRequestForAuthorizationSignature,
  isEmbeddedWalletLinkedAccount,
  PrivyClient,
} from '@privy-io/node';
import type {
  PrivyAtomicBatchAuthorizationResponse,
  PrivyAtomicBatchRequest,
  PrivyAtomicBatchResponse,
  PrivyConfirmSendCallsRequest,
  PrivyConfirmSendCallsResponse,
  PrivyPrepareSendCallsRequest,
  PrivyPrepareSendCallsResponse,
} from '@zapengine/types/api';
import { keccak256, toBytes, verifyTypedData } from 'viem';

import {
  AppError,
  BadRequestException,
  HttpStatus,
  UnauthorizedException,
} from '../common/http';
import { Logger } from '../common/logger';
import { getErrorMessage } from '../common/utils';
import {
  createTenderlySimulationService,
  type TenderlySimulationReview,
  type TenderlySimulationService,
} from './tenderly-simulation.service';

const logger = new Logger('PrivyWalletExecution');
const INVALID_ACCESS_TOKEN_MESSAGE =
  'Privy user access token is invalid or expired. Please re-login.';
const PRIVY_API_URL = 'https://api.privy.io';
const PRIVY_REQUEST_EXPIRY_MS = 5 * 60 * 1000;
const PREVIEW_EXPIRY_MS = 5 * 60 * 1000;

interface PrivyUserWallet {
  id: string;
  address: string;
}

type SignablePreview = Extract<
  PrivyPrepareSendCallsResponse,
  { status: 'passed' | 'warning' }
>;

interface PreviewRecord {
  request: PrivyPrepareSendCallsRequest;
  preview: SignablePreview;
  consumed: boolean;
  nonce: number;
}

export function createPrivySendCallsAuthorizationPayload(input: {
  appId: string;
  walletId: string;
  request: PrivyPrepareSendCallsRequest;
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
    request: PrivyPrepareSendCallsRequest,
  ): Promise<PrivyAtomicBatchAuthorizationResponse>;
  sendCalls(
    walletId: string,
    request: PrivyAtomicBatchRequest,
    authorizationContext: AuthorizationContext,
  ): Promise<PrivyAtomicBatchResponse>;
}

export interface PrivyWalletExecutionService {
  prepareSendCalls(
    request: PrivyPrepareSendCallsRequest,
    accessToken: string,
  ): Promise<PrivyPrepareSendCallsResponse>;
  confirmSendCalls(
    request: PrivyConfirmSendCallsRequest,
    accessToken: string,
  ): Promise<PrivyConfirmSendCallsResponse>;
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

function buildRequestHashes(request: PrivyPrepareSendCallsRequest): {
  batchHash: `0x${string}`;
  callsHash: `0x${string}`;
} {
  const callsJson = JSON.stringify(
    request.calls.map((call) => ({
      to: call.to.toLowerCase(),
      data: call.data ?? '0x',
      value: BigInt(call.value ?? '0x0').toString(),
    })),
  );
  const callsHash = keccak256(toBytes(callsJson));
  const batchHash = keccak256(
    toBytes(
      JSON.stringify({
        walletId: request.walletId,
        walletAddress: request.walletAddress.toLowerCase(),
        chainId: request.chainId,
        idempotencyKey: request.idempotencyKey,
        callsHash,
      }),
    ),
  );
  return { batchHash, callsHash };
}

function buildTypedDataPayload(input: {
  request: PrivyPrepareSendCallsRequest;
  batchHash: `0x${string}`;
  callsHash: `0x${string}`;
  simulation: Extract<
    TenderlySimulationReview,
    { status: 'passed' | 'warning' }
  >;
  nonce: number;
}): Record<string, unknown> {
  const deadline = Math.floor(Date.now() / 1000) + 300;
  return {
    domain: {
      name: 'ZapPilot',
      version: '1',
      chainId: input.request.chainId,
      verifyingContract: '0x0000000000000000000000000000000000000000',
    },
    types: {
      ZapPilotIntent: [
        { name: 'walletAddress', type: 'address' },
        { name: 'chainId', type: 'uint256' },
        { name: 'caip2', type: 'string' },
        { name: 'batchHash', type: 'bytes32' },
        { name: 'callsHash', type: 'bytes32' },
        { name: 'simulationFingerprint', type: 'bytes32' },
        { name: 'riskHash', type: 'bytes32' },
        { name: 'deadline', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
      ],
    },
    primaryType: 'ZapPilotIntent',
    message: {
      walletAddress: input.request.walletAddress,
      chainId: input.request.chainId,
      caip2: `eip155:${input.request.chainId}`,
      batchHash: input.batchHash,
      callsHash: input.callsHash,
      simulationFingerprint: input.simulation.simulationFingerprint,
      riskHash: input.simulation.riskHash,
      deadline,
      nonce: input.nonce,
    },
  };
}

export function createPrivyWalletExecutionService(config: {
  appId?: string;
  appSecret?: string;
  client?: PrivyWalletExecutionClient;
  tenderlyAccountSlug?: string;
  tenderlyProjectSlug?: string;
  tenderlyAccessToken?: string;
  tenderlySimulationService?: TenderlySimulationService;
}): PrivyWalletExecutionService {
  const client =
    config.client ??
    (config.appId && config.appSecret
      ? createPrivyClientAdapter(config.appId, config.appSecret)
      : undefined);
  const tenderlySimulationService =
    config.tenderlySimulationService ??
    createTenderlySimulationService({
      ...(config.tenderlyAccountSlug
        ? { accountSlug: config.tenderlyAccountSlug }
        : {}),
      ...(config.tenderlyProjectSlug
        ? { projectSlug: config.tenderlyProjectSlug }
        : {}),
      ...(config.tenderlyAccessToken
        ? { accessToken: config.tenderlyAccessToken }
        : {}),
    });
  const previews = new Map<string, PreviewRecord>();
  const walletNonces = new Map<string, number>();

  async function verifyWalletOwnership(
    request: { walletId: string; walletAddress: string },
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

  async function createSignablePreview(input: {
    authenticated: {
      client: PrivyWalletExecutionClient;
      userId: string;
    };
    request: PrivyPrepareSendCallsRequest;
    simulation: Extract<
      TenderlySimulationReview,
      { status: 'passed' | 'warning' }
    >;
  }): Promise<SignablePreview> {
    const walletKey = input.request.walletAddress.toLowerCase();
    const nonce = walletNonces.get(walletKey) ?? 0;
    const { batchHash, callsHash } = buildRequestHashes(input.request);
    const typedDataPayload = buildTypedDataPayload({
      request: input.request,
      batchHash,
      callsHash,
      simulation: input.simulation,
      nonce,
    });
    const privyPreparation = await input.authenticated.client.prepareSendCalls(
      input.request.walletId,
      input.request,
    );
    const previewId = randomUUID();
    const preview: SignablePreview = {
      ...input.simulation,
      previewId,
      batchHash,
      typedDataPayload,
      expiresAt: Date.now() + PREVIEW_EXPIRY_MS,
      authorizationPayload: privyPreparation.authorizationPayload,
      requestExpiry: privyPreparation.requestExpiry,
    };

    previews.set(previewId, {
      request: input.request,
      preview,
      consumed: false,
      nonce,
    });
    logger.log('Prepared Privy sendCalls simulation preview', {
      userId: input.authenticated.userId,
      walletId: input.request.walletId,
      previewId,
      status: preview.status,
      simulationFingerprint: preview.simulationFingerprint,
      riskHash: preview.riskHash,
      nonce,
      expiresAt: preview.expiresAt,
    });
    return preview;
  }

  return {
    async prepareSendCalls(request, accessToken) {
      const authenticated = await verifyWalletOwnership(request, accessToken);
      const simulation = await tenderlySimulationService.simulateBundle({
        chainId: request.chainId,
        walletAddress: request.walletAddress,
        calls: request.calls,
      });
      if (
        simulation.status === 'failed' ||
        simulation.status === 'unavailable'
      ) {
        return simulation;
      }
      return createSignablePreview({ authenticated, request, simulation });
    },

    async confirmSendCalls(request, accessToken) {
      const record = previews.get(request.previewId);
      if (!record) {
        throw new BadRequestException('Simulation preview not found');
      }
      if (record.consumed) {
        throw new BadRequestException(
          'Simulation preview has already been consumed',
        );
      }
      if (Date.now() > record.preview.expiresAt) {
        record.consumed = true;
        throw new BadRequestException('Simulation preview has expired');
      }
      if (
        record.preview.status === 'warning' &&
        request.acknowledgedRiskHash?.toLowerCase() !==
          record.preview.riskHash.toLowerCase()
      ) {
        throw new BadRequestException(
          'Warning risks must be acknowledged before signing',
        );
      }

      const authenticated = await verifyWalletOwnership(
        record.request,
        accessToken,
      );
      let isValidSignature = false;
      try {
        isValidSignature = await verifyTypedData({
          address: record.request.walletAddress as `0x${string}`,
          ...record.preview.typedDataPayload,
          signature: request.userSignature as `0x${string}`,
        } as never);
      } catch (error) {
        logger.debug('Signature verification threw error', error);
      }
      if (!isValidSignature) {
        throw new BadRequestException('Invalid signature or signer mismatch');
      }

      const walletKey = record.request.walletAddress.toLowerCase();
      const currentNonce = walletNonces.get(walletKey) ?? 0;
      if (record.nonce !== currentNonce) {
        record.consumed = true;
        throw new BadRequestException(
          'Signature nonce does not match current wallet nonce',
        );
      }

      record.consumed = true;
      const refreshed = await tenderlySimulationService.simulateBundle({
        chainId: record.request.chainId,
        walletAddress: record.request.walletAddress,
        calls: record.request.calls,
      });
      if (refreshed.status === 'failed' || refreshed.status === 'unavailable') {
        return { status: 'review', preview: refreshed };
      }
      if (
        refreshed.simulationFingerprint !== record.preview.simulationFingerprint
      ) {
        const replacement = await createSignablePreview({
          authenticated,
          request: record.request,
          simulation: refreshed,
        });
        return { status: 'review', preview: replacement };
      }

      const authorizationContext: AuthorizationContext = {
        signatures: [request.authorizationSignature],
      };
      logger.log('Executing EIP-7702 atomic batch through Privy Wallets API', {
        userId: authenticated.userId,
        walletId: record.request.walletId,
        walletAddress: record.request.walletAddress,
        caip2: `eip155:${record.request.chainId}`,
        transactionCount: record.request.calls.length,
        nonce: currentNonce,
      });

      try {
        const result = await authenticated.client.sendCalls(
          record.request.walletId,
          {
            ...record.request,
            authorizationSignature: request.authorizationSignature,
            requestExpiry: record.preview.requestExpiry,
          },
          authorizationContext,
        );
        walletNonces.set(walletKey, currentNonce + 1);
        return { status: 'submitted', ...result };
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
