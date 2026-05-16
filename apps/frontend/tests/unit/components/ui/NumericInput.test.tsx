import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { NumericInput } from '@/components/ui';

import { render, screen } from '../../../test-utils';

interface NumericInputHarnessProps {
  initialValue?: string;
  onValueChange?: (value: string) => void;
}

function NumericInputHarness({
  initialValue = '',
  onValueChange,
}: NumericInputHarnessProps) {
  const [value, setValue] = useState(initialValue);

  const handleChange = (nextValue: string): void => {
    setValue(nextValue);
    onValueChange?.(nextValue);
  };

  return (
    <NumericInput
      value={value}
      onChange={handleChange}
      aria-label="Amount"
      placeholder="0.00"
    />
  );
}

describe('NumericInput', () => {
  it('accepts digits, a single decimal point, leading decimal, and empty values', async () => {
    const user = userEvent.setup();

    render(<NumericInputHarness />);
    const input = screen.getByRole('textbox', { name: /amount/i });

    await user.type(input, '12.34');
    expect(input).toHaveValue('12.34');

    await user.clear(input);
    expect(input).toHaveValue('');

    await user.type(input, '.5');
    expect(input).toHaveValue('.5');
  });

  it('rejects letters, e notation, signs, and double decimal points', async () => {
    const user = userEvent.setup();

    render(<NumericInputHarness />);
    const input = screen.getByRole('textbox', { name: /amount/i });

    await user.type(input, '1e-2+3a.4.5');

    expect(input).toHaveValue('123.45');
  });

  it('normalizes comma decimals to periods', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();

    render(<NumericInputHarness onValueChange={onValueChange} />);
    const input = screen.getByRole('textbox', { name: /amount/i });

    await user.type(input, '1,5');

    expect(input).toHaveValue('1.5');
    expect(onValueChange).toHaveBeenLastCalledWith('1.5');
  });

  it('uses text input attributes suited for decimal token amounts', () => {
    render(<NumericInputHarness />);

    const input = screen.getByRole('textbox', { name: /amount/i });

    expect(input).toHaveAttribute('type', 'text');
    expect(input).toHaveAttribute('inputMode', 'decimal');
    expect(input).toHaveAttribute('pattern', '^[0-9]*[.,]?[0-9]*$');
    expect(input).toHaveAttribute('autoComplete', 'off');
    expect(input).toHaveAttribute('autoCorrect', 'off');
    expect(input).toHaveAttribute('spellCheck', 'false');
    expect(input).toHaveAttribute('minLength', '1');
    expect(input).toHaveAttribute('maxLength', '79');
  });
});
