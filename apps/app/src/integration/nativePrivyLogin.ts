export const NATIVE_PRIVY_AUTH_COPY = {
  body: 'Continue with email. Authentication and your embedded wallet are powered by Privy.',
  cta: 'Continue with Privy',
  hint: 'Opens Privy email sign-in',
} as const;

export const NATIVE_PRIVY_PROVIDER_CONFIG = {
  embedded: {
    ethereum: {
      createOnLogin: 'users-without-wallets',
    },
  },
} as const;

export function getNativePrivyLoginConfig(): { loginMethods: ['email'] } {
  return { loginMethods: ['email'] };
}

type PrivyLogin = (config: { loginMethods: ['email'] }) => Promise<unknown>;

/**
 * Opens Privy's managed login UI. Embedded-wallet creation stays with
 * PrivyProvider's createOnLogin policy so a successful login cannot race a
 * second manual wallet-creation request.
 */
export async function loginWithPrivy(login: PrivyLogin): Promise<void> {
  await login(getNativePrivyLoginConfig());
}

export function isPrivyLoginCancellation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false;
  }

  const code = (error as { code?: unknown }).code;
  return code === 'login_flow_closed' || code === 'ui_flow_closed';
}
