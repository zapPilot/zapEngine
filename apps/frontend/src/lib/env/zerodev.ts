import { getRuntimeEnv } from './runtimeEnv';

export interface ZeroDevRuntimeConfig {
  projectId: string;
  rpc: string;
}

function readTrimmedEnv(key: string): string | undefined {
  const value = getRuntimeEnv(key)?.trim();
  return value ? value : undefined;
}

export function getZeroDevConfig(chainId: number): ZeroDevRuntimeConfig {
  const projectId =
    readTrimmedEnv('VITE_ZERODEV_PROJECT_ID') ??
    readTrimmedEnv('ZERODEV_PROJECT_ID');

  if (!projectId) {
    throw new Error(
      'Missing VITE_ZERODEV_PROJECT_ID for Privy EIP-7702 execution.',
    );
  }

  return {
    projectId,
    rpc: `https://rpc.zerodev.app/api/v3/${projectId}/chain/${chainId}`,
  };
}
