import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TokenSelectorRow } from '@/components/shared/token';
import type { TokenBalanceQuery } from '@/hooks/queries/wallet/useTokenBalances';
import type { TransactionToken } from '@/types/domain/transaction';

import { render, screen } from '../../../../test-utils';

const USDC_TOKEN: TransactionToken = {
  symbol: 'USDC',
  name: 'USD Coin',
  address: '0x123',
  chainId: 8453,
  decimals: 6,
};

function makeQuery(
  overrides: Partial<TokenBalanceQuery> = {},
): TokenBalanceQuery {
  return {
    data: undefined,
    isPending: false,
    isError: false,
    ...overrides,
  } as TokenBalanceQuery;
}

describe('TokenSelectorRow', () => {
  it('renders a disconnected balance state', () => {
    render(
      <TokenSelectorRow
        token={USDC_TOKEN}
        selected={false}
        query={undefined}
        isConnected={false}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText('Connect wallet')).toBeInTheDocument();
  });

  it('renders loading, error, and balance readout states', () => {
    const { container, rerender } = render(
      <TokenSelectorRow
        token={USDC_TOKEN}
        selected={false}
        query={makeQuery({ isPending: true })}
        isConnected={true}
        onSelect={vi.fn()}
      />,
    );

    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();

    rerender(
      <TokenSelectorRow
        token={USDC_TOKEN}
        selected={false}
        query={makeQuery({ isError: true })}
        isConnected={true}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText('—')).toBeInTheDocument();

    rerender(
      <TokenSelectorRow
        token={USDC_TOKEN}
        selected={false}
        query={makeQuery({
          data: { balance: '12.34', usdValue: 12.34 },
        })}
        isConnected={true}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText('12.34')).toBeInTheDocument();
    expect(screen.getByText('$12.34')).toBeInTheDocument();
  });

  it('applies selected styling and fires onSelect', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(
      <TokenSelectorRow
        token={USDC_TOKEN}
        selected={true}
        query={makeQuery({
          data: { balance: '1', usdValue: 1 },
        })}
        isConnected={true}
        onSelect={onSelect}
      />,
    );

    const button = screen.getByRole('button', { name: /usdc/i });

    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button).toHaveClass('border-indigo-500/60');

    await user.click(button);

    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
