import { describe, expect, it, vi } from 'vitest';

import {
  getNativePrivyLoginConfig,
  isPrivyLoginCancellation,
  loginWithPrivy,
  NATIVE_PRIVY_AUTH_COPY,
  NATIVE_PRIVY_PROVIDER_CONFIG,
} from '@/integration/nativePrivyLogin';
import {
  NATIVE_PRIVY_AUTH_COPY as IOS_PRIVY_AUTH_COPY,
  NATIVE_PRIVY_PROVIDER_CONFIG as IOS_PRIVY_PROVIDER_CONFIG,
} from '@/integration/nativePrivyConfig.ios';

describe('native Privy login', () => {
  it('uses the Privy-managed email flow', async () => {
    const login = vi.fn().mockResolvedValue({ user: { id: 'privy-user' } });

    await loginWithPrivy(login);

    expect(login).toHaveBeenCalledOnce();
    expect(login).toHaveBeenCalledWith({ loginMethods: ['email'] });
  });

  it('propagates Privy login failures to the caller', async () => {
    const loginError = new Error('Privy login failed');
    const login = vi.fn().mockRejectedValue(loginError);

    await expect(loginWithPrivy(login)).rejects.toBe(loginError);

    expect(login).toHaveBeenCalledOnce();
    expect(login).toHaveBeenCalledWith({ loginMethods: ['email'] });
  });

  it('keeps the existing Android embedded-wallet behavior', () => {
    expect(getNativePrivyLoginConfig()).toEqual({ loginMethods: ['email'] });
    expect(NATIVE_PRIVY_AUTH_COPY.body).toContain('embedded wallet');
    expect(NATIVE_PRIVY_PROVIDER_CONFIG).toEqual({
      embedded: {
        ethereum: {
          createOnLogin: 'users-without-wallets',
        },
      },
    });
  });

  it('uses Privy only for authentication on iOS', () => {
    expect(IOS_PRIVY_AUTH_COPY.cta).toBe('Continue with Privy');
    expect(IOS_PRIVY_AUTH_COPY.body).toContain('powered by Privy');
    expect(IOS_PRIVY_AUTH_COPY.body).not.toContain('wallet');
    expect(IOS_PRIVY_PROVIDER_CONFIG).toEqual({
      embedded: {
        ethereum: {
          createOnLogin: 'off',
        },
      },
    });
  });

  it('treats closing the Privy login UI as cancellation', () => {
    expect(isPrivyLoginCancellation({ code: 'login_flow_closed' })).toBe(true);
    expect(isPrivyLoginCancellation({ code: 'ui_flow_closed' })).toBe(true);
    expect(isPrivyLoginCancellation({ code: 'underlying_error' })).toBe(false);
    expect(isPrivyLoginCancellation(new Error('network failed'))).toBe(false);
  });
});
