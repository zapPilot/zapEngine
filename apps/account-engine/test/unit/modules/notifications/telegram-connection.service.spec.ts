import { Context } from 'telegraf';

import { DatabaseService } from '../../../../src/database/database.service';
import { TelegramConnectionService } from '../../../../src/modules/notifications/telegram-connection.service';
import { TelegramTokenService } from '../../../../src/modules/notifications/telegram-token.service';
import {
  createMockDatabaseService,
  createMockQueryBuilder,
} from '../../../test-utils';

function createConnectionMocks() {
  const dbMock = createMockDatabaseService();
  const tokenService = {
    validateToken: vi.fn(),
    invalidateToken: vi.fn().mockResolvedValue(undefined),
  };
  const service = new TelegramConnectionService(
    dbMock.mock as unknown as DatabaseService,
    tokenService as unknown as TelegramTokenService,
  );

  return { service, dbMock, tokenService };
}

function makeStartCtx(
  overrides: {
    startPayload?: string;
    chatId?: number;
    username?: string;
  } = {},
) {
  return {
    startPayload: overrides.startPayload ?? 'valid-token',
    chat: { id: overrides.chatId ?? 12345 },
    from: { username: overrides.username ?? 'testuser' },
    reply: vi.fn().mockResolvedValue(undefined),
  } as unknown as Context;
}

describe('TelegramConnectionService', () => {
  it('replies with invalid link message when no token is provided', async () => {
    const { service } = createConnectionMocks();
    const ctx = makeStartCtx({ startPayload: '' });

    await service.handleStartCommand(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Invalid connection link'),
    );
  });

  it('replies with expired message when token validation returns null', async () => {
    const { service, tokenService } = createConnectionMocks();
    tokenService.validateToken.mockResolvedValueOnce(null);
    const ctx = makeStartCtx();

    await service.handleStartCommand(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('expired or invalid'),
    );
  });

  it('replies with error message when no chat ID is available', async () => {
    const { service, tokenService } = createConnectionMocks();
    tokenService.validateToken.mockResolvedValueOnce('user-1');
    const ctx = {
      ...makeStartCtx(),
      chat: null,
      reply: vi.fn().mockResolvedValue(undefined),
    } as unknown as Context;

    await service.handleStartCommand(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Connection failed'),
    );
  });

  it('replies with error when notification_settings upsert fails', async () => {
    const { service, dbMock, tokenService } = createConnectionMocks();
    tokenService.validateToken.mockResolvedValueOnce('user-1');
    dbMock.serviceRole.queryBuilder.mockResolvedThen({
      data: null,
      error: { message: 'DB error' },
    });
    const ctx = makeStartCtx();

    await service.handleStartCommand(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Connection failed'),
    );
  });

  it('stores chat settings, updates username, and invalidates token on success', async () => {
    const { service, dbMock, tokenService } = createConnectionMocks();
    tokenService.validateToken.mockResolvedValueOnce('user-1');
    dbMock.serviceRole.queryBuilder.mockResolvedThen({
      data: {},
      error: null,
    });
    const ctx = makeStartCtx();

    await service.handleStartCommand(ctx);

    expect(dbMock.serviceRole.client.from).toHaveBeenCalledWith(
      'notification_settings',
    );
    expect(dbMock.serviceRole.queryBuilder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        channel_type: 'telegram',
        is_enabled: true,
        config: { chat_id: '12345' },
      }),
      { onConflict: 'user_id,channel_type' },
    );
    expect(dbMock.serviceRole.client.from).toHaveBeenCalledWith('users');
    expect(tokenService.invalidateToken).toHaveBeenCalledWith('valid-token');
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Successfully connected'),
      expect.any(Object),
    );
  });

  it('finds a user id by Telegram chat id', async () => {
    const { service, dbMock } = createConnectionMocks();
    dbMock.serviceRole.queryBuilder.maybeSingle.mockResolvedValueOnce({
      data: { user_id: 'user-1' },
      error: null,
    });

    await expect(service.findUserIdByChatId('12345')).resolves.toBe('user-1');
  });

  it('replies with no connection message when chat_id is not found', async () => {
    const { service, dbMock } = createConnectionMocks();
    dbMock.serviceRole.queryBuilder.maybeSingle.mockResolvedValueOnce({
      data: null,
      error: null,
    });
    const ctx = {
      chat: { id: 9999 },
      reply: vi.fn().mockResolvedValue(undefined),
    } as unknown as Context;

    await service.handleStopCommand(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('No active connection'),
    );
  });

  it('replies with error message when deletion fails', async () => {
    const { service, dbMock } = createConnectionMocks();
    dbMock.serviceRole.queryBuilder.maybeSingle.mockResolvedValueOnce({
      data: { user_id: 'user-1' },
      error: null,
    });
    dbMock.serviceRole.queryBuilder.mockResolvedThen({
      data: null,
      error: { message: 'delete failed' },
    });
    const ctx = {
      chat: { id: 9999 },
      reply: vi.fn().mockResolvedValue(undefined),
    } as unknown as Context;

    await service.handleStopCommand(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Failed to disconnect'),
    );
  });

  it('deletes notification settings on successful stop', async () => {
    const { service, dbMock } = createConnectionMocks();
    dbMock.serviceRole.queryBuilder.maybeSingle.mockResolvedValueOnce({
      data: { user_id: 'user-1' },
      error: null,
    });
    dbMock.serviceRole.queryBuilder.mockResolvedThen({
      data: {},
      error: null,
    });
    const ctx = {
      chat: { id: 9999 },
      reply: vi.fn().mockResolvedValue(undefined),
    } as unknown as Context;

    await service.handleStopCommand(ctx);

    expect(dbMock.serviceRole.queryBuilder.delete).toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Disconnected from Zap Pilot'),
      expect.any(Object),
    );
  });

  it('replies with error message when chat id is missing during stop', async () => {
    const { service } = createConnectionMocks();
    const ctx = {
      chat: null,
      reply: vi.fn().mockResolvedValue(undefined),
    } as unknown as Context;

    await service.handleStopCommand(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Unable to process'),
    );
  });

  it('supports independent query builders for chat lookup', async () => {
    const { service, dbMock } = createConnectionMocks();
    const notificationSettingsQb = createMockQueryBuilder();
    notificationSettingsQb.maybeSingle.mockResolvedValue({
      data: { user_id: 'user-2' },
      error: null,
    });
    dbMock.serviceRole.client.from.mockReturnValueOnce(notificationSettingsQb);

    await expect(service.findUserIdByChatId('777')).resolves.toBe('user-2');
  });
});
