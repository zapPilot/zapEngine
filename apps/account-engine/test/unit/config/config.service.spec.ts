import { ConfigService } from '@/config/config.service';
import type { AppEnv } from '@/config/env';

function buildEnv(overrides: Record<string, unknown> = {}): AppEnv {
  return {
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_ANON_KEY: 'anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
    PORT: 3000,
    NODE_ENV: 'test',
    server: { port: 3000 },
    database: {
      supabase: {
        url: 'https://example.supabase.co',
        anonKey: 'anon-key',
        serviceRoleKey: 'service-role-key',
      },
    },
    ...overrides,
  } as AppEnv;
}

describe('ConfigService.get', () => {
  it('returns a top-level flat key value', () => {
    const svc = new ConfigService(buildEnv());
    expect(svc.get('NODE_ENV')).toBe('test');
  });

  it('returns a 2-level dot-path nested value', () => {
    const svc = new ConfigService(buildEnv());
    expect(svc.get('server.port')).toBe(3000);
  });

  it('returns a 3-level dot-path nested value', () => {
    const svc = new ConfigService(buildEnv());
    expect(svc.get('database.supabase.url')).toBe(
      'https://example.supabase.co',
    );
  });

  it('returns the defaultValue when the key is absent', () => {
    const svc = new ConfigService(buildEnv());
    expect(svc.get('MISSING_KEY', 'fallback')).toBe('fallback');
  });

  it('returns undefined when the key is absent and no defaultValue is provided', () => {
    const svc = new ConfigService(buildEnv());
    expect(svc.get('MISSING_KEY')).toBeUndefined();
  });

  it('returns undefined for a partial path that resolves to an object node', () => {
    const svc = new ConfigService(buildEnv());
    // 'database.supabase' exists but is an object, not a primitive
    const value = svc.get<Record<string, unknown>>('database.supabase');
    expect(value).toBeDefined();
    expect(typeof value).toBe('object');
  });

  it('returns the correct value for an optional field', () => {
    const svc = new ConfigService(buildEnv({ ADMIN_API_KEY: 'secret' }));
    expect(svc.get('ADMIN_API_KEY')).toBe('secret');
  });
});
