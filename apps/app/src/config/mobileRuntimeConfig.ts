export interface ExpoExtraConfig {
  appRuntime?: string;
  privyAppId?: string;
  privyClientId?: string;
}

export interface MobileRuntimeConfig {
  runtime: 'app';
  privy: {
    appId: string;
    clientId: string;
  } | null;
}

function normalizeSecret(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function getMobileRuntimeConfig(
  extra: ExpoExtraConfig = {},
): MobileRuntimeConfig {
  const appId = normalizeSecret(extra.privyAppId);
  const clientId = normalizeSecret(extra.privyClientId);

  return {
    runtime: 'app',
    privy:
      appId && clientId
        ? {
            appId,
            clientId,
          }
        : null,
  };
}
