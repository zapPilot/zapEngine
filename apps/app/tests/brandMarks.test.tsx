// @vitest-environment jsdom

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ChainMark } from '@/components/token/ChainMark';
import { ProtocolIcon } from '@/components/token/ProtocolIcon';
import { TokenIcon } from '@/components/token/TokenIcon';

interface ImageMockProps {
  source: { uri: string } | string;
  accessible?: boolean;
  accessibilityLabel?: string;
  onError?: () => void;
}

vi.mock('react-native', () => ({
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  View: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Image: ({
    source,
    accessible,
    accessibilityLabel,
    onError,
  }: ImageMockProps) => (
    <img
      alt={accessibilityLabel ?? ''}
      data-source={typeof source === 'string' ? source : source.uri}
      data-accessible={String(Boolean(accessible))}
      onError={onError}
    />
  ),
}));

// Metro resolves these through `require`, which vitest cannot run. The mark
// identity is all these tests need, so each entry is its own sentinel string.
vi.mock('@/data/assetIcons', () => ({
  CHAIN_ICON_SRC: {
    ethereum: 'mark:chains/ethereum',
    base: 'mark:chains/base',
    arbitrum: 'mark:chains/arbitrum',
    hyperliquid: 'mark:chains/hyperliquid',
  },
  TOKEN_ICON_SRC: {
    USDC: 'mark:tokens/usdc',
    USDT: 'mark:tokens/usdt',
    ETH: 'mark:tokens/eth',
    WETH: 'mark:tokens/weth',
    WBTC: 'mark:tokens/wbtc',
    CBBTC: 'mark:tokens/cbbtc',
    BTC: 'mark:tokens/btc',
    SPY: 'mark:tokens/spy',
    ALT: 'mark:tokens/alt',
  },
  PROTOCOL_ICON_SRC: {
    morpho: 'mark:protocols/morpho',
    'gmx-v2': 'mark:protocols/gmx-v2',
    hyperliquid: 'mark:protocols/hyperliquid',
    ondo: 'mark:protocols/ondo',
    aave: 'mark:protocols/aave',
    lido: 'mark:protocols/lido',
  },
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function render(node: ReactNode) {
  await act(async () => root.render(node));
}

function marks(): string[] {
  return [...container.querySelectorAll('img')].map(
    (image) => image.dataset.source ?? '',
  );
}

describe('TokenIcon', () => {
  it('resolves the committed mark from the symbol', async () => {
    await render(<TokenIcon symbol="USDC" />);
    expect(marks()).toEqual(['mark:tokens/usdc']);
  });

  it('normalizes casing that wallet indexers return', async () => {
    await render(<TokenIcon symbol="cbBTC" />);
    expect(marks()).toEqual(['mark:tokens/cbbtc']);
  });

  it('renders the S&P 500 category mark', async () => {
    await render(<TokenIcon symbol="SPY" />);
    expect(marks()).toEqual(['mark:tokens/spy']);
  });

  it('falls back to the initial for a symbol outside the registry', async () => {
    await render(<TokenIcon symbol="DOGE" />);
    expect(marks()).toEqual([]);
    expect(container.textContent).toBe('D');
  });

  it('adds the chain badge when a chain key is given', async () => {
    await render(<TokenIcon symbol="USDC" chainKey="base" />);
    expect(marks()).toEqual(['mark:tokens/usdc', 'mark:chains/base']);
  });

  it('never labels the chain badge, so a labelled row reads once', async () => {
    await render(<TokenIcon symbol="USDC" chainKey="base" alt="USD Coin" />);
    const accessible = [...container.querySelectorAll('img')].map(
      (image) => image.dataset.accessible,
    );
    expect(accessible).toEqual(['true', 'false']);
  });

  it('prefers the committed mark over a remote logo', async () => {
    await render(
      <TokenIcon symbol="USDC" remoteLogoUrl="https://cdn.test/usdc.png" />,
    );
    expect(marks()).toEqual(['mark:tokens/usdc']);
  });

  it('uses a remote logo for a symbol with no committed mark', async () => {
    await render(
      <TokenIcon symbol="GM" remoteLogoUrl="https://cdn.test/gm.png" />,
    );
    expect(marks()).toEqual(['https://cdn.test/gm.png']);
  });

  it('falls back to the initial when the remote logo fails to load', async () => {
    await render(
      <TokenIcon symbol="GM" remoteLogoUrl="https://cdn.test/gm.png" />,
    );
    const image = container.querySelector('img');
    await act(async () => {
      image?.dispatchEvent(new Event('error'));
    });
    expect(marks()).toEqual([]);
    expect(container.textContent).toBe('G');
  });
});

describe('ProtocolIcon', () => {
  it('resolves the venue mark from a protocol id', async () => {
    await render(<ProtocolIcon protocol="morpho" />);
    expect(marks()).toEqual(['mark:protocols/morpho']);
  });

  it('resolves an aliased protocol spelling', async () => {
    await render(<ProtocolIcon protocol="GMX" />);
    expect(marks()).toEqual(['mark:protocols/gmx-v2']);
  });

  it('normalizes a registered protocol label', async () => {
    await render(<ProtocolIcon protocol="Aave" />);
    expect(marks()).toEqual(['mark:protocols/aave']);
  });

  it('falls back to a monogram for an unregistered protocol', async () => {
    await render(<ProtocolIcon protocol="unknown-router" />);
    expect(marks()).toEqual([]);
    expect(container.textContent).toBe('U');
  });
});

describe('ChainMark', () => {
  it('renders the chain mark', async () => {
    await render(<ChainMark chainKey="arbitrum" />);
    expect(marks()).toEqual(['mark:chains/arbitrum']);
  });

  it('announces the chain name only when asked', async () => {
    await render(<ChainMark chainKey="arbitrum" labelled />);
    expect(container.querySelector('img')?.getAttribute('alt')).toBe(
      'Arbitrum',
    );
  });
});
