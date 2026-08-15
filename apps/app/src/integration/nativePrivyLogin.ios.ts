export const NATIVE_PRIVY_AUTH_COPY = {
  body: 'Continue with email. Authentication is powered by Privy.',
  cta: 'Continue with Privy',
  hint: 'Opens Privy email sign-in',
} as const;

export const NATIVE_PRIVY_PROVIDER_CONFIG = {
  embedded: {
    ethereum: {
      createOnLogin: 'off',
    },
  },
} as const;

export function getNativePrivyLoginConfig(): { loginMethods: ['email'] } {
  return { loginMethods: ['email'] };
}

type PrivyLogin = (config: { loginMethods: ['email'] }) => Promise<unknown>;

/** Opens Privy's managed login UI for iOS account authentication. */
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
