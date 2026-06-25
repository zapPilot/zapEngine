import userEvent from '@testing-library/user-event';
import type { TokenBalanceQuery } from '@zapengine/app-core/hooks/queries/wallet/useTokenBalances';
import type { TransactionToken } from '@zapengine/app-core/types/domain/transaction';
import { describe, expect, it, vi } from 'vitest';

import { TokenSelectorList } from '@/components/shared/token';

import { render, screen } from '../../../../test-utils';

function token(overrides: Partial<TransactionToken> = {}): TransactionToken {
  return {
    symbol: 'USDC',
    name: 'USD Coin',
    address: '0x1',
    chainId: 8453,
    decimals: 6,
    ...overrides,
  };
}

const USDC = token();
const DAI = token({ symbol: 'DAI', name: 'Dai', address: '0x2' });
const WETH = token({ symbol: 'WETH', name: 'Wrapped Ether', address: '0x3' });

const emptyBalances = new Map<string, TokenBalanceQuery>();

describe('TokenSelectorList', () => {
  it('renders skeleton placeholders while loading and no token rows', () => {
    const { container } = render(
      <TokenSelectorList
        tokens={[USDC, DAI]}
        selectedAddress={undefined}
        balancesByAddress={emptyBalances}
        isConnected={false}
        isLoading={true}
        onSelect={vi.fn()}
      />,
    );

    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(2);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders one row per token and honors the limit prop', () => {
    render(
      <TokenSelectorList
        tokens={[USDC, DAI, WETH]}
        selectedAddress={undefined}
        balancesByAddress={emptyBalances}
        isConnected={false}
        isLoading={false}
        onSelect={vi.fn()}
        limit={2}
      />,
    );

    expect(screen.getByRole('button', { name: /usdc/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /dai/i })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /weth/i }),
    ).not.toBeInTheDocument();
  });

  it('marks the selected token and forwards its address on click', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(
      <TokenSelectorList
        tokens={[USDC, DAI]}
        selectedAddress="0x2"
        balancesByAddress={emptyBalances}
        isConnected={false}
        isLoading={false}
        onSelect={onSelect}
      />,
    );

    expect(screen.getByRole('button', { name: /dai/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: /usdc/i })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    await user.click(screen.getByRole('button', { name: /usdc/i }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('0x1');
  });
});
