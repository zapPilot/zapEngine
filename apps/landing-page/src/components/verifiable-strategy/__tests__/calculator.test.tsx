import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { StrategyCalculator } from '../StrategyCalculator';
import CalculatorPage from '@/app/track-record/calculator/page';
import {
  dataset,
  example,
  mockClient,
} from '@/lib/verifiable-strategy/__tests__/fixtures';
import { inputFromExample } from '@/lib/verifiable-strategy/encoding';
import { runCalculator } from '@/lib/verifiable-strategy/onchain';
import { ContractAnswer } from '../ContractAnswer';
import { CalculatorForm } from '../CalculatorForm';

const state = vi.hoisted(() => ({ query: new URLSearchParams(), fail: false }));
vi.mock('next/navigation', () => ({ useSearchParams: () => state.query }));
vi.mock('@/lib/verifiable-strategy/onchain', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/verifiable-strategy/onchain')>();
  return {
    ...actual,
    calculatorClient: () => mockClient().client,
    runCalculator: (
      input: Parameters<typeof actual.runCalculator>[0],
      data: Parameters<typeof actual.runCalculator>[1],
    ) =>
      actual.runCalculator(
        input,
        data,
        mockClient({ fail: state.fail }).client,
      ),
  };
});
beforeEach(() => {
  state.query = new URLSearchParams();
  state.fail = false;
});
afterEach(cleanup);

