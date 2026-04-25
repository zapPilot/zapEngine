import { BadRequestException } from '@/common/http';
import { loadEnv } from '@/config/env';

const validEnv = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
};

function omitEnvKey(key: keyof typeof validEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...validEnv };
  delete env[key];
  return env;
}

describe('loadEnv', () => {
  it('parses a minimal valid env successfully', () => {
    const result = loadEnv(validEnv);
    expect(result.SUPABASE_URL).toBe('https://example.supabase.co');
    expect(result.SUPABASE_ANON_KEY).toBe('anon-key');
    expect(result.SUPABASE_SERVICE_ROLE_KEY).toBe('service-role-key');
  });

  it('defaults PORT to 3004 when no port env is provided', () => {
    const result = loadEnv(validEnv);
    expect(result.server.port).toBe(3004);
    expect(result.PORT).toBe(3004);
  });

  it('uses ACCOUNT_ENGINE_PORT before the generic PORT fallback', () => {
    const result = loadEnv({
      ...validEnv,
      ACCOUNT_ENGINE_PORT: '3004',
      PORT: '8001',
    });

    expect(result.server.port).toBe(3004);
    expect(result.PORT).toBe(3004);
  });

  it('uses the generic PORT fallback when ACCOUNT_ENGINE_PORT is absent', () => {
    const result = loadEnv({ ...validEnv, PORT: '8080' });
    expect(result.server.port).toBe(8080);
  });

  it('maps database.supabase nested fields correctly', () => {
    const result = loadEnv(validEnv);
    expect(result.database.supabase.url).toBe('https://example.supabase.co');
    expect(result.database.supabase.anonKey).toBe('anon-key');
    expect(result.database.supabase.serviceRoleKey).toBe('service-role-key');
  });

  it('throws BadRequestException when SUPABASE_URL is missing', () => {
    expect(() => loadEnv(omitEnvKey('SUPABASE_URL'))).toThrow(
      BadRequestException,
    );
  });

  it('throws BadRequestException when SUPABASE_ANON_KEY is missing', () => {
    expect(() => loadEnv(omitEnvKey('SUPABASE_ANON_KEY'))).toThrow(
      BadRequestException,
    );
  });

  it('throws BadRequestException when SUPABASE_SERVICE_ROLE_KEY is missing', () => {
    expect(() => loadEnv(omitEnvKey('SUPABASE_SERVICE_ROLE_KEY'))).toThrow(
      BadRequestException,
    );
  });

  it('throws BadRequestException for an invalid PORT (zero)', () => {
    expect(() => loadEnv({ ...validEnv, PORT: '0' })).toThrow(
      BadRequestException,
    );
  });

  it('throws BadRequestException for a non-numeric PORT', () => {
    expect(() => loadEnv({ ...validEnv, PORT: 'abc' })).toThrow(
      BadRequestException,
    );
  });

  it('throws BadRequestException for an invalid ACCOUNT_ENGINE_PORT', () => {
    expect(() =>
      loadEnv({ ...validEnv, ACCOUNT_ENGINE_PORT: '70000' }),
    ).toThrow(BadRequestException);
  });

  it('includes optional fields when provided', () => {
    const result = loadEnv({
      ...validEnv,
      ADMIN_API_KEY: 'admin-secret',
      NODE_ENV: 'production',
    });
    expect(result.ADMIN_API_KEY).toBe('admin-secret');
    expect(result.NODE_ENV).toBe('production');
  });

  it('spreads all raw env fields through to the returned object', () => {
    const result = loadEnv({ ...validEnv, TELEGRAM_BOT_NAME: 'my_bot' });
    expect(result.TELEGRAM_BOT_NAME).toBe('my_bot');
  });
});
