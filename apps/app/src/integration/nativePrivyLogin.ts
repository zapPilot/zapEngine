export {
  NATIVE_PRIVY_AUTH_COPY,
  NATIVE_PRIVY_PROVIDER_CONFIG,
} from '@/integration/nativePrivyConfig';

export function getNativePrivyLoginConfig(): { loginMethods: ['email'] } {
  return { loginMethods: ['email'] };
}

type PrivyLogin = (config: { loginMethods: ['email'] }) => Promise<unknown>;

/** Opens Privy's managed email login UI. Wallet provisioning is platform-configured. */
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
