import { describe, expect, it } from 'vitest';

import { TokenBalanceReadout } from '@/components/shared/token';
import type { TokenBalanceQuery } from '@/hooks/queries/wallet/useTokenBalances';

import { render, screen } from '../../../../test-utils';

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

describe('TokenBalanceReadout', () => {
  it('prompts to connect when the wallet is disconnected', () => {
    render(<TokenBalanceReadout query={undefined} isConnected={false} />);

    expect(screen.getByText('Connect wallet')).toBeInTheDocument();
  });

  it('shows a skeleton when the query is missing or pending', () => {
    const { container, rerender } = render(
      <TokenBalanceReadout query={undefined} isConnected={true} />,
    );
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();

    rerender(
      <TokenBalanceReadout
        query={makeQuery({ isPending: true })}
        isConnected={true}
      />,
    );
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('renders an em dash on error or when data is absent', () => {
    const { rerender } = render(
      <TokenBalanceReadout
        query={makeQuery({ isError: true })}
        isConnected={true}
      />,
    );
    expect(screen.getByText('—')).toBeInTheDocument();

    rerender(<TokenBalanceReadout query={makeQuery()} isConnected={true} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders the formatted balance and USD value when data is present', () => {
    render(
      <TokenBalanceReadout
        query={makeQuery({ data: { balance: '12.34', usdValue: 12.34 } })}
        isConnected={true}
      />,
    );

    expect(screen.getByText('12.34')).toBeInTheDocument();
    expect(screen.getByText('$12.34')).toBeInTheDocument();
  });
});
