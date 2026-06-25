import {
  getPrivyAppId,
  isPrivyEnabled,
} from '@zapengine/app-core/lib/env/privy';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const runtimeEnvMocks = vi.hoisted(() => ({
  getRuntimeEnv: vi.fn(() => undefined as string | undefined),
}));

vi.mock('@zapengine/app-core/lib/env/runtimeEnv', () => ({
  getRuntimeEnv: (key: string) => runtimeEnvMocks.getRuntimeEnv(key),
}));

describe('privy env', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getPrivyAppId', () => {
    it('returns undefined when VITE_PRIVY_APP_ID is not set', () => {
      runtimeEnvMocks.getRuntimeEnv.mockReturnValue(undefined);

      expect(getPrivyAppId()).toBeUndefined();
    });

    it('returns undefined when VITE_PRIVY_APP_ID is blank', () => {
      runtimeEnvMocks.getRuntimeEnv.mockReturnValue('   ');

      expect(getPrivyAppId()).toBeUndefined();
    });

    it('returns trimmed value when VITE_PRIVY_APP_ID is set', () => {
      runtimeEnvMocks.getRuntimeEnv.mockReturnValue('  cm-privy-id-123  ');

      expect(getPrivyAppId()).toBe('cm-privy-id-123');
    });

    it('returns the raw value when VITE_PRIVY_APP_ID has no surrounding whitespace', () => {
      runtimeEnvMocks.getRuntimeEnv.mockReturnValue('test-app-id');

      expect(getPrivyAppId()).toBe('test-app-id');
    });
  });

  describe('isPrivyEnabled', () => {
    it('returns false when no app ID is configured', () => {
      runtimeEnvMocks.getRuntimeEnv.mockReturnValue(undefined);

      expect(isPrivyEnabled()).toBe(false);
    });

    it('returns false when app ID is blank', () => {
      runtimeEnvMocks.getRuntimeEnv.mockReturnValue('');

      expect(isPrivyEnabled()).toBe(false);
    });

    it('returns true when app ID is configured', () => {
      runtimeEnvMocks.getRuntimeEnv.mockReturnValue('privy-app-id');

      expect(isPrivyEnabled()).toBe(true);
    });

    it('returns true when app ID has surrounding whitespace', () => {
      runtimeEnvMocks.getRuntimeEnv.mockReturnValue('  privy-app-id  ');

      expect(isPrivyEnabled()).toBe(true);
    });
  });
});
