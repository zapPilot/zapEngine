import { startLoopbackServer } from './loopbackServer';

export async function resolveRendererUrl(
  webRoot: string,
  isPackaged: boolean,
  env: NodeJS.ProcessEnv,
): Promise<string | undefined> {
  if (!isPackaged && env['ZAP_ELECTRON_DEV_URL']) {
    return env['ZAP_ELECTRON_DEV_URL'];
  }
  if (isPackaged || env['ZAP_ELECTRON_LOOPBACK'] === '1') {
    return startLoopbackServer(
      webRoot,
      Number(env['ZAP_ELECTRON_LOOPBACK_PORT'] ?? '3105'),
    );
  }
  return undefined;
}
