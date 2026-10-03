import type { MiddlewareHandler } from 'hono';

import {
  type AccountAuthService,
  isRecentOwnerSession,
} from '../../services/account-auth.service';
import { ForbiddenException, UnauthorizedException } from '../http';
import type { ActivityTracker } from '../interceptors';

export function requireBundleOwner(
  auth: AccountAuthService,
  tracker: ActivityTracker,
  options: { recent?: boolean } = {},
): MiddlewareHandler {
  return async (c, next) => {
    const authorization = c.req.header('Authorization');
    const token = authorization?.match(/^Bearer (\S+)$/i)?.[1];
    if (!token)
      throw new UnauthorizedException(
        '請重新簽名，若使用舊版 Zap Pilot 請先更新',
      );
    const session = await auth.authenticate(token);
    if (session.user_id !== c.req.param('userId'))
      throw new ForbiddenException('Session does not own this bundle');
    if (options.recent && !isRecentOwnerSession(session.created_at)) {
      const error = new UnauthorizedException(
        '請重新簽名，若使用舊版 Zap Pilot 請先更新',
      );
      Object.assign(error, { code: 'RECENT_SIGN_IN_REQUIRED' });
      throw error;
    }
    tracker.trackUserId(session.user_id);
    await next();
  };
}
