import { describe, expect, it, vi } from 'vitest';

import {
  getNativePrivyLoginConfig,
  isPrivyLoginCancellation,
  loginWithPrivy,
  NATIVE_PRIVY_AUTH_COPY,
  NATIVE_PRIVY_PROVIDER_CONFIG,
} from '@/integration/nativePrivyLogin';

describe('native Privy login', () => {
  it('uses the Privy-managed email flow without creating another wallet', async () => {
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

  it('identifies Privy clearly in the native authentication UI', () => {
    expect(getNativePrivyLoginConfig()).toEqual({ loginMethods: ['email'] });
    expect(NATIVE_PRIVY_AUTH_COPY.cta).toBe('Continue with Privy');
    expect(NATIVE_PRIVY_AUTH_COPY.body).toContain('powered by Privy');
    expect(NATIVE_PRIVY_AUTH_COPY.hint).toBe('Opens Privy email sign-in');
  });

  it('delegates embedded-wallet creation to Privy after login', () => {
    expect(NATIVE_PRIVY_PROVIDER_CONFIG).toEqual({
      embedded: {
        ethereum: {
          createOnLogin: 'users-without-wallets',
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
