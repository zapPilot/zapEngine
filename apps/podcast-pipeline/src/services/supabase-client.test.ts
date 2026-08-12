import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  client: {},
  createClient: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.createClient,
}));

vi.mock('../lib/env.js', () => ({
  getRequiredEnv: vi.fn((key: string) => {
    if (key === 'SUPABASE_URL') return 'https://example.supabase.co';
    if (key === 'SUPABASE_SERVICE_ROLE_KEY') return 'test-key';
    throw new Error(`Unknown env: ${key}`);
  }),
}));

import { getPipelineSupabase, throwSupabaseError } from './supabase-client.js';

describe('getPipelineSupabase', () => {
  it('creates one shared client', () => {
    mocks.createClient.mockReturnValue(mocks.client);

    expect(getPipelineSupabase()).toBe(mocks.client);
    expect(getPipelineSupabase()).toBe(mocks.client);
    expect(mocks.createClient).toHaveBeenCalledOnce();
  });
});

describe('throwSupabaseError', () => {
  it('preserves Error instances', () => {
    const error = new Error('query failed');

    expect(() => throwSupabaseError(error)).toThrow(error);
  });

  it('formats Supabase error metadata', () => {
    expect.assertions(1);
    const error = {
      code: 'PGRST204',
      message: 'Column not found',
      details: 'Missing classroom_hls_url',
      hint: 'Refresh the schema cache',
    };

    try {
      throwSupabaseError(error);
    } catch (caught) {
      expect(caught).toMatchObject({
        message:
          '[PGRST204] Column not found Details: Missing classroom_hls_url Hint: Refresh the schema cache',
        cause: error,
        supabaseError: error,
      });
    }
  });

  it('uses a stable fallback for unstructured objects', () => {
    expect(() => throwSupabaseError({})).toThrow('Supabase request failed');
  });
});
