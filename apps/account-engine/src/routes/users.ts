import { Hono } from 'hono';

import { HttpStatus, RateLimitException } from '../common/http';
import { createActivityTrackingMiddleware } from '../common/interceptors';
import type { AppServices } from '../container';
import { jsonResponse, jsonValidator, paramValidator } from './shared';
import {
  addWalletBodySchema,
  deleteUserBodySchema,
  reportUnsubscribeBodySchema,
  updateEmailBodySchema,
  updateWalletLabelBodySchema,
  uuidParamSchema,
  verifyWalletBodySchema,
  walletAddressParamSchema,
  walletBodySchema,
  walletIdParamSchema,
  walletOnlyParamSchema,
} from './validators';

export function createUsersRoutes(services: AppServices) {
  const app = new Hono();

  app.get(
    '/by-wallet/:walletAddress',
    paramValidator(walletOnlyParamSchema),
    async (c) => {
      const { walletAddress } = c.req.valid('param');
      const response =
        await services.usersService.getUserByWallet(walletAddress);
      return jsonResponse(c, response, HttpStatus.OK);
    },
  );

  app.post('/connect-wallet', jsonValidator(walletBodySchema), async (c) => {
    const body = c.req.valid('json');
    const response = await services.usersService.connectWallet(body.wallet);
    return jsonResponse(c, response, HttpStatus.OK);
  });

  app.post(
    '/reports/unsubscribe',
    jsonValidator(reportUnsubscribeBodySchema),
    async (c) => {
      const body = c.req.valid('json');
      const response =
        await services.usersService.unsubscribeFromReportsWithToken(body.token);
      return jsonResponse(c, response, HttpStatus.OK);
    },
  );

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
      const { userId } = c.req.valid('param');
      const body = c.req.valid('json');
      const response = await services.usersService.addWallet(
        userId,
        body.wallet,
        body.label,
        body.signature,
      );
      return jsonResponse(c, response, HttpStatus.CREATED);
    },
  );

  app.post(
    '/:userId/wallets/challenge',
    paramValidator(uuidParamSchema),
    jsonValidator(walletBodySchema),
    async (c) => {
      const params = c.req.valid('param');
      const body = c.req.valid('json');
      const response =
        await services.usersService.requestWalletBindingChallenge(
          params.userId,
          body.wallet,
        );
      return jsonResponse(c, response, HttpStatus.OK);
    },
  );

  app.post(
    '/:userId/wallets/:walletAddress/verify',
    paramValidator(walletAddressParamSchema),
    jsonValidator(verifyWalletBodySchema),
    async (c) => {
      const params = c.req.valid('param');
      const body = c.req.valid('json');
      const response = await services.usersService.verifyWalletOwnership(
        params.userId,
        params.walletAddress,
        body.signature,
      );
      return jsonResponse(c, response, HttpStatus.OK);
    },
  );

  app.put(
    '/:userId/email',
    paramValidator(uuidParamSchema),
    jsonValidator(updateEmailBodySchema),
    async (c) => {
      const params = c.req.valid('param');
      const body = c.req.valid('json');
      const response = await services.usersService.updateEmail(
        params.userId,
        body.email,
      );
      return jsonResponse(c, response, HttpStatus.OK);
    },
  );

  app.delete('/:userId/email', paramValidator(uuidParamSchema), async (c) => {
    const params = c.req.valid('param');
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
      const params = c.req.valid('param');
      const body = c.req.valid('json');
      const response = await services.usersService.updateWalletLabel(
        params.userId,
        params.walletAddress,
        body.label,
      );
      return jsonResponse(c, response, HttpStatus.OK);
    },
  );

  app.get('/:userId/wallets', paramValidator(uuidParamSchema), async (c) => {
    const params = c.req.valid('param');
    const response = await services.usersService.getUserWallets(params.userId);
    return jsonResponse(c, response, HttpStatus.OK);
  });

  app.delete(
    '/:userId/wallets/:walletId',
    paramValidator(walletIdParamSchema),
    async (c) => {
      const params = c.req.valid('param');
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
      const params = c.req.valid('param');
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
    const params = c.req.valid('param');
    const response = await services.usersService.getUserProfile(params.userId);
    return jsonResponse(c, response, HttpStatus.OK);
  });

  app.post(
    '/:userId/deletion-challenge',
    paramValidator(uuidParamSchema),
    jsonValidator(walletBodySchema),
    async (c) => {
      const { userId } = c.req.valid('param');
      const { wallet } = c.req.valid('json');
      return jsonResponse(
        c,
        await services.usersService.requestDeletionChallenge(userId, wallet),
        HttpStatus.OK,
      );
    },
  );

  app.delete(
    '/:userId',
    paramValidator(uuidParamSchema),
    jsonValidator(deleteUserBodySchema),
    async (c) => {
      const params = c.req.valid('param');
      const body = c.req.valid('json');
      const response = await services.usersService.deleteUser(
        params.userId,
        body.wallet,
        body.signature,
      );
      return jsonResponse(c, response, HttpStatus.OK);
    },
  );

  app.post(
    '/:userId/telegram/request-token',
    paramValidator(uuidParamSchema),
    async (c) => {
      const params = c.req.valid('param');
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
      const params = c.req.valid('param');
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
      const params = c.req.valid('param');
      const response = await services.usersService.disconnectTelegram(
        params.userId,
      );
      return jsonResponse(c, response, HttpStatus.OK);
    },
  );

  return app;
}
