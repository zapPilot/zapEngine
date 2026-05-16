import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  TokenAmountField,
  type TokenAmountFieldProps,
} from '@/components/shared/token';

import { render, screen } from '../../../../test-utils';

const USDC_TOKEN = {
  symbol: 'USDC',
  decimals: 6,
};

interface RenderTokenAmountFieldOptions extends Omit<
  TokenAmountFieldProps,
  'amount' | 'onAmountChange'
> {
  initialAmount?: string;
}

function renderTokenAmountField({
  initialAmount = '',
  ...props
}: RenderTokenAmountFieldOptions) {
  const onAmountChange = vi.fn();

  function Harness() {
    const [amount, setAmount] = useState(initialAmount);

    return (
      <TokenAmountField
        {...props}
        amount={amount}
        onAmountChange={(nextAmount) => {
          onAmountChange(nextAmount);
          setAmount(nextAmount);
        }}
      />
    );
  }

  render(<Harness />);

  return { onAmountChange };
}

describe('TokenAmountField', () => {
  it('converts USD input to canonical token amounts and toggles back to token display', async () => {
    const user = userEvent.setup();
    const { onAmountChange } = renderTokenAmountField({
      token: USDC_TOKEN,
      usdPrice: 2,
      balance: 100,
    });

    const input = screen.getByRole('textbox', { name: /amount/i });

    await user.type(input, '20');

    expect(input).toHaveValue('20');
    expect(onAmountChange).toHaveBeenLastCalledWith('10');
    expect(screen.getByText('≈ 10.00 USDC')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'USDC' }));

    expect(input).toHaveValue('10');

    await user.click(screen.getByRole('button', { name: 'USD' }));

    expect(input).toHaveValue('20');
  });

  it('keeps MAX as the full token balance', async () => {
    const user = userEvent.setup();
    const { onAmountChange } = renderTokenAmountField({
      token: USDC_TOKEN,
      usdPrice: 2,
      balance: 123.456789,
    });

    await user.click(screen.getByRole('button', { name: 'USDC' }));
    await user.click(screen.getByRole('button', { name: 'MAX' }));

    expect(onAmountChange).toHaveBeenLastCalledWith('123.456789');
    expect(screen.getByRole('textbox', { name: /amount/i })).toHaveValue(
      '123.456789',
    );
  });

  it('applies percentage pills from token balance and emits token-denominated values', async () => {
    const user = userEvent.setup();
    const { onAmountChange } = renderTokenAmountField({
      token: USDC_TOKEN,
      usdPrice: 1,
      balance: 10,
    });

    await user.click(screen.getByRole('button', { name: '25%' }));
    expect(onAmountChange).toHaveBeenLastCalledWith('2.5');

    await user.click(screen.getByRole('button', { name: '75%' }));
    expect(onAmountChange).toHaveBeenLastCalledWith('7.5');
  });

  it('leaves input enabled but disables toggle and pills when no token is selected', async () => {
    const user = userEvent.setup();
    const { onAmountChange } = renderTokenAmountField({
      token: null,
      usdPrice: 1,
      balance: 10,
    });

    const input = screen.getByRole('textbox', { name: /amount/i });

    expect(input).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'USD' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Token' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'MAX' })).toBeDisabled();

    await user.type(input, '5');

    expect(onAmountChange).toHaveBeenLastCalledWith('5');
  });

  it('forces token mode and disables USD toggle when no USD price is available', async () => {
    const user = userEvent.setup();
    const { onAmountChange } = renderTokenAmountField({
      token: USDC_TOKEN,
      balance: 10,
    });

    const input = screen.getByRole('textbox', { name: /amount/i });

    expect(screen.getByRole('button', { name: 'USD' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'USDC' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.type(input, '5');

    expect(input).toHaveValue('5');
    expect(onAmountChange).toHaveBeenLastCalledWith('5');
  });

  it('disables percentage pills when balance is unavailable', () => {
    renderTokenAmountField({
      token: USDC_TOKEN,
      usdPrice: 1,
    });

    expect(screen.getByRole('button', { name: '25%' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'MAX' })).toBeDisabled();
  });
});
