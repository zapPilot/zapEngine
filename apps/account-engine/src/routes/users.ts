import { Hono } from 'hono';

import { HttpStatus, RateLimitException } from '../common/http';
import { createActivityTrackingMiddleware } from '../common/interceptors';
import type { AppServices } from '../container';
import { jsonResponse, jsonValidator, paramValidator } from './shared';
import {
  type AddWalletBody,
  addWalletBodySchema,
  type UpdateEmailBody,
  updateEmailBodySchema,
  type UpdateWalletLabelBody,
  updateWalletLabelBodySchema,
  type UuidParam,
  uuidParamSchema,
  type WalletAddressParam,
  walletAddressParamSchema,
  type WalletBody,
  walletBodySchema,
  type WalletIdParam,
  walletIdParamSchema,
} from './validators';

export function createUsersRoutes(services: AppServices) {
  const app = new Hono();

  app.post('/connect-wallet', jsonValidator(walletBodySchema), async (c) => {
    const body = c.req.valid('json') as WalletBody;
    const response = await services.usersService.connectWallet(body.wallet);
    return jsonResponse(c, response, HttpStatus.OK);
  });

  // Activity tracking — mounted on patterns that declare `:userId` so the
  // middleware's `c.req.param('userId')` resolves correctly. The UUID-shape
  // regex constraint ensures non-UUID segments (e.g. `/connect-wallet`
  // above, or future literal routes) do not accidentally match and trigger
  // a wasted DB call with a malformed `id`.
  const activityMiddleware = createActivityTrackingMiddleware(
    services.activityTracker,
  );
  const UUID_PATTERN = '[0-9a-fA-F-]{36}';
  app.use(`/:userId{${UUID_PATTERN}}`, activityMiddleware);
  app.use(`/:userId{${UUID_PATTERN}}/*`, activityMiddleware);

  app.post(
    '/:userId/wallets',
    paramValidator(uuidParamSchema),
    jsonValidator(addWalletBodySchema),
    async (c) => {
      const params = c.req.valid('param') as UuidParam;
      const body = c.req.valid('json') as AddWalletBody;
      const response = await services.usersService.addWallet(
        params.userId,
        body.wallet,
        body.label,
      );
      return jsonResponse(c, response, HttpStatus.CREATED);
    },
  );

  app.put(
    '/:userId/email',
    paramValidator(uuidParamSchema),
    jsonValidator(updateEmailBodySchema),
    async (c) => {
      const params = c.req.valid('param') as UuidParam;
      const body = c.req.valid('json') as UpdateEmailBody;
      const response = await services.usersService.updateEmail(
        params.userId,
        body.email,
      );
      return jsonResponse(c, response, HttpStatus.OK);
    },
  );

  app.delete('/:userId/email', paramValidator(uuidParamSchema), async (c) => {
    const params = c.req.valid('param') as UuidParam;
    const response = await services.usersService.unsubscribeFromReports(
      params.userId,
    );
    return jsonResponse(c, response, HttpStatus.OK);
  });

  app.put(
    '/:userId/wallets/:walletAddress/label',
    paramValidator(walletAddressParamSchema),
    jsonValidator(updateWalletLabelBodySchema),
    async (c) => {
      const params = c.req.valid('param') as WalletAddressParam;
      const body = c.req.valid('json') as UpdateWalletLabelBody;
      const response = await services.usersService.updateWalletLabel(
        params.userId,
        params.walletAddress,
        body.label,
      );
      return jsonResponse(c, response, HttpStatus.OK);
    },
  );

  app.get('/:userId/wallets', paramValidator(uuidParamSchema), async (c) => {
    const params = c.req.valid('param') as UuidParam;
    const response = await services.usersService.getUserWallets(params.userId);
    return jsonResponse(c, response, HttpStatus.OK);
  });

  app.delete(
    '/:userId/wallets/:walletId',
    paramValidator(walletIdParamSchema),
    async (c) => {
      const params = c.req.valid('param') as WalletIdParam;
      const response = await services.usersService.removeWallet(
        params.userId,
        params.walletId,
      );
      return jsonResponse(c, response, HttpStatus.OK);
    },
  );

  app.post(
    '/:userId/wallets/:walletAddress/fetch-data',
    paramValidator(walletAddressParamSchema),
    async (c) => {
      const params = c.req.valid('param') as WalletAddressParam;
      const response = await services.usersService.triggerWalletDataFetch(
        params.userId,
        params.walletAddress,
      );

      if (response.rate_limited) {
        throw new RateLimitException(response.message);
      }

      return jsonResponse(c, response, HttpStatus.ACCEPTED);
    },
  );

  app.get('/:userId', paramValidator(uuidParamSchema), async (c) => {
    const params = c.req.valid('param') as UuidParam;
    const response = await services.usersService.getUserProfile(params.userId);
    return jsonResponse(c, response, HttpStatus.OK);
  });

  app.delete('/:userId', paramValidator(uuidParamSchema), async (c) => {
    const params = c.req.valid('param') as UuidParam;
    const response = await services.usersService.deleteUser(params.userId);
    return jsonResponse(c, response, HttpStatus.OK);
  });

  app.post(
    '/:userId/telegram/request-token',
    paramValidator(uuidParamSchema),
    async (c) => {
      const params = c.req.valid('param') as UuidParam;
      const response = await services.usersService.requestTelegramToken(
        params.userId,
      );
      return jsonResponse(c, response, HttpStatus.OK);
    },
  );

  app.get(
    '/:userId/telegram/status',
    paramValidator(uuidParamSchema),
    async (c) => {
      const params = c.req.valid('param') as UuidParam;
      const response = await services.usersService.getTelegramStatus(
        params.userId,
      );
      return jsonResponse(c, response, HttpStatus.OK);
    },
  );

  app.delete(
    '/:userId/telegram/disconnect',
    paramValidator(uuidParamSchema),
    async (c) => {
      const params = c.req.valid('param') as UuidParam;
      const response = await services.usersService.disconnectTelegram(
        params.userId,
      );
      return jsonResponse(c, response, HttpStatus.OK);
    },
  );

  return app;
}
