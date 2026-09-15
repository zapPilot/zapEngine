import { beforeEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({ value: undefined as string | undefined }));

vi.mock('@core/lib/env/runtimeEnv', () => ({
  getRuntimeEnv: (key: string) =>
    key === 'VITE_PRIVY_APP_ID' ? env.value : undefined,
}));

import { getPrivyAppId } from '@core/lib/env/privy';

describe('getPrivyAppId', () => {
  beforeEach(() => {
    env.value = undefined;
  });

  it('returns undefined when the value is missing or blank', () => {
    expect(getPrivyAppId()).toBeUndefined();
    env.value = '   ';
    expect(getPrivyAppId()).toBeUndefined();
  });

  it('trims and returns a configured Privy app id', () => {
    env.value = '  app-id-123  ';
    expect(getPrivyAppId()).toBe('app-id-123');
  });
});
