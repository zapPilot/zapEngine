import { type Context, Hono } from 'hono';

import { requireBundleOwner } from '../common/guards/bundle-owner.guard';
import { HttpStatus, RateLimitException } from '../common/http';
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
      const response = await services.usersService.getUserByWallet(
        walletAddress,
        { verifiedOnly: c.req.query('verifiedOnly') === 'true' },
      );
      return jsonResponse(c, response, HttpStatus.OK);
    },
  );

  app.post('/connect-wallet', jsonValidator(walletBodySchema), async (c) => {
    const body = c.req.valid('json');
    const response = await services.usersService.connectWallet(body.wallet);
    services.activityTracker.trackUserId(response.user_id);
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

  const owner = requireBundleOwner(
    services.accountAuthService,
    services.activityTracker,
  );
  const recentOwner = requireBundleOwner(
    services.accountAuthService,
    services.activityTracker,
    { recent: true },
  );

  app.post(
    '/:userId/wallets',
    paramValidator(uuidParamSchema),
    owner,
    jsonValidator(addWalletBodySchema),
    async (c) => {
      const { userId } = c.req.valid('param');
      const body = c.req.valid('json');
      const response = await services.usersService.addWallet(
        userId,
        body.wallet,
        body.label,
      );
      return jsonResponse(c, response, HttpStatus.CREATED);
    },
  );

  app.post(
    '/:userId/wallets/:walletAddress/verify',
    paramValidator(walletAddressParamSchema),
    recentOwner,
    jsonValidator(verifyWalletBodySchema),
    async (c) => {
      const params = c.req.valid('param');
      const body = c.req.valid('json');
      const response = await services.accountAuthService.verifyBinding(
        params.userId,
        params.walletAddress,
        body.challengeId,
        body.signature,
      );
      return jsonResponse(c, response, HttpStatus.OK);
    },
  );

  app.put(
    '/:userId/email',
    paramValidator(uuidParamSchema),
    recentOwner,
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

  app.delete(
    '/:userId/email',
    paramValidator(uuidParamSchema),
    recentOwner,
    async (c) => {
      const params = c.req.valid('param');
      const response = await services.usersService.unsubscribeFromReports(
        params.userId,
      );
      return jsonResponse(c, response, HttpStatus.OK);
    },
  );

  app.put(
    '/:userId/wallets/:walletAddress/label',
    paramValidator(walletAddressParamSchema),
    owner,
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
    owner,
    async (c) => {
      const params = c.req.valid('param');
      const response = await services.usersService.removeWallet(
        params.userId,
        params.walletId,
        c.req.header('Authorization')!.slice(7),
      );
      return jsonResponse(c, response, HttpStatus.OK);
    },
  );

  app.post(
    '/:userId/wallets/:walletAddress/fetch-data',
    paramValidator(walletAddressParamSchema),
    owner,
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

  app.delete(
    '/:userId',
    paramValidator(uuidParamSchema),
    jsonValidator(deleteUserBodySchema),
    async (c) => {
      const params = c.req.valid('param');
      const body = c.req.valid('json');
      const response = await services.usersService.deleteUser(
        params.userId,
        body.challengeId,
        body.signature,
      );
      return jsonResponse(c, response, HttpStatus.OK);
    },
  );

  const telegramHandler =
    (
      method:
        | 'requestTelegramToken'
        | 'getTelegramStatus'
        | 'disconnectTelegram',
    ) =>
    async (c: Context) => {
      const response = await services.usersService[method](
        c.req.param('userId')!,
      );
      return jsonResponse(c, response, HttpStatus.OK);
    };
  app.post(
    '/:userId/telegram/request-token',
    paramValidator(uuidParamSchema),
    owner,
    telegramHandler('requestTelegramToken'),
  );
  app.get(
    '/:userId/telegram/status',
    paramValidator(uuidParamSchema),
    owner,
    telegramHandler('getTelegramStatus'),
  );
  app.delete(
    '/:userId/telegram/disconnect',
    paramValidator(uuidParamSchema),
    owner,
    telegramHandler('disconnectTelegram'),
  );

  return app;
}
