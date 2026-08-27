import type { Mock } from 'vitest';

import { ConfigService } from '../../../src/config/config.service';
import { DatabaseService } from '../../../src/database/database.service';
import { createMockConfigService } from '../../test-utils';

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn().mockReturnValue({
    from: vi.fn(),
    rpc: vi.fn(),
  }),
}));

import { createClient } from '@supabase/supabase-js';

const mockedCreateClient = createClient as Mock;

describe('DatabaseService', () => {
  let configService: ConfigService;

  beforeEach(() => {
    mockedCreateClient.mockClear();
    mockedCreateClient.mockReturnValue({
      from: vi.fn(),
      rpc: vi.fn().mockResolvedValue({ data: 'ok', error: null }),
    });
  });

  function buildService(overrides: Record<string, unknown> = {}) {
    configService = createMockConfigService(overrides);
    return new DatabaseService(configService);
  }

  describe('constructor', () => {
    it('creates a single Supabase client with URL and service role key', () => {
      buildService();

      expect(mockedCreateClient).toHaveBeenCalledTimes(1);
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

    it('throws when Supabase URL is missing', () => {
      expect(() => buildService({ SUPABASE_URL: undefined })).toThrow(
        'Missing Supabase configuration',
      );
    });

    it('throws when the service role key is missing', () => {
      expect(() =>
        buildService({ SUPABASE_SERVICE_ROLE_KEY: undefined }),
      ).toThrow('Missing Supabase configuration');
    });
  });

  describe('getClient', () => {
    it('returns the same client on every call', () => {
      const service = buildService();
      expect(service.getClient()).toBe(service.getClient());
      expect(service.getClient().from).toBeDefined();
    });
  });

  describe('rpc', () => {
    it('calls rpc on the Supabase client', async () => {
      const service = buildService();
      const client = service.getClient();
      (client.rpc as Mock).mockResolvedValue({
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

    it('throws when rpc returns an error', async () => {
      const service = buildService();
      const client = service.getClient();
      const rpcError = { code: '42000', message: 'function not found' };
      (client.rpc as Mock).mockResolvedValue({
        data: null,
        error: rpcError,
      });

      await expect(
        service.rpc('create_user_with_wallet_and_plan' as any, {} as any),
      ).rejects.toEqual(rpcError);
    });
  });
});
