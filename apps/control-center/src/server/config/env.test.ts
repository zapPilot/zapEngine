import { describe, expect, it } from 'vitest';

import { readControlCenterConfig } from './env.js';

describe('readControlCenterConfig', () => {
  it('keeps Supabase server credentials injected by the launcher', () => {
    const config = readControlCenterConfig({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
      SUPABASE_DB_SCHEMA: 'from_fed_to_chain',
    });

    expect(config.SUPABASE_URL).toBe('https://example.supabase.co');
    expect(config.SUPABASE_SERVICE_ROLE_KEY).toBe('service-role-key');
    expect(config.SUPABASE_DB_SCHEMA).toBe('from_fed_to_chain');
  });

  it('treats blank Supabase credentials as unconfigured', () => {
    const config = readControlCenterConfig({
      SUPABASE_URL: '   ',
      SUPABASE_SERVICE_ROLE_KEY: '',
    });

    expect(config.SUPABASE_URL).toBeUndefined();
    expect(config.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
  });
});
