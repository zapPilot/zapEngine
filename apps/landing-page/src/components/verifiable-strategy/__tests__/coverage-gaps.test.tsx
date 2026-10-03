import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AllocationCompare } from '../AllocationPreview';
import { AssetCrossTrack } from '../AssetCrossTrack';
import { VerifyYourself } from '../VerifyYourself';
import { ContractAnswer } from '../ContractAnswer';
import { CalculatorForm } from '../CalculatorForm';
import {
  encodeInputs,
  foldAllocation,
  inputFromExample,
  validateInput,
} from '@/lib/verifiable-strategy/encoding';
import { dataset, example } from '@/lib/verifiable-strategy/__tests__/fixtures';
import { runCalculator } from '@/lib/verifiable-strategy/onchain';

afterEach(cleanup);

describe('verifiable-strategy coverage gaps', () => {
  it('compares allocations when the after side is shorter', () => {
    const before = [10000000000000000n, 0n, 0n, 0n];
    render(<AllocationCompare before={before} after={[]} afterLabel="After" />);
    expect(screen.getAllByText('Before').length).toBeGreaterThan(0);
    expect(screen.getAllByText('0.00%').length).toBeGreaterThan(0);
  });

  it('shows missing data for non-finite cross inputs and flat ranges', () => {
    const bad = { price: 'not-a-number', dma: '100' };
    const good = { price: '100', dma: '100' };
    const { unmount } = render(
      <AssetCrossTrack asset="BTC" previous={bad} current={good} />,
    );
    expect(screen.getByText('Missing data')).toBeInTheDocument();
    unmount();
    render(
      <AssetCrossTrack
        asset="ETH"
        previous={{ price: '100', dma: '100' }}
        current={{ price: '100', dma: '100' }}
      />,
    );
    expect(screen.getByRole('img', { name: /yesterday/ })).toBeInTheDocument();
  });

  it('copies verify commands and falls back when clipboard is unavailable', async () => {
    const { mockClient } =
      await import('@/lib/verifiable-strategy/__tests__/fixtures');
    const input = inputFromExample(example);
    const result = await runCalculator(input, dataset, mockClient().client);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValueOnce(new Error('Denied')) },
    });
    render(<VerifyYourself result={result} deployment={dataset.deployment!} />);
    fireEvent.click(screen.getAllByRole('button')[0]!);
    expect(await screen.findByText(/Copy unavailable/)).toBeInTheDocument();
  });

  it('rejects safe-slice overflow in encodeInputs', () => {
    const input = inputFromExample(example);
    const huge = '9'.repeat(42);
    expect(() =>
      encodeInputs({
        ...input,
        current: input.current.map((row) => ({ ...row, price: huge })),
      }),
    ).toThrow(/safe slice range/);
  });

  it('folds short allocation lists with zero defaults', () => {
    expect(foldAllocation([])).toEqual([0n, 0n, 0n, 0n]);
    expect(foldAllocation(['10'])).toEqual([100000000000000000n, 0n, 0n, 0n]);
  });

  it('records Invalid input when a field getter throws non-Error', () => {
    const input = inputFromExample(example);
    const bad = {
      ...input,
      current: input.current.map((row, i) =>
        i === 0
          ? Object.defineProperty({ ...row }, 'price', {
              get() {
                throw 'oops-string';
              },
            })
          : row,
      ),
    };
    const errors = validateInput(bad as never);
    expect(errors['current.0.price']).toBe('Invalid input');
  });

  it('flags a warmup that is not the previous calendar day', () => {
    const input = { ...inputFromExample(example), previousDate: '2025-10-10' };
    expect(validateInput(input)['previousDate']).toMatch(
      /previous calendar day/,
    );
  });

  it('does not run when the form has errors', () => {
    const input = {
      ...inputFromExample(example),
      allocation: ['1', '0', '0', '0', '0'],
    };
    const onRun = vi.fn();
    render(
      <CalculatorForm
        input={input}
        onChange={vi.fn()}
        running={false}
        onRun={onRun}
      />,
    );
    fireEvent.submit(document.getElementById('strategy-calculator')!);
    expect(onRun).not.toHaveBeenCalled();
    expect(screen.getByText(/Total is/)).toBeInTheDocument();
  });

  it('surfaces per-index allocation errors', () => {
    const input = {
      ...inputFromExample(example),
      allocation: ['bad', '25', '25', '25', '25'],
    };
    render(
      <CalculatorForm
        input={input}
        onChange={vi.fn()}
        running={false}
        onRun={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('BTC allocation percent')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('renders the undeployed answer without a submitted result', async () => {
    const { mockClient } =
      await import('@/lib/verifiable-strategy/__tests__/fixtures');
    const input = inputFromExample(example);
    const result = await runCalculator(input, dataset, mockClient().client);
    render(
      <ContractAnswer
        result={result}
        submitted={null}
        example={example}
        data={dataset}
        stale={false}
        historical={false}
        running={false}
        disabled={false}
        error=""
      />,
    );
    expect(screen.getByText(/allocation stays as entered/)).toBeInTheDocument();
  });

  it('marks an unparseable last-exit date as invalid', () => {
    const input = inputFromExample(example);
    const onChange = vi.fn();
    render(
      <CalculatorForm
        input={input}
        onChange={onChange}
        running={false}
        onRun={vi.fn()}
      />,
    );
    // 1970-01-01 is a valid calendar date for the date input but epochDay
    // rejects it (ms <= 0), exercising the catch that marks the field invalid.
    fireEvent.change(screen.getByLabelText('Last exit executed'), {
      target: { value: '1970-01-01' },
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ lastExecutedDay: -1 }),
    );
  });
});
