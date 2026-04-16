import { ConfigService } from '@config/config.service';
import { DatabaseService } from '@database/database.service';
import { createMockConfigService } from '@test-utils';

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn().mockReturnValue({
    from: jest.fn(),
    rpc: jest.fn(),
  }),
}));

import { createClient } from '@supabase/supabase-js';

const mockedCreateClient = createClient as jest.Mock;

describe('DatabaseService', () => {
  let configService: ConfigService;

  beforeEach(() => {
    mockedCreateClient.mockClear();
    mockedCreateClient.mockReturnValue({
      from: jest.fn(),
      rpc: jest.fn().mockResolvedValue({ data: 'ok', error: null }),
    });
  });

  function buildService(overrides: Record<string, unknown> = {}) {
    configService = createMockConfigService(
      overrides,
    ) as unknown as ConfigService;
    return new DatabaseService(configService);
  }

  describe('constructor', () => {
    it('creates a Supabase client with URL and anon key from config', () => {
      buildService();

      expect(mockedCreateClient).toHaveBeenCalledWith(
        'http://localhost:54321',
        'test-anon-key',
      );
    });

    it('throws when Supabase URL is missing', () => {
      expect(() =>
        buildService({ 'database.supabase.url': undefined }),
      ).toThrow('Missing Supabase configuration');
    });

    it('throws when Supabase anon key is missing', () => {
      expect(() =>
        buildService({ 'database.supabase.anonKey': undefined }),
      ).toThrow('Missing Supabase configuration');
    });
  });

  describe('getClient', () => {
    it('returns the anon Supabase client', () => {
      const service = buildService();
      const client = service.getClient();
      expect(client).toBeDefined();
      expect(client.from).toBeDefined();
    });
  });

  describe('getServiceRoleClient', () => {
    it('creates a service role client on first call', () => {
      const service = buildService();
      mockedCreateClient.mockClear();

      service.getServiceRoleClient();

      expect(mockedCreateClient).toHaveBeenCalledWith(
        'http://localhost:54321',
        'test-service-role-key',
        expect.objectContaining({
          auth: {
            autoRefreshToken: false,
            persistSession: false,
          },
        }),
      );
    });

    it('caches the service role client on subsequent calls', () => {
      const service = buildService();
      mockedCreateClient.mockClear();

      const first = service.getServiceRoleClient();
      const second = service.getServiceRoleClient();

      expect(first).toBe(second);
      expect(mockedCreateClient).toHaveBeenCalledTimes(1);
    });

    it('throws when service role key is missing', () => {
      const service = buildService({
        'database.supabase.serviceRoleKey': undefined,
      });

      expect(() => service.getServiceRoleClient()).toThrow(
        'Missing Supabase service role configuration',
      );
    });
  });

  describe('rpc', () => {
    it('calls rpc on the anon client by default', async () => {
      const service = buildService();
      const client = service.getClient();
      (client.rpc as jest.Mock).mockResolvedValue({
        data: { result: true },
        error: null,
      });

      const result = await service.rpc(
        'create_user_with_wallet_and_plan' as any,
        {
          p_wallet: '0x123',
        } as any,
      );

      expect(client.rpc).toHaveBeenCalledWith(
        'create_user_with_wallet_and_plan',
        { p_wallet: '0x123' },
      );
      expect(result).toEqual({ result: true });
    });

    it('uses service role client when useServiceRole is true', async () => {
      const service = buildService();
      const serviceClient = service.getServiceRoleClient();
      (serviceClient.rpc as jest.Mock).mockResolvedValue({
        data: { ok: true },
        error: null,
      });

      await service.rpc('create_user_with_wallet_and_plan' as any, {} as any, {
        useServiceRole: true,
      });

      expect(serviceClient.rpc).toHaveBeenCalled();
    });

    it('throws when rpc returns an error', async () => {
      const service = buildService();
      const client = service.getClient();
      const rpcError = { code: '42000', message: 'function not found' };
      (client.rpc as jest.Mock).mockResolvedValue({
        data: null,
        error: rpcError,
      });

      await expect(
        service.rpc('create_user_with_wallet_and_plan' as any, {} as any),
      ).rejects.toEqual(rpcError);
    });
  });
});
