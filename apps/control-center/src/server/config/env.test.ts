import { describe, expect, it } from 'vitest';

import { checkCostSyncCredentials, readControlCenterConfig } from './env.js';

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

describe('checkCostSyncCredentials', () => {
  const fullEnv = {
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
    DEBANK_API_KEY: 'debank-key',
    OPENROUTER_MANAGEMENT_KEY: 'management-key',
    BRAVE_SEARCH_API_KEY: 'brave-key',
  };

  it('reports every credential present in manual Fly mode', () => {
    const presence = checkCostSyncCredentials(
      readControlCenterConfig(fullEnv),
      {},
    );

    expect(presence.every(({ present }) => present)).toBe(true);
    expect(presence.map(({ name }) => name)).not.toContain('FLY_API_TOKEN');
  });

  it('names the credentials a stripped environment dropped', () => {
    const presence = checkCostSyncCredentials(
      readControlCenterConfig({ SUPABASE_URL: fullEnv.SUPABASE_URL }),
      {},
    );

    expect(
      presence.filter(({ present }) => !present).map(({ name }) => name),
    ).toEqual([
      'SUPABASE_SERVICE_ROLE_KEY',
      'DEBANK_API_KEY',
      'OPENROUTER_MANAGEMENT_KEY',
      'BRAVE_SEARCH_API_KEY',
    ]);
  });

  it('accepts the plain OpenRouter key as the management fallback', () => {
    const presence = checkCostSyncCredentials(
      readControlCenterConfig({
        ...fullEnv,
        OPENROUTER_MANAGEMENT_KEY: '',
        OPENROUTER_API_KEY: 'plain-key',
      }),
      {},
    );

    expect(presence.every(({ present }) => present)).toBe(true);
  });

  it('requires FLY_API_TOKEN only when flyctl collects the Fly cost', () => {
    const config = readControlCenterConfig({
      ...fullEnv,
      FLY_COST_MODE: 'flyctl',
    });

    expect(checkCostSyncCredentials(config, {})).toContainEqual({
      name: 'FLY_API_TOKEN',
      present: false,
    });
    expect(
      checkCostSyncCredentials(config, { FLY_API_TOKEN: 'fly-token' }),
    ).toContainEqual({ name: 'FLY_API_TOKEN', present: true });
  });
});
