import { ConfigService } from '../../../src/config/config.service';
import type { AppEnv } from '../../../src/config/env';

function buildEnv(overrides: Record<string, unknown> = {}): AppEnv {
  return {
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_ANON_KEY: 'anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
    PORT: 3000,
    NODE_ENV: 'test',
    ...overrides,
  } as AppEnv;
}

describe('ConfigService.get', () => {
  it('returns a top-level flat key value', () => {
    const svc = new ConfigService(buildEnv());
    expect(svc.get('NODE_ENV')).toBe('test');
  });

  it('returns the defaultValue when the key is absent', () => {
    const svc = new ConfigService(buildEnv());
    expect(svc.get('MISSING_KEY', 'fallback')).toBe('fallback');
  });

  it('returns undefined when the key is absent and no defaultValue is provided', () => {
    const svc = new ConfigService(buildEnv());
    expect(svc.get('MISSING_KEY')).toBeUndefined();
  });

  it('returns the correct value for an optional field', () => {
    const svc = new ConfigService(buildEnv({ ADMIN_API_KEY: 'secret' }));
    expect(svc.get('ADMIN_API_KEY')).toBe('secret');
  });
});
