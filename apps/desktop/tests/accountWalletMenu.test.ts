import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import {
  DesktopWalletMenuPanel,
  type DesktopWalletMenuPanelProps,
} from '../src/components/account/DesktopWalletMenuPanel';

const ADDRESS = '0x1234567890123456789012345678901234567890';

function renderPanel(overrides: Partial<DesktopWalletMenuPanelProps>) {
  const props = {
    address: null,
    copiedAddress: null,
    isConnected: false,
    isConnecting: false,
    onConnect: vi.fn(),
    onCopyAddress: vi.fn(),
    onDisconnect: vi.fn(),
    onOpenBundles: vi.fn(),
    onOpenSettings: vi.fn(),
    ...overrides,
  } as DesktopWalletMenuPanelProps;

  return renderToStaticMarkup(createElement(DesktopWalletMenuPanel, props));
}

describe('DesktopWalletMenuPanel', () => {
  it('shows the create wallet action while disconnected', () => {
    const markup = renderPanel({});

    expect(markup).toContain('No wallet connected');
    expect(markup).toContain('Create Zap Wallet');
    expect(markup).toContain('aria-label="Create Zap Wallet"');
  });

  it('shows connected wallet actions with bundled wallets enabled', () => {
    const markup = renderPanel({
      address: ADDRESS,
      isConnected: true,
    });

    expect(markup).toContain('Connected wallet');
    expect(markup).toContain('0x1234…7890');
    expect(markup).toContain('aria-label="Copy wallet address"');
    expect(markup).toContain('View Bundles');
    expect(markup).toContain('aria-label="View bundled wallets"');
    expect(markup).not.toContain('Soon');
    expect(markup).not.toContain('aria-disabled="true"');
    expect(markup).not.toContain('disabled=""');
    expect(markup).toContain('Settings');
    expect(markup).toContain('Disconnect');
  });
});
