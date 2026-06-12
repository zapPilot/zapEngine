import {
  type PrivyConfirmSendCallsRequest,
  PrivyConfirmSendCallsRequestSchema,
  type PrivyPrepareSendCallsRequest,
  PrivyPrepareSendCallsRequestSchema,
} from '@zapengine/types/api';
import { type Context, Hono, type MiddlewareHandler } from 'hono';

import { UnauthorizedException } from '../common/http';
import type { PrivyWalletExecutionService } from '../services/privy-wallet-execution.service';
import { jsonValidator } from './shared';

function requireBearerToken(authorization: string | undefined): string {
  const [scheme, token] = authorization?.trim().split(/\s+/, 2) ?? [];
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    throw new UnauthorizedException('Privy access token is required');
  }
  return token;
}

async function requireAuthHandler(c: Context, next: () => Promise<void>) {
  requireBearerToken(c.req.header('authorization'));
  return next();
}

function requireAuth(): MiddlewareHandler {
  return requireAuthHandler;
}

async function handlePrivyCall<
  T extends PrivyPrepareSendCallsRequest | PrivyConfirmSendCallsRequest,
>(
  c: Context,
  serviceCall: (request: T, accessToken: string) => Promise<unknown>,
) {
  const accessToken = requireBearerToken(c.req.header('authorization'));
  const response = await serviceCall(
    c.req.valid('json' as never) as T,
    accessToken,
  );
  return c.json(response, { status: 200 });
}

export function createWalletExecutionRoutes(
  service: PrivyWalletExecutionService,
) {
  const app = new Hono();

  app.post(
    '/privy/prepare-send-calls',
    requireAuth(),
    jsonValidator(PrivyPrepareSendCallsRequestSchema),
    (c) => handlePrivyCall(c, service.prepareSendCalls.bind(service)),
  );

  app.post(
    '/privy/confirm-send-calls',
    requireAuth(),
    jsonValidator(PrivyConfirmSendCallsRequestSchema),
    (c) => handlePrivyCall(c, service.confirmSendCalls.bind(service)),
  );

  return app;
}
