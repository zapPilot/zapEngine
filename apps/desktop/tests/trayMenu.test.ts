import { expect, it, vi } from 'vitest';

import { updateTrayItem } from '../src/main/trayMenu';
it('shows update actions and disables progress', () => {
  const actions = { download: vi.fn(), install: vi.fn() },
    currentVersion = '0.2.0',
    version = '0.2.1';
  expect(updateTrayItem({ status: 'idle', currentVersion }, actions)).toEqual(
    [],
  );
  const available = updateTrayItem(
    { status: 'available', currentVersion, version },
    actions,
  )[0];
  available?.click?.();
  expect(actions.download).toHaveBeenCalledOnce();
  expect(
    updateTrayItem(
      { status: 'downloading', currentVersion, version, percent: 12 },
      actions,
    ),
  ).toEqual([{ label: 'Downloading 12%', enabled: false }]);
  updateTrayItem(
    { status: 'downloaded', currentVersion, version },
    actions,
  )[0]?.click?.();
  expect(actions.install).toHaveBeenCalledOnce();
});
