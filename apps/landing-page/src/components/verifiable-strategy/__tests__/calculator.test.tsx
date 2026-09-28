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
import { AllocationResult } from '../AllocationResult';
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
    screen.getByText(/Research slice · 1 of 6 rules · Not production/),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('heading', { name: 'Not deployed yet' }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Run on-chain calculation' }),
  ).not.toBeInTheDocument();
});
it('runs the default example, shows match, and clears stale outputs after edits', async () => {
  render(<StrategyCalculator data={dataset} />);
  await screen.findByText(/Codehash matches/);
  fireEvent.click(
    screen.getByRole('button', { name: 'Run on-chain calculation' }),
  );
  await screen.findByText('Matches the published 2025-10-18 decision ✓');
  const before = screen.getAllByText(/cast call/)[1]!.textContent;
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Copy warmup cast command' }),
  );
  await screen.findByText('Copied');
  fireEvent.change(screen.getByLabelText('current BTC price'), {
    target: { value: '89' },
  });
  expect(
    screen.queryByText('Matches the published 2025-10-18 decision ✓'),
  ).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole('button', { name: 'Run on-chain calculation' }),
  );
  await screen.findByText('Custom inputs — no historical-match claim.');
  expect(screen.getAllByText(/cast call/)[1]!.textContent).not.toBe(before);
  fireEvent.click(
    screen.getByRole('button', { name: 'Restore historical inputs' }),
  );
  expect(screen.getByLabelText('current BTC price')).toHaveValue('90');
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
  fireEvent.click(
    screen.getByRole('button', { name: 'Run on-chain calculation' }),
  );
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
  fireEvent.click(screen.getByRole('checkbox'));
  expect(onChange.mock.calls[1]![0].crossOnTouch).toBe(false);
});
it('does not claim a match for cooldown or unmatched candidates', async () => {
  const result = await runCalculator(inputFromExample(example), dataset);
  result.exit.cooled_off = true;
  result.exit.remaining_days = 3;
  render(<AllocationResult result={result} example={example} edited={false} />);
  expect(screen.getByText(/No executable exit/)).toBeInTheDocument();
  expect(
    screen.getByText('Does not match the published decision.'),
  ).toBeInTheDocument();
});
