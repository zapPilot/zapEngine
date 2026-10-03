import { Hono } from 'hono';
import { z } from 'zod';

import {
  ForbiddenException,
  HttpStatus,
  UnauthorizedException,
} from '../common/http';
import type { AppServices } from '../container';
import { isRecentOwnerSession } from '../services/account-auth.service';
import { jsonResponse, jsonValidator } from './shared';
import { ecdsaSignatureSchema, walletBodySchema, zUuid } from './validators';
import { clientIp } from './waitlist-client-ip';
import { createWaitlistRateLimiter } from './waitlist-rate-limit';

const challengeSchema = walletBodySchema.extend({
  purpose: z.enum(['session', 'binding', 'deletion', 'reclaim']),
  userId: zUuid(),
  domain: z.string().max(253),
});
const proofSchema = z.object({
  challengeId: zUuid(),
  signature: ecdsaSignatureSchema,
});

export function createAuthRoutes(services: AppServices) {
  const app = new Hono();
  const limiter = createWaitlistRateLimiter();
  app.use('*', async (c, next) => {
    limiter.consume(clientIp(c.req.header()));
    await next();
  });
  app.post('/challenge', jsonValidator(challengeSchema), async (c) => {
    const input = c.req.valid('json');
    if (input.purpose === 'binding') {
      const token = c.req
        .header('Authorization')
        ?.match(/^Bearer (\S+)$/i)?.[1];
      if (!token)
        throw new UnauthorizedException(
          '請重新簽名，若使用舊版 Zap Pilot 請先更新',
        );
      const session = await services.accountAuthService.authenticate(token);
      if (session.user_id !== input.userId)
        throw new ForbiddenException('Session does not own this bundle');
      if (!isRecentOwnerSession(session.created_at)) {
        throw Object.assign(
          new UnauthorizedException(
            '請重新簽名，若使用舊版 Zap Pilot 請先更新',
          ),
          { code: 'RECENT_SIGN_IN_REQUIRED' },
        );
      }
      services.activityTracker.trackUserId(input.userId);
    }
    return jsonResponse(
      c,
      await services.accountAuthService.challenge(input),
      HttpStatus.OK,
    );
  });
  app.post('/session', jsonValidator(proofSchema), async (c) => {
    const { challengeId, signature } = c.req.valid('json');
    return jsonResponse(
      c,
      await services.accountAuthService.session(challengeId, signature),
      HttpStatus.OK,
    );
  });
  app.post('/reclaim', jsonValidator(proofSchema), async (c) => {
    const { challengeId, signature } = c.req.valid('json');
    return jsonResponse(
      c,
      await services.accountAuthService.reclaim(challengeId, signature),
      HttpStatus.OK,
    );
  });
  app.delete('/session', async (c) => {
    const token = c.req.header('Authorization')?.match(/^Bearer (\S+)$/i)?.[1];
    if (!token) throw new UnauthorizedException('Missing owner session');
    await services.accountAuthService.revoke(token);
    return jsonResponse(c, { success: true }, HttpStatus.OK);
  });
  return app;
}
