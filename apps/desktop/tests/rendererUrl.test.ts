import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/main/loopbackServer', () => ({
  startLoopbackServer: vi.fn().mockResolvedValue('http://127.0.0.1:3105/'),
}));

import { startLoopbackServer } from '../src/main/loopbackServer';
import { resolveRendererUrl } from '../src/main/rendererUrl';

describe('renderer origin', () => {
  beforeEach(() => vi.clearAllMocks());

  it('starts packaged apps on a Privy-compatible origin without shell overrides', async () => {
    const url = await resolveRendererUrl('/bundle/web', true, {});
    expect(url).toBe('http://127.0.0.1:3105/');
    expect(startLoopbackServer).toHaveBeenCalledWith('/bundle/web', 3105);
  });

  it('does not let a development URL replace the packaged renderer', async () => {
    await resolveRendererUrl('/bundle/web', true, {
      ZAP_ELECTRON_DEV_URL: 'http://localhost:8081',
      ZAP_ELECTRON_LOOPBACK: '0',
    });
    expect(startLoopbackServer).toHaveBeenCalledWith('/bundle/web', 3105);
  });

  it('preserves the development server path', async () => {
    expect(
      await resolveRendererUrl('/web', false, {
        ZAP_ELECTRON_DEV_URL: 'http://localhost:8081',
      }),
    ).toBe('http://localhost:8081');
    expect(startLoopbackServer).not.toHaveBeenCalled();
  });

  it('preserves opt-in loopback with a configured port', async () => {
    await resolveRendererUrl('/web', false, {
      ZAP_ELECTRON_LOOPBACK: '1',
      ZAP_ELECTRON_LOOPBACK_PORT: '3200',
    });
    expect(startLoopbackServer).toHaveBeenCalledWith('/web', 3200);
  });

  it('retains the app protocol path for unpackaged runs', async () => {
    expect(await resolveRendererUrl('/web', false, {})).toBeUndefined();
    expect(startLoopbackServer).not.toHaveBeenCalled();
  });
});
