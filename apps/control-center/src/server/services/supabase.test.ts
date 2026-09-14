import { beforeEach, describe, expect, it, vi } from 'vitest';

const createClient = vi.hoisted(() => vi.fn());

vi.mock('@supabase/supabase-js', () => ({ createClient }));

import { readControlCenterConfig } from '../config/env.js';
import {
  createConfiguredServiceRoleClient,
  createServiceRoleClient,
  isMissingColumnError,
  isMissingRpcError,
  postgrestErrorCode,
  postgrestErrorMessage,
} from './supabase.js';

describe('Supabase service helpers', () => {
  beforeEach(() => {
    createClient.mockReset();
  });

  it('creates a stateless service-role client for the requested schema', () => {
    const client = { from: vi.fn() };
    createClient.mockReturnValue(client);

    expect(
      createServiceRoleClient('https://db.example', 'service-key', 'ops'),
    ).toBe(client);
    expect(createClient).toHaveBeenCalledWith(
      'https://db.example',
      'service-key',
      {
        db: { schema: 'ops' },
        auth: { autoRefreshToken: false, persistSession: false },
      },
    );
  });

  it('uses public by default and refuses partial configuration', () => {
    createClient.mockReturnValue({});
    expect(createServiceRoleClient('https://db.example', 'key')).toEqual({});
    expect(createClient).toHaveBeenLastCalledWith(
      'https://db.example',
      'key',
      expect.objectContaining({ db: { schema: 'public' } }),
    );

    for (const env of [
      {},
      { SUPABASE_URL: 'https://db.example' },
      { SUPABASE_SERVICE_ROLE_KEY: 'key' },
    ]) {
      expect(
        createConfiguredServiceRoleClient(readControlCenterConfig(env)),
      ).toBeNull();
    }
  });

  it('creates a configured client only when both credentials are present', () => {
    const client = { rpc: vi.fn() };
    createClient.mockReturnValue(client);
    const config = readControlCenterConfig({
      SUPABASE_URL: 'https://db.example',
      SUPABASE_SERVICE_ROLE_KEY: 'key',
      SUPABASE_DB_SCHEMA: 'private_ops',
    });

    expect(createConfiguredServiceRoleClient(config)).toBe(client);
    expect(createClient).toHaveBeenCalledWith(
      'https://db.example',
      'key',
      expect.objectContaining({ db: { schema: 'private_ops' } }),
    );
  });

  it.each([
    [null, null],
    [undefined, null],
    ['42703', null],
    [{}, null],
    [{ code: 42703 }, null],
    [{ code: '42703' }, '42703'],
    [{ code: 'PGRST202' }, 'PGRST202'],
  ])('extracts PostgREST error codes from objects only', (input, expected) => {
    expect(postgrestErrorCode(input)).toBe(expected);
  });

  it('recognizes only the migration-related column and RPC codes', () => {
    expect(isMissingColumnError({ code: '42703' })).toBe(true);
    expect(isMissingColumnError({ code: '42883' })).toBe(false);
    expect(isMissingRpcError({ code: 'PGRST202' })).toBe(true);
    expect(isMissingRpcError({ code: '42883' })).toBe(true);
    expect(isMissingRpcError({ code: '42703' })).toBe(false);
  });

  it('unwraps Error and non-Error PostgREST messages without leaking objects', () => {
    expect(postgrestErrorMessage(new Error('offline'), 'fallback')).toBe(
      'offline',
    );
    expect(
      postgrestErrorMessage({ message: 'RPC unavailable' }, 'fallback'),
    ).toBe('RPC unavailable');
    expect(postgrestErrorMessage({ message: '   ' }, 'fallback')).toBe(
      'fallback',
    );
    expect(postgrestErrorMessage({ message: 42 }, 'fallback')).toBe('fallback');
    expect(postgrestErrorMessage({}, 'fallback')).toBe('fallback');
    expect(postgrestErrorMessage(null, 'fallback')).toBe('fallback');
  });
});
