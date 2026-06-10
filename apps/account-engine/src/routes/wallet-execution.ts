import {
  PrivyAtomicBatchPayloadSchema,
  PrivyAtomicBatchRequestSchema,
} from '@zapengine/types/api';
import { Hono } from 'hono';

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

export function createWalletExecutionRoutes(
  service: PrivyWalletExecutionService,
) {
  const app = new Hono();

  app.post(
    '/privy/send-calls/prepare',
    jsonValidator(PrivyAtomicBatchPayloadSchema),
    async (c) => {
      const accessToken = requireBearerToken(c.req.header('authorization'));
      const response = await service.prepareSendCalls(
        c.req.valid('json'),
        accessToken,
      );
      return c.json(response, { status: 200 });
    },
  );

  app.post(
    '/privy/send-calls',
    jsonValidator(PrivyAtomicBatchRequestSchema),
    async (c) => {
      const accessToken = requireBearerToken(c.req.header('authorization'));
      const response = await service.sendCalls(
        c.req.valid('json'),
        accessToken,
      );
      return c.json(response, { status: 200 });
    },
  );

  return app;
}