it('always identifies the research slice and shows honest undeployed state', () => {
  render(<CalculatorPage />);
  expect(
    screen.getByText(
      /Research slice: 1 of 6 rules, not the production strategy/,
    ),
  ).toBeInTheDocument();
  expect(screen.getByText(/Contract not deployed yet/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Call contract' })).toBeDisabled();
  expect(screen.getByLabelText('BTC price on decision day')).not.toHaveValue(
    '',
  );
});
it('runs the default example, shows match, and labels stale outputs after edits', async () => {
  render(<StrategyCalculator data={dataset} />);
  await screen.findByText(/Codehash matches/);
  fireEvent.click(screen.getByRole('button', { name: 'Call contract' }));
  await screen.findByText('✓ Same result as the Python backtest');
  const before = screen.getAllByText(/cast call/)[1]!.textContent;
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Copy warmup cast command' }),
  );
  await screen.findByText('Copied');
  fireEvent.change(screen.getByLabelText('BTC price on decision day'), {
    target: { value: '89' },
  });
  expect(
    screen.getByText('Previous answer — inputs changed'),
  ).toBeInTheDocument();
  expect(
    screen.queryByText('✓ Same result as the Python backtest'),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Call contract' }));
  await screen.findByText(
    'Custom inputs, so there is no historical comparison.',
  );
  expect(screen.getAllByText(/cast call/)[1]!.textContent).not.toBe(before);
  fireEvent.click(screen.getByRole('button', { name: 'Restore real inputs' }));
  expect(screen.getByLabelText('BTC price on decision day')).toHaveValue(
    '90.00',
  );
});
it('selects the date query and displays errors without a historical match', async () => {
  state.query = new URLSearchParams('date=2025-10-19');
  render(<StrategyCalculator data={dataset} />);
  expect(
    screen.getByText(
      /No verified historical example is available for 2025-10-19/,
    ),
  ).toBeInTheDocument();
  cleanup();
  state.query = new URLSearchParams('date=2025-10-18');
  state.fail = true;
  render(<StrategyCalculator data={dataset} />);
  fireEvent.click(screen.getByRole('button', { name: 'Call contract' }));
  await screen.findByRole('alert');
  expect(screen.queryByText(/Matches the published/)).not.toBeInTheDocument();
});
it('exposes explicit state and allows editing allocations and touch mode', () => {
  const onChange = vi.fn();
  const input = {
    ...inputFromExample(example),
    stateMode: 'explicit' as const,
  };
  render(
    <CalculatorForm
      input={input}
      onChange={onChange}
      running={false}
      onRun={vi.fn()}
    />,
  );
  expect(
    screen.getByText('This example requires explicit historical state.'),
  ).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('BTC allocation percent'), {
    target: { value: '24' },
  });
  expect(onChange.mock.calls[0]![0].allocation[0]).toBe('24');
  fireEvent.click(screen.getByRole('switch'));
  expect(onChange.mock.calls[1]![0].crossOnTouch).toBe(false);
});
it('does not claim a match for cooldown or unmatched candidates', async () => {
  const result = await runCalculator(inputFromExample(example), dataset);
  result.exit.cooled_off = true;
  result.exit.remaining_days = 3;
  render(
    <ContractAnswer
      result={result}
      submitted={inputFromExample(example)}
      example={example}
      data={dataset}
      stale={false}
      historical={true}
      running={false}
      disabled={false}
      error=""
    />,
  );
  expect(screen.getByText(/The exit rule is cooling down/)).toBeInTheDocument();
  expect(
    screen.getByText('Does not match the published decision.'),
  ).toBeInTheDocument();
});

it('edits all scenarios before deployment, validates fields, and never calls', () => {
  render(<StrategyCalculator data={{ ...dataset, deployment: null }} />);
  fireEvent.click(
    screen.getByRole('button', { name: 'BTC holds above its average' }),
  );
  expect(screen.getByLabelText('BTC price on decision day')).toHaveValue(
    '101.00',
  );
  expect(screen.getByRole('img', { name: /BTC: yesterday/ })).toHaveAttribute(
    'aria-label',
    expect.stringContaining('today +1.00%'),
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Exit rule cooling down' }),
  );
  expect(screen.getByLabelText('Last exit executed')).toHaveValue('2025-10-08');
  fireEvent.click(
    screen.getByRole('button', { name: 'BTC closes on its average' }),
  );
  expect(screen.getByLabelText('BTC price on decision day')).toHaveValue(
    '100.00',
  );
  fireEvent.change(screen.getByLabelText('BTC price on decision day'), {
    target: { value: '1.0000000000000000001' },
  });
  expect(screen.getByLabelText('BTC price on decision day')).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  expect(
    screen.getByLabelText('BTC price on decision day'),
  ).toHaveAccessibleDescription(/18 places/);
  fireEvent.change(screen.getByLabelText('BTC allocation percent'), {
    target: { value: '24.5' },
  });
  expect(screen.getByText('Total is 99.5%, must be 100%')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Restore real inputs' }));
  expect(screen.getByLabelText('BTC price on decision day')).toHaveValue(
    '90.00',
  );
  expect(screen.getByRole('button', { name: 'Call contract' })).toBeDisabled();
  fireEvent.submit(document.getElementById('strategy-calculator')!);
  expect(screen.queryByText(/Same result/)).not.toBeInTheDocument();
});
it('derives the previous day from the decision day and submits edits', async () => {
  render(<StrategyCalculator data={dataset} />);
  fireEvent.change(screen.getByLabelText('Decision day'), {
    target: { value: '2025-10-19' },
  });
  expect(screen.getAllByText('Oct 19')).toHaveLength(3);
  expect(screen.getAllByText('Oct 18')).toHaveLength(3);
  fireEvent.change(screen.getByLabelText('Decision day'), {
    target: { value: '' },
  });
  expect(screen.getByLabelText('Decision day')).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  expect(screen.getByRole('button', { name: 'Call contract' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Decision day'), {
    target: { value: '2025-10-19' },
  });
  fireEvent.change(screen.getByLabelText('Last exit executed'), {
    target: { value: '2025-10-10' },
  });
  fireEvent.submit(document.getElementById('strategy-calculator')!);
  await screen.findByText(
    'Custom inputs, so there is no historical comparison.',
  );
});
it('shows full precision while editing and rounds at rest', () => {
  render(<StrategyCalculator data={{ ...dataset, deployment: null }} />);
  const cell = screen.getByLabelText('BTC 200-day average on previous day');
  fireEvent.change(cell, { target: { value: '107535.29506345' } });
  expect(cell).toHaveValue('107,535.30');
  fireEvent.focus(cell);
  expect(cell).toHaveValue('107535.29506345');
  fireEvent.blur(cell);
  expect(cell).toHaveValue('107,535.30');
  expect(screen.getByText('Python backtest on 2025-10-18')).toBeInTheDocument();
});
it('copies the full codehash with an accessible failure fallback', async () => {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockRejectedValue(new Error('Denied')) },
  });
  render(<StrategyCalculator data={{ ...dataset, deployment: null }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Copy codehash' }));
  await screen.findByRole('button', { name: 'Select codehash to copy' });
  vi.mocked(navigator.clipboard.writeText).mockResolvedValue(undefined);
  fireEvent.click(
    screen.getByRole('button', { name: 'Select codehash to copy' }),
  );
  await screen.findByRole('button', { name: 'Copied' });
  expect(navigator.clipboard.writeText).toHaveBeenLastCalledWith(
    dataset.runtimeCodehash,
  );
});
